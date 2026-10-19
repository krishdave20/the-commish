/* Follow a league back through its past seasons (`previous_league_id`, at most 15, loop-guarded) and load what the almanac needs from each:
   league settings, users, rosters, every regular-season week's matchups, the playoff weeks' matchups, and the winners and losers brackets.
   A finished season never changes: it is fetched fresh once, saved whole in the cache (30 days) and then costs no requests. The season in
   progress keeps the endpoints' own freshness. Every call goes through the shared Sleeper client, so the shared limiter paces it. */
import type { Fetched, SleeperClient, SleeperLeague } from '../../data';
import type { Matchup } from '../../data/types.ts';
import { roundWeeks } from '../bracket/template.ts';
import type { HistoryData, SeasonData, SeasonRoster, SeasonUser } from './types.ts';

export const MAX_SEASONS = 15;
/** a finished season is final: its saved copy stays good for a month */
export const FINAL_TTL = 30 * 24 * 3_600_000;

type Client = Pick<SleeperClient, 'league' | 'rosters' | 'users' | 'matchups' | 'winnersBracket' | 'losersBracket'>
  & Partial<Pick<SleeperClient, 'recall' | 'keep'>>;

/** bump when the shape of SeasonData changes, so older saved seasons are rebuilt */
const SAVED = 'almanac:season:v2:';

export interface LoadOpts {
  /** refetch the season in progress (finished seasons keep their month-long copy) */
  force?: boolean;
  max?: number;
  /** told as each season is reached: its year and how many are loaded so far */
  onProgress?: (p: { season: string; done: number }) => void;
}

const none = (id: string | null | undefined) => !id || id === '0';
const pts = (whole: number | undefined, dec: number | undefined) => (whole ?? 0) + (dec ?? 0) / 100;

/** The last regular-season week whose result is final: the whole regular season for a finished league, else Sleeper's `last_scored_leg`. */
export function throughWeekOf(league: Pick<SleeperLeague, 'status' | 'settings'>): number {
  const start = Number(league.settings.playoff_week_start) || 15;
  const lastReg = Math.max(0, start - 1);
  if (league.status === 'complete') return lastReg;
  if (league.status !== 'in_season') return 0;
  const scored = Number(league.settings.last_scored_leg);
  const leg = Number(league.settings.leg);
  const done = Number.isFinite(scored) && scored >= 0 ? scored : Number.isFinite(leg) && leg > 0 ? leg - 1 : 0;
  return Math.max(0, Math.min(lastReg, done));
}

