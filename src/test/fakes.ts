import { vi } from 'vitest';
import type { LoadModel } from '../app/loadModel';
import type { BracketRow, DraftPick, Matchup, PlayersMap, SleeperClient, FantasyCalcRow, NflverseClient, ProjectionRow, ScoreGame, TrendingRow } from '../data';
import { syntheticPool } from '../engine/draft/test-helpers';
import { buildRankings, createMock, draftOrderFor } from '../engine';
import { handModel } from '../engine/test-helpers';
import type { BuildTakes } from '../app/takesEngine';
import type { Take } from '../takes/types';
import type { Model } from '../engine';
import type {
  AccountStore, CacheStats, DataApi, Fetched, HealthResult, LeagueBundle, LeagueUser, LinkedAccount,
  NflState, SleeperDraft, SleeperLeague, SleeperRoster, SleeperUser,
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

/** The sample season projections for the draft engine: the draft tests' synthetic pool, with a few rookies. */
export function sampleSeasonProjections(): ProjectionRow[] {
  const rows = syntheticPool();
  for (const pid of ['RB4', 'RB9', 'WR3', 'WR8', 'QB5']) {
    const r = rows.find((x) => x.player_id === pid);
    if (r?.player) r.player.years_exp = 0;
  }
  return rows;
}

export interface FakeSeason { league: SleeperLeague; rosters: SleeperRoster[]; users: LeagueUser[] }

export interface FakeSleeperOpts {
  fantasyCalcFails?: boolean;
  /** league id -> its league object, rosters and users, for the huddle's league-history walk */
  seasons?: Record<string, FakeSeason>;
  /** the draft `sleeper.draft(id)` answers with (default: none, so the bundle's draft is used) */
  draft?: SleeperDraft | null;
  trending?: TrendingRow[];
  projections?: ProjectionRow[];
  projectionsFail?: boolean;
  /** FantasyCalc rows (default: sampleFantasyCalc()) */
  fantasyCalcRows?: FantasyCalcRow[];
  /** the picks `sleeper.draftPicks(id)` answers with (default: none) */
  picks?: DraftPick[];
  /** Sleeper's `winners_bracket` / `losers_bracket` rows (default: none, as before the playoffs) */
  bracket?: BracketRow[];
  losersBracket?: BracketRow[];
  /** make the bracket endpoints fail, as a 404 or an outage would */
  bracketFails?: boolean;
  /** game day: what the live endpoints answer (functions, so a test can change them between polls). Without it the client has no live endpoints. */
  live?: FakeLive;
}

/** What the fake game day endpoints serve, by week. */
export interface FakeLive {
  matchups: (week: number) => Matchup[];
  scores: (week: number) => ScoreGame[];
  projections?: (week: number) => ProjectionRow[];
}

/** The Sleeper client pieces the app reads outside the engine's pull: players, FantasyCalc, trending adds, past seasons and draft inputs. */
export function createFakeSleeper(o: FakeSleeperOpts = {}) {
  const seasons = o.seasons ?? {};
  const season = (id: string): FakeSeason => {
    const s = seasons[id];
    if (!s) throw new Error(`No league ${id}`);
    return s;
  };
  return {
    players: vi.fn(async () => loaded(samplePlayersFile())),
    fantasyCalc: vi.fn(async () => {
      if (o.fantasyCalcFails) throw new Error('FantasyCalc is down');
      return loaded(o.fantasyCalcRows ?? sampleFantasyCalc());
    }),
    trending: vi.fn(async () => loaded(o.trending ?? [{ player_id: 'fa1', count: 12400 }])),
    league: vi.fn(async (id: string) => loaded(season(id).league)),
    rosters: vi.fn(async (id: string) => loaded(season(id).rosters)),
    users: vi.fn(async (id: string) => loaded(season(id).users)),
    draft: vi.fn(async () => { if (!o.draft) throw new Error('No draft'); return loaded(o.draft); }),
    draftPicks: vi.fn(async () => loaded(o.picks ?? [])),
    draftTradedPicks: vi.fn(async () => loaded([])),
    winnersBracket: vi.fn(async () => {
      if (o.bracketFails) throw new Error('winners bracket not found');
      return loaded(o.bracket ?? []);
    }),
    losersBracket: vi.fn(async () => {
      if (o.bracketFails) throw new Error('losers bracket not found');
      return loaded(o.losersBracket ?? []);
    }),
    seasonProjections: vi.fn(async () => {
      if (o.projectionsFail) throw new Error('Sleeper projections are down');
      return loaded(o.projections ?? sampleSeasonProjections());
    }),
    ...(o.live ? {
      liveMatchups: vi.fn(async (_id: string, week: number) => loaded(o.live!.matchups(week))),
      scores: vi.fn(async (_season: string, week: number) => loaded(o.live!.scores(week))),
      projections: vi.fn(async (_season: string, week: number) => loaded(o.live!.projections?.(week) ?? [])),
      schedule: vi.fn(async () => loaded([])),
    } : {}),
  } as unknown as SleeperClient & {
    players: ReturnType<typeof vi.fn>; fantasyCalc: ReturnType<typeof vi.fn>; trending: ReturnType<typeof vi.fn>;
    league: ReturnType<typeof vi.fn>; seasonProjections: ReturnType<typeof vi.fn>;
    draft: ReturnType<typeof vi.fn>; draftPicks: ReturnType<typeof vi.fn>;
  };
}

/* ---------- draft room ---------- */

/** The sample league's draft: 6 teams, 4 rounds, snake, the sample user in slot 3 (roster 3). */
export function sampleDraft(patch: Partial<SleeperDraft> = {}): SleeperDraft {
  return {
    draft_id: 'L1-draft', league_id: 'L1', season: '2026', status: 'pre_draft', type: 'snake', start_time: null,
    settings: { teams: 6, rounds: 4 }, draft_order: { u1: 3 },
    slot_to_roster_id: { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 }, ...patch,
  };
}

/** Sleeper-shaped picks for a draft the bots made (the engine's mock, fixed seed), first `count` of them (default all). */
export function sampleDraftPicks(draft: SleeperDraft = sampleDraft(), count?: number): DraftPick[] {
  const league = sampleLeague;
  const rankings = buildRankings({ projections: sampleSeasonProjections(), league, mode: 'redraft', players: null, fantasyCalc: null });
  const order = draftOrderFor(draft, [], league.total_rosters);
  const mock = createMock({ rankings, order, userRosterId: 3, seed: 7 });
  mock.autoAll();
  return mock.state.picks.slice(0, count ?? order.length).map((p) => ({
    round: p.round, pick_no: p.pickNo, player_id: p.pid, roster_id: p.rosterId, draft_slot: p.slot, draft_id: draft.draft_id,
  }));
}

/* ---------- hot takes ---------- */

function take(o: Partial<Take> & { trackRecord?: string | null } & Pick<Take, 'kind' | 'pid' | 'player' | 'pos' | 'headline' | 'statLine'>): Take {
  return {
    id: `${o.kind}:${o.pid}:6`, team: 'CCC', season: '2026', week: 6, throughWeek: 6, whyForYou: null, relevance: 'league', tone: 'good', score: 0.5,
    sample: { label: 'weeks', n: 3 }, dataLabel: null, sources: ['nflverse'], actions: ['profile', 'watchlist'], ...o,
  };
}

/** Five takes in the engine's ranked order: two on my players, a waiver riser, a trade target and a dynasty mover. */
export function sampleTakes(): Take[] {
  return [
    take({
      kind: 'usage_spike', pid: 't1wr', player: 'Walt Wideout', pos: 'WR', relevance: 'mine', tone: 'good',
      headline: 'Walt Wideout’s snap share jumped 18 points', statLine: '94% of snaps vs 76% over the previous 3 weeks, 3 games',
      whyForYou: 'He starts for you at WR1.', actions: ['profile', 'watchlist', 'lab', 'trade'], sources: ['nflverse'],
      trackRecord: '2025 backtest: beat projection 45% of the time vs 37% for all players (119 takes)',
    }),
    take({
      kind: 'sell_high', pid: 't1rb', player: 'Rex Runner', pos: 'RB', team: 'BBB', relevance: 'mine', tone: 'bad',
      headline: 'Rex Runner is scoring far above his expected touchdowns', statLine: '5 TDs vs 2.1 expected on 38 carries',
      whyForYou: 'A sell-high window on your RB1.', dataLabel: 'last season (2025)', actions: ['profile', 'watchlist', 'lab', 'trade'], sources: ['nflverse', 'ftn'],
    }),
    take({
      kind: 'waiver_riser', pid: 'fa1', player: 'Free Agent Fran', pos: 'WR', team: 'FFF', relevance: 'waiver', tone: 'good',
      headline: 'Free Agent Fran is getting added and getting looks', statLine: '12.4k adds in 24 hours; snap share up 14 points over 3 games',
      whyForYou: 'Free on your wire; he would start over Backup Wideout.', dataLabel: 'proxy', actions: ['profile', 'watchlist', 'lab'], sources: ['sleeper', 'nflverse'],
    }),
    take({
      kind: 'buy_low', pid: 't2wr', player: 'Reed Receiver', pos: 'WR', team: 'DDD', relevance: 'trade_target', tone: 'watch',
      headline: 'Reed Receiver has top-24 air yards and bottom-half scoring', statLine: 'air-yards share rank 11 of WR, points per game rank 41, 5 games',
      actions: ['profile', 'watchlist', 'trade'], sources: ['nflverse'], sample: { label: 'games', n: 5 },
    }),
    take({
      kind: 'dynasty_mover', pid: 't2qb', player: 'Quinn Quarterback', pos: 'QB', team: 'EEE', relevance: 'league', tone: 'good',
      headline: 'Quinn Quarterback’s dynasty value is up 6% in 30 days', statLine: 'value 6,840 vs 6,450 thirty days ago, 3rd of 36 QBs',
      actions: ['profile', 'watchlist'], sources: ['fantasycalc'], sample: { label: 'days', n: 30 },
    }),
  ];
}

/** A takes engine stand-in: always the same five takes, and a spy on the inputs it was handed. */
export function stubBuildTakes(takes: () => Take[] = sampleTakes) {
  return vi.fn<BuildTakes>(() => takes());
}

/* ---------- nflverse output, in the shapes of src/data/nflverseTypes.ts ---------- */

import type { NflverseBundle } from '../app/nflverseData';
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
      teams: {}, season: 2025, isCurrent: false, routesDefinition: 'Routes are a proxy: dropbacks a player was on the field for as a WR, TE or RB.',
    },
    teams: [],
    unmatched: [
      { key: 'g1', gsis: 'g1', pfr: null, name: 'Mystery Man', team: 'AAA', pos: 'WR', off_snaps: 120, tgt: 14, car: 0, reason: 'no_candidate', candidates: [] },
      { key: 'g2', gsis: 'g2', pfr: null, name: 'Twin One', team: 'BBB', pos: 'RB', off_snaps: 80, tgt: 3, car: 40, reason: 'ambiguous', candidates: ['Twin One (111)'] },
    ] satisfies UnmatchedPlayer[],
    asOf: FAKE_AS_OF,
  };
}

