// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from './cache.ts';
import { createDataLayer } from './index.ts';
import { createLimiter } from './limiter.ts';
import { coverageRows, createNflverseClient, decodeColumnar, NFLVERSE_TTL, seasonRows, teamRows, weeklyRows } from './nflverse.ts';
import type { NflverseManifest, WeeklyFile } from './nflverseTypes.ts';
import { WEEKLY_COLS } from './nflverseTypes.ts';
import { fakeTransport, ok, status, type FakeTransport } from './test-helpers.ts';

const B = './data/nflverse/';
let t: FakeTransport;
let clock: number;
const mk = () => createNflverseClient({ transport: t, cache: createCache({ memoryOnly: true }), limiter: createLimiter({ now: () => clock }), now: () => clock });

const manifest = (over: Partial<NflverseManifest> = {}) => ({
  schema: 1, generatedAt: '2026-10-16T09:00:00Z', season: 2026, seasonsCovered: [2026], throughWeek: 6, participationSeason: 2025, participationIsCurrent: false,
  routesDefinition: 'proxy', definitions: {}, sources: [], files: {}, xtd: { available: false, fitSeason: null, version: null },
  matchMethods: { gsis: 0, espn: 0, name_team_pos: 0, name_pos: 0 }, matched: 0, unmatchedCount: 0, ftnJoinRate: null, attribution: 'x', ...over,
});
const weekly = (): WeeklyFile => ({
  schema: 1, season: 2026, generatedAt: 'x', cols: [...WEEKLY_COLS],
  rows: [['8228', 1, 'PIT', 'NYJ', ...WEEKLY_COLS.slice(4).map((c, i) => (c === 'tgt' ? 5 : i % 3 === 0 ? null : 1))]],
});
const table = (cols: string[], rows: Array<Array<string | number | null>>) => ({ schema: 1, season: 2026, generatedAt: 'x', cols, rows });

beforeEach(() => {
  clock = 1_000_000;
  t = fakeTransport([
    [`${B}manifest.json`, ok(manifest())],
    [`${B}weekly_2026.json`, ok(weekly())],
    [`${B}season_2026.json`, ok(table(['pid', 'team', 'games', 'tgt'], [['8228', 'PIT', 5, 40]]))],
    [`${B}teams_2026.json`, ok({ ...table(['team', 'week', 'pass_att'], [['PIT', 1, 30]]), hasManZone: false })],
    [`${B}coverage_2025.json`, ok({ ...table(['pid', 'routes', 'yprr'], [['8228', 100, 1.5]]), isCurrent: false, routesDefinition: 'proxy', shells: {}, teams: {} })],
    [`${B}unmatched.json`, ok({ schema: 1, season: 2026, generatedAt: 'x', players: [] })],
  ]);
});

