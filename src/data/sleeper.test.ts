// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { DataError } from './errors.ts';
import { createDataApi, createDataLayer } from './index.ts';
import { draft, fakeTransport, league, leagueUser, nflState, ok, roster, status, type FakeTransport } from './test-helpers.ts';
import { TTL } from './sleeper.ts';
import { sleeperUrls } from './urls.ts';

const MIN = 60_000, H = 3_600_000;
let t: FakeTransport;
let clock: number;
const mk = () => createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });

beforeEach(() => {
  clock = 1_000_000;
  t = fakeTransport([
    [sleeperUrls.state(), ok(nflState())],
    [sleeperUrls.league('L1'), ok(league())],
    [sleeperUrls.rosters('L1'), ok([roster(1), roster(2)])],
    [sleeperUrls.users('L1'), ok([leagueUser(1), leagueUser(2)])],
    [sleeperUrls.drafts('L1'), ok([draft()])],
    [sleeperUrls.tradedPicks('L1'), ok([])],
    [sleeperUrls.players(), ok({ '1': { player_id: '1', team: 'KC', position: 'QB' } })],
  ]);
});

describe('freshness policy', () => {
  it('serves a fresh copy from the cache without touching the network', async () => {
    const { sleeper } = mk();
    const a = await sleeper.league('L1');
    expect(a).toMatchObject({ fromCache: false, stale: false, asOf: clock });
    clock += 5 * H;
    const b = await sleeper.league('L1');
    expect(b).toMatchObject({ fromCache: true, stale: false, asOf: 1_000_000 });
    expect(t.count(sleeperUrls.league('L1'))).toBe(1);
  });

  it('refetches once older than 6 h (state: 10 min)', async () => {
    const { sleeper } = mk();
    await sleeper.league('L1');
    await sleeper.nflState();
    clock += 11 * MIN;
    await sleeper.league('L1');
    await sleeper.nflState();
    expect(t.count(sleeperUrls.league('L1'))).toBe(1);
    expect(t.count(sleeperUrls.state())).toBe(2);
    clock += 6 * H;
    const again = await sleeper.league('L1');
    expect(again.fromCache).toBe(false);
    expect(t.count(sleeperUrls.league('L1'))).toBe(2);
    expect(TTL.state).toBe(10 * MIN);
  });

  it('force goes to the network even when fresh', async () => {
    const { sleeper } = mk();
    await sleeper.league('L1');
    const f = await sleeper.league('L1', { force: true });
    expect(f.fromCache).toBe(false);
    expect(t.count(sleeperUrls.league('L1'))).toBe(2);
  });

  it('players: 24 h cap holds against force, only forcePlayers or age overrides it', async () => {
    const { sleeper } = mk();
    await sleeper.players();
    clock += 23 * H;
    expect((await sleeper.players({ force: true })).fromCache).toBe(true);
    expect(t.count(sleeperUrls.players())).toBe(1);
    expect((await sleeper.players({ forcePlayers: true })).fromCache).toBe(false);
    expect(t.count(sleeperUrls.players())).toBe(2);
    clock += 25 * H;
    expect((await sleeper.players()).fromCache).toBe(false);
    expect(t.count(sleeperUrls.players())).toBe(3);
  });

  it('a forced refresh of other data does not drag the players file along', async () => {
    const { api } = mk();
    await api.leagueBundle('L1', { force: true });
    expect(t.count(sleeperUrls.players())).toBe(0);
  });

  it('offline with a cached copy: returns it, stale, with the error and the old timestamp', async () => {
    const { sleeper } = mk();
    await sleeper.league('L1');
    clock += 7 * H;
    t.set(sleeperUrls.league('L1'), () => { throw new TypeError('Failed to fetch'); });
    const r = await sleeper.league('L1');
    expect(r).toMatchObject({ fromCache: true, stale: true, asOf: 1_000_000 });
    expect(r.error).toMatch(/Failed to fetch/);
    expect(r.data.league_id).toBe('L1');
  });

  it('offline on a forced refresh also falls back to the cache', async () => {
    const { sleeper } = mk();
    await sleeper.nflState();
    t.set(sleeperUrls.state(), status(503));
    const r = await sleeper.nflState({ force: true });
    expect(r).toMatchObject({ fromCache: true, stale: true });
    expect(r.error).toMatch(/503/);
  });

  it('no cached copy and the network fails: throws a typed network error', async () => {
    const { sleeper } = mk();
    t.set(sleeperUrls.league('L1'), () => { throw new TypeError('Failed to fetch'); });
    const err = await sleeper.league('L1').catch((e) => e);
    expect(err).toBeInstanceOf(DataError);
    expect(err.kind).toBe('network');
  });
});