function encode<T extends object>(rows: T[], extra: Record<string, unknown> = {}) {
  const cols = rows.length ? Object.keys(rows[0]!) : [];
  return { schema: 1 as const, season: 2026, generatedAt: '2026-10-16T09:20:00Z', cols, rows: rows.map((r) => cols.map((c) => (r as Record<string, unknown>)[c] ?? null)), ...extra };
}

const available = <T,>(data: T) => ({ available: true as const, data, asOf: FAKE_AS_OF, fromCache: false, stale: false });

/** A stand-in for createDataLayer().nflverse that serves the sample bundle as the pipeline's JSON shapes. */
export function createFakeNflverse(o: { missing?: boolean; bundle?: () => NflverseBundle } = {}): NflverseClient & Record<'manifest' | 'weekly' | 'season' | 'coverage' | 'unmatched', ReturnType<typeof vi.fn>> {
  const b = (o.bundle ?? sampleNflverseBundle)();
  const gone = { available: false as const, reason: 'not_found' as const, message: 'nflverse data is not available yet (manifest.json was not found).', url: './data/nflverse/manifest.json' };
  const serve = <T,>(make: () => T) => vi.fn(async (..._args: unknown[]) => (o.missing ? gone : available(make())));
  return {
    manifest: serve(() => b.manifest),
    weekly: serve(() => encode(b.weekly)),
    season: serve(() => encode(b.season)),
    teams: serve(() => encode(b.teams)),
    coverage: vi.fn(async (..._args: unknown[]) => (o.missing || !b.coverage ? gone : available({
      ...encode(b.coverage.rows), season: b.coverage.season, isCurrent: b.coverage.isCurrent, routesDefinition: b.coverage.routesDefinition,
      shells: b.coverage.shells, teams: {},
    }))),
    unmatched: serve(() => ({ schema: 1, season: 2026, generatedAt: '', players: b.unmatched })),
    urlOf: (f: string) => `./data/nflverse/${f}`,
  } as unknown as NflverseClient & Record<'manifest' | 'weekly' | 'season' | 'coverage' | 'unmatched', ReturnType<typeof vi.fn>>;
}

