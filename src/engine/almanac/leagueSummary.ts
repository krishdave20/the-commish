/* A light summary of one followed league for the multi-league dashboard: your record, where you stand and this week's matchup, worked from
   the league's rosters, users and one week of matchups. No model, no simulation: it has to be cheap enough to run for every league on a phone. */
import type { LeagueStatus, LeagueUser, SleeperLeague, SleeperRoster } from '../../data';
import type { Matchup, ProjectionRow } from '../../data/types.ts';
import { makeScorer } from '../model.ts';

export interface SummaryTeam { rid: number; team: string; manager: string }

export interface LeagueStanding {
  /** 1 is first */
  rank: number;
  of: number;
  playoffTeams: number;
  inPlayoffs: boolean;
  /** how many wins you are ahead of the first team outside the line (in), or behind the last team inside it (out) */
  winsFromLine: number;
}

export interface SideSummary { team: string; manager: string; points: number; projected: number | null }

export interface MatchupSummary {
  week: number;
  me: SideSummary;
  opp: SideSummary | null;
  /** any points have been scored this week */
  started: boolean;
  /** you are ahead on points (null before anyone has scored, on a tie, or on a bye) */
  leading: boolean | null;
}

export interface LeagueSummary {
  leagueId: string;
  name: string;
  season: string;
  status: LeagueStatus;
  me: (SummaryTeam & { wins: number; losses: number; ties: number; pf: number }) | null;
  standing: LeagueStanding | null;
  matchup: MatchupSummary | null;
}

export interface SummaryInput {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: LeagueUser[];
  userId: string;
  /** this week's matchups (null: none to show, as in the offseason) */
  matchups: Matchup[] | null;
  week: number;
  /** this week's player projections, for a pregame number */
  projections?: readonly ProjectionRow[] | null;
}

const mine = (r: SleeperRoster, userId: string) => r.owner_id === userId || !!r.co_owners?.includes(userId);
const pf = (r: SleeperRoster) => (r.settings.fpts ?? 0) + (r.settings.fpts_decimal ?? 0) / 100;
const wins = (r: SleeperRoster | undefined) => (r?.settings.wins ?? 0) + (r?.settings.ties ?? 0) / 2;

/** Wins (a tie is half), then points for. The order Sleeper lists a league without divisions. */
function ranked(rosters: readonly SleeperRoster[]): SleeperRoster[] {
  return rosters.slice().sort((a, b) => wins(b) - wins(a) || pf(b) - pf(a) || a.roster_id - b.roster_id);
}

export function standingOf(rosters: readonly SleeperRoster[], rid: number, playoffTeams: number): LeagueStanding | null {
  const order = ranked(rosters);
  const i = order.findIndex((r) => r.roster_id === rid);
  if (i < 0) return null;
  const line = Math.max(0, Math.min(playoffTeams, order.length));
  const inPlayoffs = i < line;
  // in: ahead of the first team outside; out: behind the last team inside
  const other = inPlayoffs ? order[line] : order[line - 1];
  return { rank: i + 1, of: order.length, playoffTeams: line, inPlayoffs, winsFromLine: other ? Math.abs(wins(order[i]) - wins(other)) : 0 };
}

/** A lineup's projected points: each starter's projection, scored with the league's own settings. Null when no starter has a projection. */
export function projectedLineup(starters: readonly string[] | undefined, rows: readonly ProjectionRow[] | null | undefined, scoring: Record<string, number>): number | null {
  if (!starters?.length || !rows?.length) return null;
  const score = makeScorer(scoring);
  const by = new Map(rows.map((r) => [r.player_id, r] as const));
  let total = 0, found = 0;
  for (const pid of starters) {
    const row = by.get(pid);
    if (!row) continue;
    total += score(row.stats);
    found++;
  }
  return found ? Math.round(total * 100) / 100 : null;
}

export function summarizeLeague(i: SummaryInput): LeagueSummary {
  const { league, rosters, users, userId } = i;
  const nameOf = (r: SleeperRoster): SummaryTeam => {
    const u = users.find((x) => x.user_id === r.owner_id);
    return { rid: r.roster_id, team: u?.metadata?.team_name || u?.display_name || `team ${r.roster_id}`, manager: u?.display_name ?? 'open team' };
  };
  const base = { leagueId: league.league_id, name: league.name, season: league.season, status: league.status };
  const roster = rosters.find((r) => mine(r, userId));
  if (!roster) return { ...base, me: null, standing: null, matchup: null };
  const me = { ...nameOf(roster), wins: roster.settings.wins ?? 0, losses: roster.settings.losses ?? 0, ties: roster.settings.ties ?? 0, pf: pf(roster) };
  const standing = standingOf(rosters, roster.roster_id, Number(league.settings.playoff_teams) || 0);

  let matchup: MatchupSummary | null = null;
  const row = i.matchups?.find((m) => m.roster_id === roster.roster_id);
  if (row) {
    const opRow = row.matchup_id != null ? i.matchups!.find((m) => m.matchup_id === row.matchup_id && m.roster_id !== row.roster_id) : undefined;
    const opRoster = opRow ? rosters.find((r) => r.roster_id === opRow.roster_id) : undefined;
    const scoring = league.scoring_settings ?? {};
    const side = (m: Matchup, n: SummaryTeam): SideSummary => ({ team: n.team, manager: n.manager, points: m.points ?? 0, projected: projectedLineup(m.starters, i.projections, scoring) });
    const started = (row.points ?? 0) > 0 || (opRow?.points ?? 0) > 0;
    matchup = {
      week: i.week, me: side(row, nameOf(roster)),
      opp: opRow && opRoster ? side(opRow, nameOf(opRoster)) : null,
      started,
      leading: started && opRow && row.points !== opRow.points ? row.points > opRow.points : null,
    };
  }
  return { ...base, me, standing, matchup };
}