export async function loadHistory(sleeper: Client, league: SleeperLeague, o: LoadOpts = {}): Promise<Fetched<HistoryData>> {
  const seasons: SeasonData[] = [];
  const parts: Array<Pick<Fetched<unknown>, 'asOf' | 'fromCache' | 'stale' | 'error'>> = [];
  const seen = new Set<string>();
  let error: string | undefined;
  let next: SleeperLeague | null = league;
  while (next && seasons.length < (o.max ?? MAX_SEASONS) && !seen.has(next.league_id)) {
    seen.add(next.league_id);
    o.onProgress?.({ season: next.season, done: seasons.length });
    try {
      seasons.push(await loadSeason(sleeper, next, o, parts));
    } catch (e) {
      // the newest season failing is the page's failure; an older one ends the chain
      if (!seasons.length) throw e;
      error = e instanceof Error ? e.message : String(e);
      break;
    }
    const prev = next.previous_league_id;
    if (none(prev) || seen.has(prev!)) break;
    try {
      const f = await sleeper.league(prev!);
      parts.push(f);
      next = f.data;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  seasons.reverse();
  return {
    data: { seasons, error },
    asOf: parts.length ? Math.min(...parts.map((p) => p.asOf)) : Date.now(),
    fromCache: parts.length > 0 && parts.every((p) => p.fromCache),
    stale: parts.some((p) => p.stale),
    error: error ?? parts.find((p) => p.error)?.error,
  };
}

type Parts = Array<Pick<Fetched<unknown>, 'asOf' | 'fromCache' | 'stale' | 'error'>>;

/** The matchup rows the almanac reads, and only the starters' points (the bench is never a record). */
function slim(m: Matchup): Matchup {
  const starters = (m.starters ?? []).filter((p) => p && p !== '0');
  const pp: Record<string, number> = {};
  for (const p of starters) if (typeof m.players_points?.[p] === 'number') pp[p] = m.players_points[p]!;
  return { roster_id: m.roster_id, matchup_id: m.matchup_id, points: m.points, starters, players_points: pp };
}

/** One season. A finished season never changes: it is saved whole (see `keep`) and, once saved, costs no requests. */
async function loadSeason(sleeper: Client, league: SleeperLeague, o: LoadOpts, parts: Parts): Promise<SeasonData> {
  const complete = league.status === 'complete';
  if (complete && sleeper.recall) {
    const saved = await sleeper.recall<SeasonData>(SAVED + league.league_id, FINAL_TTL).catch(() => null);
    if (saved && saved.leagueId === league.league_id && saved.complete) {
      parts.push({ asOf: Date.now(), fromCache: true, stale: false });
      return saved;
    }
  }
  // a finished season is fetched fresh once (a copy cached while it was still being played may be partial), then saved
  const data = await fetchSeason(sleeper, league, complete ? { force: true } : { force: o.force }, parts);
  if (complete && sleeper.keep && !data.missingWeeks.length) await sleeper.keep(SAVED + league.league_id, data).catch(() => undefined);
  return data;
}

async function fetchSeason(sleeper: Client, league: SleeperLeague, f: { force?: boolean }, parts: Parts): Promise<SeasonData> {
  const id = league.league_id;
  const complete = league.status === 'complete';
  const take = <T>(r: Fetched<T>): T => { parts.push(r); return r.data; };
  const [rosters, users, winners, losers] = await Promise.all([
    sleeper.rosters(id, f).then(take), sleeper.users(id, f).then(take), sleeper.winnersBracket(id, f).then(take), sleeper.losersBracket(id, f).then(take),
  ]);
  const throughWeek = throughWeekOf(league);
  const start = Number(league.settings.playoff_week_start) || 15;
  const roundType = Number(league.settings.playoff_round_type) || 0;

  // the playoff weeks that hold a played winners-bracket game
  const wanted = new Set<number>();
  const startWeek = Math.max(1, Number(league.settings.start_week) || 1);
  for (let w = startWeek; w <= throughWeek; w++) wanted.add(w);
  if (winners.some((r) => r.w != null)) {
    const rounds = Math.max(...winners.map((r) => r.r));
    const played = new Set(winners.filter((r) => r.w != null).map((r) => r.r));
    roundWeeks(rounds, { weekStart: start, roundType }).forEach((weeks, i) => { if (played.has(i + 1)) weeks.forEach((w) => wanted.add(w)); });
  }
  const matchups: Record<number, Matchup[]> = {};
  const missingWeeks: number[] = [];
  await Promise.all([...wanted].map(async (w) => {
    // the latest scored week of a season in progress may have been cached mid-game: take it fresh
    try { matchups[w] = take(await sleeper.matchups(id, w, !complete && w === throughWeek ? { ...f, force: true } : f)).map(slim); } catch { missingWeeks.push(w); }
  }));
  missingWeeks.sort((a, b) => a - b);

  const userRows: SeasonUser[] = users.map((u) => ({ userId: u.user_id, displayName: u.display_name, avatar: u.avatar ?? null, teamName: u.metadata?.team_name || null }));
  const rosterRows: SeasonRoster[] = rosters.map((r) => ({
    rid: r.roster_id, ownerId: r.owner_id ?? null,
    wins: r.settings.wins ?? 0, losses: r.settings.losses ?? 0, ties: r.settings.ties ?? 0,
    pf: pts(r.settings.fpts, r.settings.fpts_decimal), pa: pts(r.settings.fpts_against, r.settings.fpts_against_decimal),
  }));
  const wid = Number(league.metadata?.latest_league_winner_roster_id);
  return {
    leagueId: id, season: league.season, name: league.name, complete, playoffWeekStart: start, playoffRoundType: roundType, startWeek, throughWeek,
    championRid: Number.isFinite(wid) && wid > 0 ? wid : null, rosters: rosterRows, users: userRows, matchups, winners, losers, missingWeeks,
  };
}
