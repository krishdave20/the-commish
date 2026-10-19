/* Hand-built seasons for the almanac tests: four to six managers, three-week regular seasons, brackets written out. */
import { vi } from 'vitest';
import type { LeagueUser, SleeperLeague, SleeperRoster } from '../../data';
import type { BracketRow, Matchup } from '../../data/types.ts';
import type { HistoryData, SeasonData, SeasonRoster, SeasonUser } from './types.ts';

export const NAMES: Record<string, [string, string]> = {
  uA: ['Ann', 'Aces'], uB: ['Bo', 'Bears'], uC: ['Cy', 'Cats'], uD: ['Di', 'Dogs'], uE: ['Eve', 'Elks'], uF: ['Fay', 'Foxes'],
};

/** week → [roster_id, points, matchup_id] rows; `starters` adds a starter list with `players_points` to a roster's row. */
export type WeekSpec = Array<[number, number, number]>;
export interface SeasonSpec {
  leagueId: string;
  season: string;
  complete?: boolean;
  /** roster id → Sleeper user id (null: an open roster) */
  owners: Array<string | null>;
  weeks: Record<number, WeekSpec>;
  /** playoff weeks, same shape */
  playoffWeeks?: Record<number, WeekSpec>;
  throughWeek: number;
  startWeek?: number;
  playoffWeekStart?: number;
  roundType?: number;
  championRid?: number | null;
  winners?: BracketRow[];
  losers?: BracketRow[];
  /** `${week}:${rid}` → starters and their points (plus an optional bench player who must not count) */
  players?: Record<string, { starters: Record<string, number>; bench?: Record<string, number> }>;
  missingWeeks?: number[];
}