describe('typed errors', () => {
  it('404 is not_found, other statuses are http, bad bodies are shape', async () => {
    const { sleeper } = mk();
    expect((await sleeper.league('nope').catch((e) => e)).kind).toBe('not_found');
    t.set(sleeperUrls.rosters('L1'), status(500));
    expect((await sleeper.rosters('L1').catch((e) => e)).kind).toBe('http');
    t.set(sleeperUrls.users('L1'), ok([{ nope: true }]));
    expect((await sleeper.users('L1').catch((e) => e)).kind).toBe('shape');
  });

  it('a 200 null for a league is not_found; for a list it is an empty list', async () => {
    const { sleeper } = mk();
    t.set(sleeperUrls.league('gone'), ok(null));
    expect((await sleeper.league('gone').catch((e) => e)).kind).toBe('not_found');
    t.set(sleeperUrls.matchups('L1', 3), ok(null));
    expect((await sleeper.matchups('L1', 3)).data).toEqual([]);
  });
});

describe('user lookup', () => {
  it('unknown username (HTTP 200, body null) resolves null and is not cached', async () => {
    t.set(sleeperUrls.user('ghost'), ok(null));
    const api = createDataApi({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
    expect(await api.user('ghost')).toBeNull();
    expect(await api.user('ghost')).toBeNull();
    expect(t.count(sleeperUrls.user('ghost'))).toBe(2);
  });

  it('a real user comes back and is cached; blank input never hits the network', async () => {
    t.set(sleeperUrls.user('Bob'), ok({ user_id: '7', display_name: 'Bob', avatar: null }));
    const api = createDataApi({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
    expect((await api.user(' Bob '))?.user_id).toBe('7');
    expect((await api.user('bob'))?.user_id).toBe('7');
    expect(t.count(sleeperUrls.user('Bob'))).toBe(1);
    expect(await api.user('   ')).toBeNull();
  });
});

describe('leagueBundle', () => {
  it('fetches league, rosters, users, drafts and traded picks together', async () => {
    const { api } = mk();
    const b = await api.leagueBundle('L1');
    expect(b.data.league.league_id).toBe('L1');
    expect(b.data.rosters).toHaveLength(2);
    expect(b.data.users).toHaveLength(2);
    expect(b.data.drafts[0].draft_id).toBe('D1');
    expect(b.data.tradedPicks).toEqual([]);
    expect(b).toMatchObject({ fromCache: false, stale: false });
    expect(t.calls).toHaveLength(5);
  });

  it('is stale if any part fell back to the cache, and asOf is the oldest part', async () => {
    const { api } = mk();
    await api.leagueBundle('L1');
    clock += 7 * H;
    t.set(sleeperUrls.rosters('L1'), () => { throw new TypeError('offline'); });
    const b = await api.leagueBundle('L1');
    expect(b.stale).toBe(true);
    expect(b.error).toMatch(/offline/);
    expect(b.asOf).toBe(1_000_000);
    expect(b.data.rosters).toHaveLength(2);
  });

  it('cache stats list what was stored; clearCache empties it', async () => {
    const { api } = mk();
    await api.leagueBundle('L1');
    const s = await api.cacheStats();
    expect(s.entries.map((e) => e.key)).toContain('sleeper:/v1/league/L1/rosters');
    expect(s.totalBytes).toBeGreaterThan(0);
    await api.clearCache();
    expect((await api.cacheStats()).entries).toEqual([]);
  });
});

describe('every request goes through the limiter', () => {
  it('counts calls in the limiter window', async () => {
    const { api, limiter } = mk();
    await api.leagueBundle('L1');
    expect(limiter.stats().lastMinute).toBe(5);
  });
});
