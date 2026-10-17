import { vi } from 'vitest';
import type { LoadModel } from '../app/loadModel';
import type { PlayersMap, SleeperClient, FantasyCalcRow } from '../data';
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

const line = (rec_tgt: number, rec: number, rec_yd: number, rec_td: number, pts: number) => ({
  rec_tgt, rec, rec_yd, rec_td, pts_ppr: pts, off_snp: 50, tm_off_snp: 60,
});

export function sampleLoadModel(model: () => Model = sampleModel): LoadModel {
  return async () => ({
    model: model(),
    asOf: FAKE_AS_OF,
    stale: false,
    extras: {
      stats: {
        1: { t1wr: line(8, 6, 80, 1, 20) },
        2: { t1wr: line(5, 3, 40, 0, 7) },
        3: { t1wr: line(10, 7, 90, 0, 16) },
        4: { t1qb: { pass_att: 30, pass_cmp: 20, pass_yd: 250, pass_td: 2, pts_ppr: 22 } },
      },
      scoring: { rec: 1 },
      season: '2026',
      league: sampleLeague,
    },
  });
}

/* ---------- the Sleeper client pieces the scouting report reads ---------- */

function rec(pid: string, first: string, last: string, position: string, team: string | null, extra: Record<string, unknown> = {}) {
  return {
    player_id: pid, first_name: first, last_name: last, position, team, status: team ? 'Active' : 'Inactive',
    injury_status: null, age: 25, birth_date: '2000-03-04', years_exp: 3, height: '73', weight: '210', college: 'State U',
    depth_chart_order: 1, depth_chart_position: position, ...extra,
  };
}

export const samplePlayersFile = (): PlayersMap => ({
  t1qb: rec('t1qb', 'Alex', 'Arm', 'QB', 'AAA'),
  t1rb: rec('t1rb', 'Rex', 'Runner', 'RB', 'BBB'),
  t1wr: rec('t1wr', 'Walt', 'Wideout', 'WR', 'CCC', { injury_status: 'Questionable', injury_body_part: 'Knee', college: 'Tech' }),
  t1bw: rec('t1bw', 'Backup', 'Wideout', 'WR', 'CCC', { injury_status: 'Questionable' }),
  t2wr: rec('t2wr', 'Reed', 'Receiver', 'WR', 'DDD'),
  t2qb: rec('t2qb', 'Quinn', 'Quarterback', 'QB', 'EEE'),
  fa1: rec('fa1', 'Free Agent', 'Fran', 'WR', 'FFF'),
  fa2: rec('fa2', 'Wire', 'Runner', 'RB', 'GGG'),
  x1: rec('x1', 'Old', 'Timer', 'WR', null, { status: 'Retired' }),
  x2: rec('x2', 'Walter', 'Wide', 'WR', 'HHH'),
  ol1: rec('ol1', 'Big', 'Lineman', 'OL', 'III'),
  d1: { player_id: 'd1', first_name: 'Bay', last_name: 'Defense', position: 'DEF', team: 'JJJ', status: 'Active' },
} as unknown as PlayersMap);

export const sampleFantasyCalc = (): FantasyCalcRow[] => [
  { player: { id: 1, name: 'Walt Wideout', sleeperId: 't1wr', position: 'WR' }, value: 5234, overallRank: 44, positionRank: 18, trend30Day: -150 } as FantasyCalcRow,
  { player: { id: 2, name: 'Alex Arm', sleeperId: 't1qb', position: 'QB' }, value: 7000, overallRank: 12, positionRank: 3, trend30Day: 320 } as FantasyCalcRow,
];

const loaded = <T,>(data: T) => ({ data, asOf: FAKE_AS_OF, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 });

export interface FakeSleeperOpts { fantasyCalcFails?: boolean }

/** Just `players` and `fantasyCalc`: the two calls the scouting report makes outside the engine's pull. */
export function createFakeSleeper(o: FakeSleeperOpts = {}) {
  return {
    players: vi.fn(async () => loaded(samplePlayersFile())),
    fantasyCalc: vi.fn(async () => {
      if (o.fantasyCalcFails) throw new Error('FantasyCalc is down');
      return loaded(sampleFantasyCalc());
    }),
  } as unknown as SleeperClient & { players: ReturnType<typeof vi.fn>; fantasyCalc: ReturnType<typeof vi.fn> };
}

/* ---------- nflverse output, in the shapes of src/data/nflverseTypes.ts ---------- */

import type { NflverseBundle, NflverseSource } from '../app/nflverseData';
import type { CoverageRow, NflverseManifest, UnmatchedPlayer, PlayerCounts, PlayerRates, PlayerSeason, PlayerShares, PlayerWeek } from '../data/nflverseTypes';

const ZERO_COUNTS: PlayerCounts = {
  off_snaps: 0, tm_snaps: 0, tgt: 0, rec: 0, rec_yds: 0, rec_td: 0, air_yds: 0, catchable_tgt: 0, drops: 0, ftn_tgt: 0,
  rz_tgt: 0, i10_tgt: 0, ez_tgt: 0, car: 0, rush_yds: 0, rush_td: 0, rz_car: 0, i10_car: 0, box_car: 0, stk_car: 0, stk_yds: 0,
  lgt_car: 0, lgt_yds: 0, bl_tgt: 0, bl_rec: 0, bl_yds: 0, nbl_tgt: 0, nbl_rec: 0, nbl_yds: 0, pa_tgt: 0, scr_tgt: 0, cont_tgt: 0,
  cont_rec: 0, xtd_rec: null, xtd_rush: null,
};
const NULL_SHARES: PlayerShares = {
  snap_pct: null, tgt_share: null, ay_share: null, wopr: null, rush_share: null, rz_tgt_share: null, i10_tgt_share: null,
  rz_car_share: null, i10_car_share: null,
};
const NULL_RATES: PlayerRates = {
  adot: null, ypt: null, catch_rate: null, drop_rate: null, ypc: null, ypc_stk: null, ypc_lgt: null, tgt_per_snap: null,
  ypt_bl: null, ypt_nbl: null, pa_share: null, scr_share: null, cont_rate: null, td_gap: null,
};

