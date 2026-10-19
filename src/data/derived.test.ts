// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { createDataLayer } from './index.ts';
import { fakeTransport } from './test-helpers.ts';

const DAY = 24 * 3_600_000;

/** recall and keep: a value worked out from raw responses (the almanac's finished seasons), saved beside them. */
describe('derived values', () => {
  const setup = () => {
    let clock = 1_000_000;
    const cache = createCache({ memoryOnly: true });
    const { sleeper } = createDataLayer({ transport: fakeTransport(), cache, now: () => clock });
    return { sleeper, cache, tick: (ms: number) => { clock += ms; } };
  };

  it('gives back what was kept, until it is older than the freshness asked for', async () => {
    const { sleeper, tick } = setup();
    expect(await sleeper.recall('almanac:season:v2:L1', 30 * DAY)).toBeNull();
    await sleeper.keep('almanac:season:v2:L1', { season: '2024', matchups: { 1: [{ roster_id: 1, points: 90.5 }] } });
    expect(await sleeper.recall('almanac:season:v2:L1', 30 * DAY)).toEqual({ season: '2024', matchups: { 1: [{ roster_id: 1, points: 90.5 }] } });
    tick(29 * DAY);
    expect(await sleeper.recall('almanac:season:v2:L1', 30 * DAY)).not.toBeNull();
    tick(2 * DAY);
    expect(await sleeper.recall('almanac:season:v2:L1', 30 * DAY)).toBeNull();
  });

  it('keeps each key on its own, apart from the raw responses', async () => {
    const { sleeper, cache } = setup();
    await sleeper.keep('a', 1);
    await sleeper.keep('b', 2);
    expect(await sleeper.recall('a', DAY)).toBe(1);
    expect(await sleeper.recall('b', DAY)).toBe(2);
    expect(await cache.get('a')).toBeNull();
    expect((await cache.get('derived:a'))?.data).toBe(1);
  });
});
