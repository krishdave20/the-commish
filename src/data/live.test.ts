// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { DataError } from './errors.ts';
import { createDataLayer } from './index.ts';
import { fakeTransport, ok, type FakeTransport } from './test-helpers.ts';
import { TTL } from './sleeper.ts';
import { sleeperUrls } from './urls.ts';

let t: FakeTransport;
let clock: number;
const mk = () => createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
const game = { game_id: '202610616', status: 'in_game', start_time: 1792355100000, metadata: { home_team: 'KC', away_team: 'LAC', quarter: '1', time_remaining: '7:21' } };
const matchup = { roster_id: 1, matchup_id: 1, points: 12.5, starters: ['a'], starters_points: [12.5], players_points: { a: 12.5 } };

beforeEach(() => {
  clock = 1_000_000;
  t = fakeTransport([
    [sleeperUrls.scores('2026', 6), ok([game])],
    [sleeperUrls.matchups('L1', 6), ok([matchup])],
  ]);
});

describe('live endpoints', () => {
  it('builds the scores url (undocumented endpoint, same host)', () => {
    expect(sleeperUrls.scores('2026', 6)).toBe('https://api.sleeper.app/scores/nfl/regular/2026/6');
  });

  it('keeps matchups and scores fresh for only 30 seconds, and force skips the copy', async () => {
    const { sleeper } = mk();
    expect(TTL.live).toBe(30_000);
    await sleeper.liveMatchups('L1', 6);
    await sleeper.scores('2026', 6);
    clock += 20_000;
    expect((await sleeper.liveMatchups('L1', 6)).fromCache).toBe(true);
    expect((await sleeper.scores('2026', 6)).fromCache).toBe(true);
    expect(t.count(sleeperUrls.matchups('L1', 6))).toBe(1);
    clock += 11_000;
    expect((await sleeper.liveMatchups('L1', 6)).fromCache).toBe(false);
    expect((await sleeper.scores('2026', 6)).fromCache).toBe(false);
    clock += 1000;
    await sleeper.scores('2026', 6, { force: true });
    expect(t.count(sleeperUrls.scores('2026', 6))).toBe(3);
  });

  it('shares the matchups cache entry with the model pull (same url, so the pull benefits from each poll)', async () => {
    const { sleeper } = mk();
    await sleeper.liveMatchups('L1', 6, { force: true });
    const m = await sleeper.matchups('L1', 6);
    expect(m.fromCache).toBe(true);
    expect(m.data[0]).toMatchObject({ points: 12.5, starters_points: [12.5] });
  });

  it('serves the last copy as stale when the scores feed goes down, and rejects a body of the wrong shape', async () => {
    const { sleeper } = mk();
    await sleeper.scores('2026', 6);
    clock += 60_000;
    t.set(sleeperUrls.scores('2026', 6), { status: 503, body: null, bytes: 0, ms: 1 });
    const stale = await sleeper.scores('2026', 6);
    expect(stale).toMatchObject({ fromCache: true, stale: true });
    t.set(sleeperUrls.scores('2026', 7), ok({ nope: true }));
    await expect(sleeper.scores('2026', 7)).rejects.toBeInstanceOf(DataError);
  });

  it('answers an empty list when Sleeper sends null', async () => {
    t.set(sleeperUrls.scores('2026', 9), ok(null));
    const { sleeper } = mk();
    expect((await sleeper.scores('2026', 9)).data).toEqual([]);
  });
});
