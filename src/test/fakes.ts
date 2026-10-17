import { vi } from 'vitest';
import type { LoadModel } from '../app/loadModel';
import { handModel } from '../engine/test-helpers';
import type { Model } from '../engine';
import type {
  AccountStore, CacheStats, DataApi, Fetched, HealthResult, LeagueBundle, LinkedAccount,
  NflState, SleeperLeague, SleeperUser,
} from '../data/contract';

/* In-memory stand-ins for DataApi and AccountStore, built from a small invented league.
   Names and ids are generic; nothing here comes from a real league. */

/** Fri, Oct 16, 2026, 4:05 PM local time */
export const FAKE_AS_OF = new Date(2026, 9, 16, 16, 5).getTime();

export const sampleNflState: NflState = {
  week: 6,
  display_week: 6,
  season: '2026',
  season_type: 'regular',
  league_season: '2026',
  previous_season: '2025',
  season_start_date: '2026-09-10',
};

export const sampleUser: SleeperUser = {
  user_id: 'u1',
  username: 'sampleuser',
  display_name: 'Sam Sample',
  avatar: null,
};

function makeLeague(id: string, name: string, season: string, type: number, rec: number): SleeperLeague {
  return {
    league_id: id,
    name,
    season,
    status: 'in_season',
    total_rosters: 6,
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'],
    scoring_settings: { rec, pass_td: 4 },
    settings: { playoff_week_start: 15, playoff_teams: 4, divisions: 2, waiver_budget: 100, type },
    previous_league_id: null,
    draft_id: `${id}-draft`,
    avatar: null,
    metadata: { division_1: 'North', division_2: 'South' },
  };
}

export const sampleLeague: SleeperLeague = makeLeague('L1', 'Sample League', '2026', 0, 1);
export const sampleKeeperLeague: SleeperLeague = makeLeague('L2', 'Half Point Keepers', '2026', 1, 0.5);
export const samplePriorLeague: SleeperLeague = makeLeague('L0', 'Sample League', '2025', 2, 0);

const names: Array<[string, string, string | undefined]> = [
  ['u1', 'Sam Sample', 'Sunday Scaries'],
  ['u2', 'Riley Reed', 'Reed Between the Lines'],
  ['u3', 'Jordan Hale', undefined],
  ['u4', 'Casey Moore', 'Fourth and Long'],
  ['u5', 'Taylor Quinn', 'Quinn Tessential'],
  ['u6', 'Morgan Ellis', 'Hail Mary Club'],
];

// [wins, losses, fpts, fpts_decimal, pa, pa_decimal, division]
const records: Array<[number, number, number, number, number, number, number]> = [
  [4, 2, 612, 40, 540, 10, 1],
  [5, 1, 640, 5, 500, 55, 1],
  [3, 3, 580, 90, 590, 20, 1],
  [3, 3, 601, 15, 575, 0, 2],
  [2, 4, 540, 60, 610, 85, 2],
  [1, 5, 498, 25, 640, 5, 2],
];

export function sampleBundle(league: SleeperLeague = sampleLeague): LeagueBundle {
  return {
    league,
    users: names.map(([user_id, display_name, team_name]) => ({
      user_id,
      display_name,
      avatar: null,
      metadata: team_name ? { team_name } : null,
    })),
    rosters: records.map(([wins, losses, fpts, fpts_decimal, pa, pad, division], i) => ({
      roster_id: i + 1,
      owner_id: `u${i + 1}`,
      co_owners: null,
      players: [],
      starters: [],
      reserve: null,
      settings: {
        wins, losses, ties: 0, fpts, fpts_decimal, fpts_against: pa, fpts_against_decimal: pad, division,
      },
    })),
    drafts: [{
      draft_id: `${league.league_id}-draft`,
      league_id: league.league_id,
      season: league.season,
      status: 'complete',
      type: 'snake',
      start_time: null,
      settings: {},
      draft_order: null,
    }],
    tradedPicks: [],
  };
}

export const sampleHealth: HealthResult[] = [
  ...Array.from({ length: 3 }, (_, i): HealthResult => ({
    id: `ok-${i}`,
    label: `Sleeper endpoint ${i + 1}`,
    url: `https://api.example.test/ok/${i}`,
    documented: true,
    source: 'sleeper',
    level: 'ok',
    httpStatus: 200,
    ms: 120 + i,
    bytes: 2048,
    message: 'Reachable and the shape matches.',
    checkedAt: FAKE_AS_OF,
  })),
  {
    id: 'stats', label: 'Weekly stats', url: 'https://api.example.test/stats', documented: false, source: 'sleeper',
    level: 'warn', httpStatus: 200, ms: 340, bytes: 1_500_000, message: 'Reachable, but one field is missing.', checkedAt: FAKE_AS_OF,
  },
  {
    id: 'pbp', label: 'Play-by-play', url: 'https://example.test/pbp', documented: true, source: 'nflverse',
    level: 'fail', httpStatus: null, ms: 15, bytes: 0, message: 'Blocked by CORS; play-by-play panels stay unavailable.', checkedAt: FAKE_AS_OF,
  },
];

