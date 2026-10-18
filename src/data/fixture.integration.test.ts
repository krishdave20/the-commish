// @vitest-environment node
/* Runs the real data layer against the saved pull in reference/fixture/, fully offline.
   Every expectation comes from the manifest or the fixture's own files; nothing is hard-coded to a user or league. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import type { DataApi, FixtureSource } from './index.ts';
import { createDataLayer, fixtureTransport, planPull, shapes, sleeperUrls } from './index.ts';
import { fixtureDirSource } from './fixtureNode.ts';
import type { NflState, SleeperLeague } from './contract.ts';
import type { FixtureManifest } from './transport.ts';

const dir = decodeURIComponent(new URL('../../reference/fixture', import.meta.url).pathname);
let src: FixtureSource;
let m: FixtureManifest;
let api: DataApi;
let layer: ReturnType<typeof createDataLayer>;
const raw = <T>(url: string) => src.load(m.files[url]) as Promise<T>;

beforeAll(async () => {
  src = await fixtureDirSource(dir);
  m = src.manifest;
  layer = createDataLayer({
    transport: fixtureTransport(src),
    cache: createCache({ memoryOnly: true }),
    now: () => (typeof m.captured_at === 'number' ? m.captured_at : Date.parse(m.captured_at)),
  });
  api = layer.api;
});

describe('fixture manifest', () => {
  it('describes the pull', () => {
    for (const k of ['captured_at', 'username', 'user_id', 'league_id', 'season', 'week', 'season_type']) expect(m[k], k).toBeTruthy();
    expect(Object.keys(m.files).length).toBeGreaterThan(20);
  });

  it('has a file on disk for every URL, and every file passes the matching shape guard', async () => {
    const guards: Array<[RegExp, (x: unknown) => boolean]> = [
      [/fantasycalc\.com\/values\//, shapes.fantasyCalc],
      [/\/v1\/state\/nfl$/, shapes.nflState],
      [/\/v1\/user\/[^/]+$/, shapes.user],
      [/\/leagues\/nfl\/\d+$/, shapes.leagues],
      [/\/v1\/league\/[^/]+$/, shapes.league],
      [/\/rosters$/, shapes.rosters],
      [/\/league\/[^/]+\/users$/, shapes.leagueUsers],
      [/\/matchups\/\d+$/, shapes.matchups],
      [/\/transactions\/\d+$/, shapes.transactions],
      [/\/league\/[^/]+\/traded_picks$/, shapes.tradedPicks],
      [/\/league\/[^/]+\/drafts$/, shapes.drafts],
      [/\/league\/[^/]+\/(winners|losers)_bracket$/, shapes.bracket],
      [/\/v1\/draft\/[^/]+$/, shapes.draft],
      [/\/picks$/, shapes.draftPicks],
      [/\/draft\/[^/]+\/traded_picks$/, shapes.tradedPicks],
      [/\/v1\/players\/nfl$/, shapes.players],
      [/\/trending\//, shapes.trending],
      [/\/v1\/stats\//, shapes.weekStats],
      [/\/projections\/nfl\//, shapes.projections],
      [/\/schedule\/nfl\//, shapes.schedule],
      [/\/scores\/nfl\//, shapes.scores],
    ];
    for (const url of Object.keys(m.files)) {
      const g = guards.find(([re]) => re.test(url.split('?')[0]));
      expect(g, `no guard for ${url}`).toBeTruthy();
      expect(g![1](await src.load(m.files[url])), url).toBe(true);
    }
  });

  it('covers every URL a full pull needs (same plan the reference engine uses)', async () => {
    const state = await raw<NflState>(sleeperUrls.state());
    const league = await raw<SleeperLeague>(sleeperUrls.league(m.league_id));
    const p = planPull(state, league);
    const need = [
      sleeperUrls.rosters(m.league_id), sleeperUrls.users(m.league_id), sleeperUrls.schedule(p.season),
      sleeperUrls.trending('add', 72, 50),
      ...p.matchWeeks.map((w) => sleeperUrls.matchups(m.league_id, w)),
      ...p.statWeeks.map((w) => sleeperUrls.stats(p.season, w)),
      ...[...p.calWeeks, ...p.projWeeks].map((w) => sleeperUrls.projections(p.season, w, p.positions)),
      ...p.completedWeeks.map((w) => sleeperUrls.transactions(m.league_id, w)),
      sleeperUrls.seasonProjections(p.season, p.positions), sleeperUrls.players(),
      sleeperUrls.trending('add', 24, 50), sleeperUrls.trending('drop', 24, 50), sleeperUrls.tradedPicks(m.league_id),
    ];
    for (const u of need) expect(m.files[u], u).toBeTruthy();
  });
});

describe('DataApi on the fixture transport', () => {
  it('nflState matches the manifest', async () => {
    const s = await api.nflState();
    expect(s.data.week).toBe(m.week);
    expect(s.data.season_type).toBe(m.season_type);
    expect(s.data.league_season ?? s.data.season).toBe(m.season);
    expect(s.fromCache).toBe(false);
  });

  it('finds the captured user and lists the captured league', async () => {
    const u = await api.user(m.username);
    expect(u?.user_id).toBe(m.user_id);
    const ls = await api.userLeagues(m.user_id, m.season);
    expect(ls.data.map((l) => l.league_id)).toContain(m.league_id);
  });

  it('leagueBundle is internally consistent', async () => {
    const b = (await api.leagueBundle(m.league_id)).data;
    const rawUsers = await raw<unknown[]>(sleeperUrls.users(m.league_id));
    expect(b.league.league_id).toBe(m.league_id);
    expect(b.league.season).toBe(m.season);
    expect(b.rosters.length).toBe(b.league.total_rosters);
    expect(b.users.length).toBe(rawUsers.length);
    const userIds = new Set(b.users.map((u) => u.user_id));
    expect(userIds.has(m.user_id)).toBe(true);
    for (const r of b.rosters) if (r.owner_id) expect(userIds.has(r.owner_id)).toBe(true);
    expect(b.drafts.length).toBe((await raw<unknown[]>(sleeperUrls.drafts(m.league_id))).length);
  });

  it('holds both playoff brackets (the smoke test and the bracket pages read them)', async () => {
    expect(m.files[sleeperUrls.winnersBracket(m.league_id)]).toBeTruthy();
    expect(m.files[sleeperUrls.losersBracket(m.league_id)]).toBeTruthy();
    expect((await layer.sleeper.winnersBracket(m.league_id)).data.length).toBeGreaterThan(0);
    expect((await layer.sleeper.losersBracket(m.league_id)).data.length).toBeGreaterThan(0);
  });

  it('serves the second read from the cache', async () => {
    const again = await api.leagueBundle(m.league_id);
    expect(again.fromCache).toBe(true);
    expect(again.stale).toBe(false);
  });

  it('no Sleeper health check fails on the fixture', async () => {
    const b = (await api.leagueBundle(m.league_id)).data;
    const rs = await api.healthChecks({
      season: m.season, week: m.week, username: m.username, userId: m.user_id, leagueId: m.league_id, draftId: b.drafts[0]?.draft_id,
    });
    // the fixture was captured before game day existed, so it holds no NFL scores (that row has its own test in health.test.ts)
    const sleeper = rs.filter((r) => r.source === 'sleeper' && r.id !== 'sleeper.scores');
    expect(sleeper.length).toBeGreaterThanOrEqual(20);
    for (const r of sleeper) expect(['ok', 'warn'], `${r.id}: ${r.message}`).toContain(r.level);
    expect(sleeper.filter((r) => r.level === 'fail')).toEqual([]);
    expect(rs.find((r) => r.id === 'sleeper.players')?.level).toBe('ok');
  });

  it('cacheStats reflects what was read and clearCache empties it', async () => {
    expect((await api.cacheStats()).entries.length).toBeGreaterThan(0);
    await api.clearCache();
    expect((await api.cacheStats()).entries).toEqual([]);
  });
});

describe('fixtureTransport', () => {
  it('answers 404 for a URL that was never captured', async () => {
    const t = fixtureTransport(src);
    expect((await t(sleeperUrls.league('not-captured'))).status).toBe(404);
    expect((await t(sleeperUrls.state())).status).toBe(200);
    expect((await t(sleeperUrls.state(), { method: 'HEAD' })).body).toBeNull();
  });
});