export function season(spec: SeasonSpec): SeasonData {
  const users: SeasonUser[] = [];
  const rosters: SeasonRoster[] = spec.owners.map((owner, i) => {
    if (owner && !users.some((u) => u.userId === owner)) {
      const [displayName, teamName] = NAMES[owner] ?? [owner, owner];
      users.push({ userId: owner, displayName, avatar: null, teamName });
    }
    return { rid: i + 1, ownerId: owner, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
  });
  const rows = (week: number, w: WeekSpec): Matchup[] => w.map(([rid, points, mid]) => {
    const p = spec.players?.[`${week}:${rid}`];
    return {
      roster_id: rid, matchup_id: mid, points,
      ...(p ? { starters: Object.keys(p.starters), players_points: { ...p.starters, ...p.bench } } : {}),
    };
  });
  const matchups: SeasonData['matchups'] = {};
  for (const [wk, w] of Object.entries(spec.weeks)) matchups[Number(wk)] = rows(Number(wk), w);
  for (const [wk, w] of Object.entries(spec.playoffWeeks ?? {})) matchups[Number(wk)] = rows(Number(wk), w);
  return {
    leagueId: spec.leagueId, season: spec.season, name: 'Sample League', complete: spec.complete ?? true,
    playoffWeekStart: spec.playoffWeekStart ?? 4, playoffRoundType: spec.roundType ?? 0, startWeek: spec.startWeek ?? 1, throughWeek: spec.throughWeek,
    championRid: spec.championRid ?? null, rosters, users, matchups, winners: spec.winners ?? [], losers: spec.losers ?? [],
    missingWeeks: spec.missingWeeks ?? [],
  };
}

const row = (r: number, m: number, o: Partial<BracketRow>): BracketRow => ({ r, m, t1: null, t2: null, w: null, l: null, ...o });

/** Three seasons, four people (a fifth joins in 2026), roster ids shuffled each year. See the tests for the numbers worked out by hand. */
export function threeSeasons(): HistoryData {
  const s24 = season({
    leagueId: 'S24', season: '2024', owners: ['uA', 'uB', 'uC', 'uD'], throughWeek: 3, championRid: 3,
    weeks: {
      1: [[1, 100, 1], [2, 90, 1], [3, 80, 2], [4, 70, 2]],
      2: [[1, 110, 1], [3, 60, 1], [2, 95, 2], [4, 105, 2]],
      3: [[1, 120, 1], [4, 50, 1], [2, 85, 2], [3, 130, 2]],
    },
    playoffWeeks: {
      4: [[1, 105, 1], [2, 100, 1], [3, 99, 2], [4, 88, 2]],
      5: [[1, 90, 1], [3, 140, 1], [2, 70, 2], [4, 80, 2]],
    },
    winners: [
      row(1, 1, { t1: 1, t2: 2, w: 1, l: 2 }), row(1, 2, { t1: 3, t2: 4, w: 3, l: 4 }),
      row(2, 3, { p: 1, t1: 1, t2: 3, w: 3, l: 1, t1_from: { w: 1 }, t2_from: { w: 2 } }),
      row(2, 4, { p: 3, t1: 2, t2: 4, w: 4, l: 2, t1_from: { l: 1 }, t2_from: { l: 2 } }),
    ],
    players: {
      '3:3': { starters: { p1: 45.5, p2: 30 }, bench: { bench1: 99 } },
      '1:2': { starters: { p3: 20 } },
    },
  });
  const s25 = season({
    leagueId: 'S25', season: '2025', owners: ['uB', 'uA', 'uD', 'uC'], throughWeek: 3, championRid: 2,
    weeks: {
      1: [[1, 100, 1], [2, 100, 1], [3, 90, 2], [4, 95, 2]],
      2: [[1, 80, 1], [3, 120, 1], [2, 150, 2], [4, 60, 2]],
      3: [[1, 130, 1], [4, 70, 1], [2, 100, 2], [3, 110, 2]],
    },
    playoffWeeks: { 4: [[3, 100, 1], [2, 110, 1]] },
    winners: [row(1, 1, { p: 1, t1: 3, t2: 2, w: 2, l: 3 })],
  });
  const s26 = season({
    leagueId: 'S26', season: '2026', complete: false, owners: ['uA', 'uC', 'uB', 'uE'], throughWeek: 2,
    weeks: {
      1: [[1, 160, 1], [2, 100, 1], [3, 85, 2], [4, 95, 2]],
      2: [[1, 140, 1], [3, 90, 1], [2, 100, 2], [4, 120, 2]],
    },
    players: { '1:1': { starters: { p4: 52.2 } } },
  });
  return { seasons: [s24, s25, s26] };
}

/* ---------- a Sleeper client over those seasons (the API's shapes, rebuilt from a SeasonData) ---------- */

const loaded = <T,>(data: T) => ({ data, asOf: 1_000, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 });

export function leagueOf(s: SeasonData, previous: string | null, status?: SleeperLeague['status']): SleeperLeague {
  return {
    league_id: s.leagueId, name: s.name, season: s.season, status: status ?? (s.complete ? 'complete' : 'in_season'), total_rosters: s.rosters.length,
    roster_positions: ['QB', 'RB', 'BN'], scoring_settings: { rec: 1 },
    settings: {
      playoff_week_start: s.playoffWeekStart, playoff_round_type: s.playoffRoundType, playoff_teams: 4, start_week: s.startWeek,
      ...(s.complete ? {} : { last_scored_leg: s.throughWeek, leg: s.throughWeek + 1 }),
    },
    previous_league_id: previous, draft_id: null, avatar: null, metadata: s.championRid ? { latest_league_winner_roster_id: String(s.championRid) } : null,
  };
}

export interface FakeChain {
  /** the league objects, newest first */
  leagues: SleeperLeague[];
  client: ReturnType<typeof chainClient>;
}

/** A client that serves the history's seasons as one `previous_league_id` chain (newest season = the first league). */
export function chainClient(history: HistoryData, opts: { failWeeks?: Array<[string, number]>; failLeague?: string; loop?: boolean } = {}) {
  const seasons = history.seasons.slice().sort((a, b) => Number(b.season) - Number(a.season));
  const byId = new Map(seasons.map((s) => [s.leagueId, s] as const));
  const leagues = seasons.map((s, i) => leagueOf(s, seasons[i + 1]?.leagueId ?? (opts.loop ? seasons[0]!.leagueId : null)));
  const get = (id: string) => {
    const s = byId.get(id);
    if (!s || opts.failLeague === id) throw new Error(`No league ${id}`);
    return s;
  };
  const saved = new Map<string, unknown>();
  return {
    leagues,
    saved,
    league: vi.fn(async (id: string) => { get(id); return loaded(leagues.find((l) => l.league_id === id)!); }),
    rosters: vi.fn(async (id: string, _o?: { force?: boolean }) => loaded(get(id).rosters.map((r): SleeperRoster => ({
      roster_id: r.rid, owner_id: r.ownerId, players: null, starters: null, reserve: null,
      settings: { wins: r.wins, losses: r.losses, ties: r.ties, fpts: Math.floor(r.pf), fpts_decimal: 0 },
    })))),
    users: vi.fn(async (id: string) => loaded(get(id).users.map((u): LeagueUser => ({
      user_id: u.userId, display_name: u.displayName, avatar: u.avatar, metadata: u.teamName ? { team_name: u.teamName } : null,
    })))),
    matchups: vi.fn(async (id: string, week: number, _o?: { force?: boolean }) => {
      const s = get(id);
      if (opts.failWeeks?.some(([l, w]) => l === id && w === week)) throw new Error(`week ${week} is down`);
      return loaded(s.matchups[week] ?? []);
    }),
    winnersBracket: vi.fn(async (id: string) => loaded(get(id).winners)),
    losersBracket: vi.fn(async (id: string) => loaded(get(id).losers)),
    // the real `recall` is generic over what was saved
    recall: vi.fn(async (key: string) => (saved.has(key) ? saved.get(key) : null)) as never,
    keep: vi.fn(async (key: string, data: unknown) => { saved.set(key, data); }),
  };
}

/** The same seasons with other Sleeper user ids (display and team names stay): `{ uA: 'u1' }`. For tests that need the sample league's user ids. */
export function renameUsers(h: HistoryData, ids: Record<string, string>): HistoryData {
  const id = (u: string | null) => (u && ids[u]) || u;
  return {
    ...h,
    seasons: h.seasons.map((s) => ({
      ...s,
      rosters: s.rosters.map((r) => ({ ...r, ownerId: id(r.ownerId) })),
      users: s.users.map((u) => ({ ...u, userId: id(u.userId)! })),
    })),
  };
}