/* ---------- game day ---------- */

/** The sample league's four fantasy teams, as the live game day tests see them: every player of fantasy team k plays for NFL team `N{k}`,
    and N1 plays N2 (matchup 1: me against Reed) while N3 plays N4 (matchup 2). The bench wideout is on N1 too. */
export function liveSampleModel(): Model {
  const m = sampleModel();
  for (const p of m.players) if (p.ownerRid > 0) p.nfl = `N${p.ownerRid}`;
  return m;
}

const LIVE_STARTERS: Record<number, string[]> = {
  1: ['t1qb', 't1rb', 't1wr'], 2: ['t2qb', 't2rb', 't2wr'], 3: ['t3qb', 't3rb', 't3wr'], 4: ['t4qb', 't4rb', 't4wr'],
};
const LIVE_BENCH: Record<number, string[]> = { 1: ['t1bw'], 2: [], 3: [], 4: [] };

/** Sleeper-shaped matchups for the sample league: points per player id (anything missing is 0). Roster 1 plays 2 and 3 plays 4. */
export function sampleLiveMatchups(pts: Record<string, number> = {}): Matchup[] {
  return [1, 2, 3, 4].map((rid) => {
    const starters = LIVE_STARTERS[rid]!;
    const players = [...starters, ...LIVE_BENCH[rid]!];
    const players_points = Object.fromEntries(players.map((p) => [p, pts[p] ?? 0]));
    const starters_points = starters.map((p) => players_points[p]!);
    return {
      roster_id: rid, matchup_id: rid <= 2 ? 1 : 2, points: Math.round(starters_points.reduce((a, b) => a + b, 0) * 100) / 100,
      starters, players, starters_points, players_points, custom_points: null,
    } as Matchup;
  });
}