export interface FakeApiOptions {
  /** usernames (lower case) that exist */
  users?: Record<string, SleeperUser>;
  leaguesBySeason?: Record<string, SleeperLeague[]>;
  bundles?: Record<string, LeagueBundle>;
  nflState?: NflState;
  health?: HealthResult[];
  cache?: CacheStats;
}

export type FakeApi = {
  [K in keyof DataApi]: ReturnType<typeof vi.fn<DataApi[K]>>;
};

function fetched<T>(data: T): Fetched<T> {
  return { data, asOf: FAKE_AS_OF, fromCache: false, stale: false };
}

export function createFakeApi(opts: FakeApiOptions = {}): FakeApi {
  const users = opts.users ?? { sampleuser: sampleUser };
  const leaguesBySeason = opts.leaguesBySeason ?? { '2026': [sampleLeague, sampleKeeperLeague], '2025': [samplePriorLeague] };
  const bundles = opts.bundles ?? {
    L1: sampleBundle(sampleLeague),
    L2: sampleBundle(sampleKeeperLeague),
    L0: sampleBundle(samplePriorLeague),
  };
  let cache: CacheStats = opts.cache ?? {
    totalBytes: 4096 + 1_258_291,
    quotaBytes: 500 * 1024 * 1024,
    entries: [
      { key: 'sleeper:state:nfl', bytes: 4096, fetchedAt: FAKE_AS_OF },
      { key: 'sleeper:league:L1', bytes: 1_258_291, fetchedAt: FAKE_AS_OF },
    ],
  };
  const nflState = opts.nflState ?? sampleNflState;

  return {
    nflState: vi.fn<DataApi['nflState']>(async () => fetched(nflState)),
    user: vi.fn<DataApi['user']>(async (name) => users[name.toLowerCase()] ?? null),
    userLeagues: vi.fn<DataApi['userLeagues']>(async (_userId, season) => fetched(leaguesBySeason[season] ?? [])),
    leagueBundle: vi.fn<DataApi['leagueBundle']>(async (id) => {
      const b = bundles[id];
      if (!b) throw new Error(`No league ${id}`);
      return fetched(b);
    }),
    healthChecks: vi.fn<DataApi['healthChecks']>(async () => opts.health ?? sampleHealth),
    cacheStats: vi.fn<DataApi['cacheStats']>(async () => cache),
    clearCache: vi.fn<DataApi['clearCache']>(async () => {
      cache = { totalBytes: 0, entries: [], quotaBytes: cache.quotaBytes };
    }),
  };
}

export interface FakeAccountStore extends AccountStore {
  upsert: ReturnType<typeof vi.fn<AccountStore['upsert']>>;
  setActive: ReturnType<typeof vi.fn<AccountStore['setActive']>>;
  remove: ReturnType<typeof vi.fn<AccountStore['remove']>>;
}

export function sampleAccount(overrides: Partial<LinkedAccount> = {}): LinkedAccount {
  return {
    userId: 'u1',
    username: 'sampleuser',
    displayName: 'Sam Sample',
    avatar: null,
    leagueIds: ['L1'],
    activeLeagueId: 'L1',
    addedAt: FAKE_AS_OF,
    ...overrides,
  };
}

