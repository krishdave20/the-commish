// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { createDataLayer } from './index.ts';
import { fakeTransport, ok, type FakeTransport } from './test-helpers.ts';
import { TTL } from './sleeper.ts';
import { sleeperUrls } from './urls.ts';

let t: FakeTransport;
let clock: number;
const mk = () => createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
const HOUR = 3_600_000;
const done = { game_id: 'g1', status: 'complete', start_time: 1_000, metadata: { home_team: 'KC', away_team: 'LAC', quarter: 'F', home_score: 20, away_score: 10 } };
const midGame = { ...done, status: 'in_game', metadata: { ...done.metadata, quarter: '2' } };

beforeEach(() => {
  clock = 100 * HOUR;
  t = fakeTransport([[sleeperUrls.scores('2026', 3), ok([done])], [sleeperUrls.stats('2026', 3), ok({ p1: { pts_ppr: 10 } })]]);
});

describe('pastScores', () => {
  it('keeps a finished week for a day', async () => {
    const { sleeper } = mk();
    expect(TTL.final).toBe(24 * HOUR);
    await sleeper.pastScores('2026', 3);
    clock += 23 * HOUR;
    expect((await sleeper.pastScores('2026', 3)).fromCache).toBe(true);
    clock += 2 * HOUR;
    expect((await sleeper.pastScores('2026', 3)).fromCache).toBe(false);
    expect(t.count(sleeperUrls.scores('2026', 3))).toBe(2);
  });

  it('does not trust a copy saved mid-game once the game should be over', async () => {
    t.set(sleeperUrls.scores('2026', 3), ok([midGame]));
    const { sleeper } = mk();
    // saved while the game was on (kickoff 99 hours ago in this fake clock is long past the 5 hour mark)
    await sleeper.scores('2026', 3);
    t.set(sleeperUrls.scores('2026', 3), ok([done]));
    const r = await sleeper.pastScores('2026', 3);
    expect(r.fromCache).toBe(false);
    expect(r.data[0]!.status).toBe('complete');
    // and now the settled copy is used
    expect((await sleeper.pastScores('2026', 3)).fromCache).toBe(true);
  });
});

describe('pastStats', () => {
  it('keeps a finished week’s stat lines for a day, in the same cache entry as stats', async () => {
    const { sleeper } = mk();
    await sleeper.pastStats('2026', 3);
    clock += 23 * HOUR;
    const again = await sleeper.pastStats('2026', 3);
    expect(again.fromCache).toBe(true);
    expect(again.data.p1!.pts_ppr).toBe(10);
    clock += 2 * HOUR;
    expect((await sleeper.pastStats('2026', 3)).fromCache).toBe(false);
  });
});

describe('liveStats', () => {
  it('is fresh for 30 seconds and shares the stats cache entry', async () => {
    const { sleeper } = mk();
    await sleeper.liveStats('2026', 3);
    clock += 20_000;
    expect((await sleeper.liveStats('2026', 3)).fromCache).toBe(true);
    expect((await sleeper.stats('2026', 3)).fromCache).toBe(true);
    clock += 11_000;
    expect((await sleeper.liveStats('2026', 3)).fromCache).toBe(false);
  });
});