export type FakeGameState = 'pre' | 'live' | 'final';

/** The two NFL games (N2 at N1, N4 at N3) as Sleeper's scores endpoint reports them. `clock` is "quarter time", e.g. ['2', '7:30']. */
export function sampleScores(o: { a?: FakeGameState; b?: FakeGameState; kickoff?: number; clock?: [string, string] } = {}): ScoreGame[] {
  const g = (id: string, home: string, away: string, state: FakeGameState, kickoff: number): ScoreGame => ({
    game_id: id,
    status: state === 'pre' ? 'pre_game' : state === 'live' ? 'in_game' : 'complete',
    start_time: kickoff,
    metadata: {
      home_team: home, away_team: away, home_score: state === 'pre' ? undefined : 17, away_score: state === 'pre' ? undefined : 10,
      quarter: state === 'pre' ? '' : state === 'final' ? 'F' : (o.clock ?? ['2', '7:30'])[0], time_remaining: state === 'live' ? (o.clock ?? ['2', '7:30'])[1] : '00:00',
      is_in_progress: state === 'live', is_over: state === 'final',
    },
  });
  const k = o.kickoff ?? Date.now() - 3_600_000;
  return [g('g1', 'N1', 'N2', o.a ?? 'live', k), g('g2', 'N3', 'N4', o.b ?? 'final', k + 60_000)];
}

/** Projection rows for the sample players: the pre-game expectation of each, by player id. */
export function sampleLiveProjections(mu: Record<string, number> = {}): ProjectionRow[] {
  const base: Record<string, [string, number]> = {
    t1qb: ['QB', 20], t1rb: ['RB', 15], t1wr: ['WR', 12], t1bw: ['WR', 6], t2qb: ['QB', 19], t2rb: ['RB', 14], t2wr: ['WR', 13],
    t3qb: ['QB', 17], t3rb: ['RB', 13], t3wr: ['WR', 10], t4qb: ['QB', 15], t4rb: ['RB', 10], t4wr: ['WR', 8],
  };
  return Object.entries(base).map(([pid, [pos, v]]) => ({ player_id: pid, stats: { pts_ppr: mu[pid] ?? v }, player: { position: pos, first_name: pid, last_name: 'x' } }));
}