describe('nflverse client: files that exist', () => {
  it('reads each file from ./data/nflverse/ relative to the page', async () => {
    const c = mk();
    const m = await c.manifest();
    expect(m).toMatchObject({ available: true, fromCache: false, stale: false });
    expect(m.available && m.data.season).toBe(2026);
    expect((await c.weekly(2026)).available).toBe(true);
    expect((await c.season(2026)).available).toBe(true);
    expect((await c.teams(2026)).available).toBe(true);
    expect((await c.coverage()).available).toBe(true);
    expect((await c.unmatched()).available).toBe(true);
    expect(t.calls.map((x) => x.url)).toEqual([
      // coverage() reads the manifest again, from the cache
      `${B}manifest.json`, `${B}weekly_2026.json`, `${B}season_2026.json`, `${B}teams_2026.json`, `${B}coverage_2025.json`, `${B}unmatched.json`,
    ]);
  });

  it('coverage follows the manifest’s participation season (last season now, this season once published)', async () => {
    t.set(`${B}manifest.json`, ok(manifest({ participationSeason: 2026, participationIsCurrent: true })));
    t.set(`${B}coverage_2026.json`, ok({ ...table(['pid'], []), isCurrent: true, routesDefinition: '', shells: {}, teams: {} }));
    const r = await mk().coverage();
    expect(r.available && r.data.season).toBe(2026);
  });

  it('weekly/season/teams default to the manifest’s season', async () => {
    const r = await mk().weekly();
    expect(r.available).toBe(true);
    expect(t.calls.at(-1)!.url).toBe(`${B}weekly_2026.json`);
  });

  it('serves the cache within the 6 h TTL, refetches after it, and force skips it', async () => {
    const c = mk();
    await c.weekly(2026);
    clock += NFLVERSE_TTL - 1;
    const hit = await c.weekly(2026);
    expect(hit).toMatchObject({ available: true, fromCache: true, stale: false });
    expect(t.count(`${B}weekly_2026.json`)).toBe(1);
    clock += 2;
    const fresh = await c.weekly(2026);
    expect(fresh).toMatchObject({ available: true, fromCache: false });
    expect(t.count(`${B}weekly_2026.json`)).toBe(2);
    await c.weekly(2026, { force: true });
    expect(t.count(`${B}weekly_2026.json`)).toBe(3);
  });

  it('asOf is when the copy was fetched', async () => {
    const c = mk();
    const r = await c.manifest();
    expect(r.available && r.asOf).toBe(1_000_000);
  });

  it('goes through the limiter', async () => {
    const limiter = createLimiter({ now: () => clock });
    const spy = vi.spyOn(limiter, 'run');
    await createNflverseClient({ transport: t, cache: createCache({ memoryOnly: true }), limiter, now: () => clock }).manifest();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('nflverse client: files that are not there', () => {
  it('a 404 is a typed "not available yet" result, not a throw', async () => {
    t.set(`${B}weekly_2026.json`, status(404));
    const r = await mk().weekly(2026);
    expect(r).toMatchObject({ available: false, reason: 'not_found', url: `${B}weekly_2026.json` });
    expect(!r.available && r.message).toMatch(/not available yet/i);
  });

  it('every method returns unavailable when nothing was published (local dev before a pipeline run)', async () => {
    t = fakeTransport();
    const c = mk();
    for (const r of [await c.manifest(), await c.weekly(2026), await c.season(2026), await c.teams(2026), await c.coverage(), await c.unmatched(), await c.weekly()]) {
      expect(r.available).toBe(false);
    }
  });

  it('the dev server’s index.html fallback (200 with a string body) is "not found", not a shape error', async () => {
    t.set(`${B}manifest.json`, ok('<!doctype html><html></html>'));
    const r = await mk().manifest();
    expect(r).toMatchObject({ available: false, reason: 'not_found' });
  });

  it('an empty 200 is not found too', async () => {
    t.set(`${B}manifest.json`, ok(null));
    expect(await mk().manifest()).toMatchObject({ available: false, reason: 'not_found' });
  });

  it('weekly() with no season but no manifest is unavailable', async () => {
    t.set(`${B}manifest.json`, status(404));
    expect((await mk().weekly()).available).toBe(false);
    expect((await mk().coverage()).available).toBe(false);
  });

  it('a file in an unexpected format is a "shape" result', async () => {
    t.set(`${B}season_2026.json`, ok({ schema: 2, rows: 'nope' }));
    t.set(`${B}manifest.json`, ok({ hello: 'world' }));
    expect(await mk().season(2026)).toMatchObject({ available: false, reason: 'shape' });
    expect(await mk().manifest()).toMatchObject({ available: false, reason: 'shape' });
  });

  it('a network failure with no cache is unavailable; with a cached copy it serves it, marked stale', async () => {
    const cache = createCache({ memoryOnly: true });
    const mkc = () => createNflverseClient({ transport: t, cache, limiter: createLimiter({ now: () => clock }), now: () => clock });
    t.set(`${B}weekly_2026.json`, () => { throw new TypeError('Failed to fetch'); });
    expect(await mkc().weekly(2026)).toMatchObject({ available: false, reason: 'network' });
    t.set(`${B}weekly_2026.json`, ok(weekly()));
    await mkc().weekly(2026);
    clock += NFLVERSE_TTL + 1;
    t.set(`${B}weekly_2026.json`, () => { throw new TypeError('Failed to fetch'); });
    const r = await mkc().weekly(2026);
    expect(r).toMatchObject({ available: true, fromCache: true, stale: true });
    expect(r.available && r.error).toMatch(/Failed to fetch/);
  });

  it('a server error serves the cached copy as stale, or is unavailable without one', async () => {
    const cache = createCache({ memoryOnly: true });
    const mkc = () => createNflverseClient({ transport: t, cache, limiter: createLimiter({ now: () => clock }), now: () => clock });
    t.set(`${B}teams_2026.json`, status(503));
    expect(await mkc().teams(2026)).toMatchObject({ available: false });
    t.set(`${B}teams_2026.json`, ok({ ...table(['team'], []), hasManZone: false }));
    await mkc().teams(2026);
    clock += NFLVERSE_TTL + 1;
    t.set(`${B}teams_2026.json`, status(503));
    expect(await mkc().teams(2026)).toMatchObject({ available: true, stale: true });
  });
});

describe('decoding', () => {
  it('columnar rows become objects, missing cells null', () => {
    const rows = decodeColumnar<{ a: number; b: string | null }>({ cols: ['a', 'b'], rows: [[1, 'x'], [2, null], [3]] });
    expect(rows).toEqual([{ a: 1, b: 'x' }, { a: 2, b: null }, { a: 3, b: null }]);
  });

  it('typed helpers decode the weekly, season, teams and coverage tables', () => {
    const w = weeklyRows(weekly());
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ pid: '8228', week: 1, team: 'PIT', opp: 'NYJ', tgt: 5 });
    expect(Object.keys(w[0])).toEqual([...WEEKLY_COLS]);
    expect(seasonRows(table(['pid', 'tgt'], [['1', 3]]) as never)).toEqual([{ pid: '1', tgt: 3 }]);
    expect(teamRows(table(['team'], [['KC']]) as never)).toEqual([{ team: 'KC' }]);
    expect(coverageRows(table(['pid', 'yprr'], [['1', null]]) as never)).toEqual([{ pid: '1', yprr: null }]);
  });
});

describe('createDataLayer', () => {
  it('adds an nflverse client without removing anything existing', async () => {
    const layer = createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
    expect(Object.keys(layer).sort()).toEqual(['api', 'cache', 'limiter', 'nflverse', 'sleeper']);
    expect(Object.keys(layer.api).sort()).toEqual(['cacheStats', 'clearCache', 'healthChecks', 'leagueBundle', 'nflState', 'user', 'userLeagues']);
    const m = await layer.nflverse.manifest();
    expect(m.available).toBe(true);
    // it shares the layer's cache: the entry shows up in cache stats under its own key
    expect((await layer.api.cacheStats()).entries.map((e) => e.key)).toContain('nflverse:manifest.json');
  });
});