export function createFakeAccountStore(initial: LinkedAccount[] = [], activeId: string | null = initial[0]?.userId ?? null): FakeAccountStore {
  let list = [...initial];
  let active = activeId;
  const listeners = new Set<() => void>();
  const emit = () => { for (const l of listeners) l(); };

  return {
    list: () => [...list],
    active: () => list.find((a) => a.userId === active) ?? null,
    upsert: vi.fn<AccountStore['upsert']>((acc) => {
      list = list.some((a) => a.userId === acc.userId)
        ? list.map((a) => (a.userId === acc.userId ? acc : a))
        : [...list, acc];
      emit();
    }),
    setActive: vi.fn<AccountStore['setActive']>((userId) => {
      if (list.some((a) => a.userId === userId)) active = userId;
      emit();
    }),
    setActiveLeague: (userId, leagueId) => {
      list = list.map((a) => (a.userId === userId ? { ...a, activeLeagueId: leagueId } : a));
      emit();
    },
    remove: vi.fn<AccountStore['remove']>((userId) => {
      list = list.filter((a) => a.userId !== userId);
      if (active === userId) active = list[0]?.userId ?? null;
      emit();
    }),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

/* ---------- an engine model for the M2 pages ---------- */

/** A 4-team league mid-season (week 5 of 8): 3 slots (QB, RB, WR), 2 playoff teams, a free agent who would help
    in every window and one who only helps in week 6. Fresh object on every call. */
export function sampleModel(): Model {
  const m = handModel({
    cur: 5, last: 8, slots: ['QB', 'RB', 'WR'], playoffTeams: 2, divisions: 0, sd: 20, meRid: 1,
    teams: [
      { rid: 1, name: 'Sunday Scaries', wins: 3, losses: 1, pf: 420, starters: ['t1qb', 't1rb', 't1wr'] },
      { rid: 2, name: 'Reed Between the Lines', wins: 2, losses: 2, pf: 400 },
      { rid: 3, name: 'Fourth and Long', wins: 2, losses: 2, pf: 390 },
      { rid: 4, name: 'Hail Mary Club', wins: 1, losses: 3, pf: 370 },
    ],
    players: [
      { pid: 't1qb', pos: 'QB', mu: 20, owner: 1, name: 'Alex Arm', seasonAvg: 19.5 },
      { pid: 't1rb', pos: 'RB', mu: 15, owner: 1, name: 'Rex Runner', seasonAvg: 14 },
      { pid: 't1wr', pos: 'WR', mu: 12, owner: 1, name: 'Walt Wideout', seasonAvg: 11 },
      { pid: 't1bw', pos: 'WR', mu: 6, owner: 1, name: 'Backup Wideout', seasonAvg: 5 },
      { pid: 't2qb', pos: 'QB', mu: 19, owner: 2, name: 'Quinn Quarterback' },
      { pid: 't2rb', pos: 'RB', mu: 14, owner: 2, name: 'Ray Rusher' },
      { pid: 't2wr', pos: 'WR', mu: 13, owner: 2, name: 'Reed Receiver' },
      { pid: 't3qb', pos: 'QB', mu: 17, owner: 3, name: 'Tom Thrower' },
      { pid: 't3rb', pos: 'RB', mu: 13, owner: 3, name: 'Rob Rusher' },
      { pid: 't3wr', pos: 'WR', mu: 10, owner: 3, name: 'Will Winger' },
      { pid: 't4qb', pos: 'QB', mu: 15, owner: 4, name: 'Ted Tosser' },
      { pid: 't4rb', pos: 'RB', mu: 10, owner: 4, name: 'Rick Runner' },
      { pid: 't4wr', pos: 'WR', mu: 8, owner: 4, name: 'Wade Wideout' },
      { pid: 'fa1', pos: 'WR', mu: 16, owner: 0, name: 'Free Agent Fran', adds72h: 12400 },
      { pid: 'fa2', pos: 'RB', mu: (w) => (w === 6 ? 25 : 5), owner: 0, name: 'Wire Runner' },
    ],
    games: [
      [5, 1, 2], [5, 3, 4], [6, 1, 3], [6, 2, 4], [7, 1, 4], [7, 2, 3], [8, 1, 2], [8, 3, 4],
    ],
  });
  m.meta.leagueId = 'L1';
  m.meta.leagueName = 'Sample League';
  const bw = m.players.find((p) => p.pid === 't1bw');
  if (bw) bw.injury = 'Questionable';
  const pairs: Array<Array<[number, number]>> = [
    [[1, 2], [3, 4]], [[1, 3], [2, 4]], [[1, 4], [2, 3]], [[1, 2], [3, 4]],
  ];
  m.history = pairs.flatMap((games, i) => games.flatMap(([a, b]) => {
    const week = i + 1;
    const pa = 100 + a * 6 + week, pb = 100 + b * 3 + week;
    return [
      { key: `${week}-${a}`, week, rid: a, opp: b, pts: pa, oppPts: pb, final: true },
      { key: `${week}-${b}`, week, rid: b, opp: a, pts: pb, oppPts: pa, final: true },
    ];
  }));
  m.ideas = [{
    idea: 1, givePid: 't1bw', give: 'Backup Wideout', getPid: 't2wr', get: 'Reed Receiver', partnerRid: 2,
    partner: 'Reed Between the Lines', myGain: 3.2, theirGain: 1.1, startsForMe: 3,
  }];
  return m;
}

export function sampleLoadModel(model: () => Model = sampleModel): LoadModel {
  return async () => ({ model: model(), asOf: FAKE_AS_OF, stale: false });
}