export function nvWeek(o: Partial<PlayerWeek> & { pid: string; week: number }): PlayerWeek {
  return { team: 'CCC', opp: 'DDD', ...ZERO_COUNTS, ...NULL_SHARES, ...o };
}

export function nvSeason(o: Partial<PlayerSeason> & { pid: string }): PlayerSeason {
  return { team: 'CCC', games: 4, ...ZERO_COUNTS, ...NULL_SHARES, ...NULL_RATES, ...o };
}

export function nvCoverage(o: Partial<CoverageRow> & { pid: string }): CoverageRow {
  return {
    team: 'CCC', routes: 0, tgt: 0, rec: 0, yds: 0, td: 0, man_routes: 0, man_tgt: 0, man_rec: 0, man_yds: 0, man_td: 0,
    zone_routes: 0, zone_tgt: 0, zone_rec: 0, zone_yds: 0, zone_td: 0, yprr: null, tprr: null, yprr_man: null, tprr_man: null,
    yprr_zone: null, tprr_zone: null, ...o,
  };
}

export function nvManifest(o: Partial<NflverseManifest> = {}): NflverseManifest {
  return {
    schema: 1, generatedAt: '2026-10-16T09:20:00Z', season: 2026, seasonsCovered: [2026], throughWeek: 6, participationSeason: 2025,
    participationIsCurrent: false,
    routesDefinition: 'Routes are a proxy: dropbacks a player was on the field for as a WR, TE or RB.',
    definitions: { tgt_share: 'His targets over the team’s pass attempts.', wopr: '1.5 × target share + 0.7 × air-yards share.' },
    sources: [], files: {}, xtd: { available: true, fitSeason: 2025, version: 1 },
    matchMethods: { gsis: 0, espn: 0, name_team_pos: 0, name_pos: 0 }, matched: 0, unmatchedCount: 0, ftnJoinRate: 0.95,
    attribution: 'Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.', ...o,
  };
}

/** A small nightly bundle: Walt Wideout (t1wr) with six weeks of usage, a coverage row from last season, and two unmatched players. */
export function sampleNflverseBundle(): NflverseBundle {
  const weekly = [
    ...[1, 2, 3, 4, 5, 6].map((w) => nvWeek({
      pid: 't1wr', week: w, off_snaps: 50 + w, tm_snaps: 60, snap_pct: (50 + w) / 60, tgt: 6 + w, tgt_share: 0.2 + w / 100, ay_share: 0.3, rz_tgt: 1, rz_tgt_share: 0.1,
    })),
    // a free agent whose snaps jumped in the last two weeks (and his earlier ones were small)
    ...[1, 2, 3, 4, 5, 6].map((w) => nvWeek({
      pid: 'x2', week: w, team: 'HHH', off_snaps: w < 5 ? 12 : 44, tm_snaps: 60, snap_pct: (w < 5 ? 12 : 44) / 60, tgt: w < 5 ? 1 : 7, tgt_share: w < 5 ? 0.05 : 0.22,
    })),
  ];
  return {
    manifest: nvManifest({ matched: 812, unmatchedCount: 2 }),
    weekly,
    season: [nvSeason({
      pid: 't1wr', games: 6, off_snaps: 330, tm_snaps: 360, snap_pct: 0.917, tgt: 60, rec: 41, rec_yds: 560, catchable_tgt: 52, ftn_tgt: 55, tgt_share: 0.26, ay_share: 0.3,
      adot: 9.8, wopr: 0.74, ypt: 9.3, catch_rate: 0.79, rz_tgt: 6, i10_tgt: 2, rz_tgt_share: 0.2, i10_tgt_share: 0.25, ez_tgt: 3, tgt_per_snap: 0.18, td_gap: 1.3,
      bl_tgt: 9, ypt_bl: 12.1, nbl_tgt: 46, ypt_nbl: 8.8, pa_share: 0.21, scr_share: 0.1, cont_tgt: 5, cont_rate: 0.6, drops: 2, drop_rate: 0.04,
    })],
    coverage: {
      rows: [nvCoverage({ pid: 't1wr', routes: 520, tgt: 90, rec: 60, yds: 780, yprr: 1.5, tprr: 0.17, man_routes: 120, man_yds: 150, yprr_man: 1.25, zone_routes: 300, zone_yds: 480, yprr_zone: 1.6 })],
      shells: { t1wr: { COVER_3: [200, 30, 20, 300, 2] } },
      season: 2025, isCurrent: false, routesDefinition: 'Routes are a proxy: dropbacks a player was on the field for as a WR, TE or RB.',
    },
    unmatched: [
      { key: 'g1', gsis: 'g1', pfr: null, name: 'Mystery Man', team: 'AAA', pos: 'WR', off_snaps: 120, tgt: 14, car: 0, reason: 'no_candidate', candidates: [] },
      { key: 'g2', gsis: 'g2', pfr: null, name: 'Twin One', team: 'BBB', pos: 'RB', off_snaps: 80, tgt: 3, car: 40, reason: 'ambiguous', candidates: ['Twin One (111)'] },
    ] satisfies UnmatchedPlayer[],
    asOf: FAKE_AS_OF,
  };
}

export function createFakeNflverse(): NflverseSource {
  return { load: vi.fn(async () => sampleNflverseBundle()) };
}
