// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createCache } from './cache.ts';
import { DataError } from './errors.ts';
import { createDataLayer } from './index.ts';
import { TTL } from './sleeper.ts';
import { shapes } from './shapes.ts';
import { fakeTransport, ok, status, type FakeTransport } from './test-helpers.ts';
import { sleeperUrls } from './urls.ts';

const B = 'https://api.sleeper.app';
const ROWS = [
  { m: 1, r: 1, l: null, w: null, t1: 9, t2: 12 },
  { m: 5, r: 2, l: null, w: null, t1: null, t2: null, t2_from: { w: 2 }, t1_from: { w: 1 } },
  { p: 1, m: 9, r: 3, l: null, w: null, t1: null, t2: null, t2_from: { w: 6 }, t1_from: { w: 5 } },
];

let t: FakeTransport;
let clock: number;
const mk = () => createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
beforeEach(() => { clock = 1_000_000; t = fakeTransport(); });

describe('bracket urls and guards', () => {
  it('builds the documented endpoints', () => {
    expect(sleeperUrls.winnersBracket('L')).toBe(`${B}/v1/league/L/winners_bracket`);
    expect(sleeperUrls.losersBracket('L')).toBe(`${B}/v1/league/L/losers_bracket`);
  });

  it('accepts Sleeper\'s rows (null teams and results before the games are played)', () => {
    expect(shapes.bracket(ROWS)).toBe(true);
    expect(shapes.bracket([])).toBe(true);
    expect(shapes.bracket([{ m: 1, r: 1, t1: 3, t2: 1, w: 3, l: 1 }])).toBe(true);
  });

  it('rejects the wrong container or fields', () => {
    expect(shapes.bracket({})).toBe(false);
    expect(shapes.bracket('x')).toBe(false);
    expect(shapes.bracket([{ m: '1', r: 1, t1: 1, t2: 2, w: null, l: null }])).toBe(false);
    expect(shapes.bracket([{ m: 1, r: 1, t1: '3', t2: 2, w: null, l: null }])).toBe(false);
    expect(shapes.bracket([{ r: 1, t1: 3 }])).toBe(false);
  });
});

describe('bracket endpoints', () => {
  it('fetches both brackets', async () => {
    t.set(sleeperUrls.winnersBracket('L1'), ok(ROWS));
    t.set(sleeperUrls.losersBracket('L1'), ok([ROWS[0]]));
    const { sleeper } = mk();
    expect((await sleeper.winnersBracket('L1')).data).toHaveLength(3);
    expect((await sleeper.losersBracket('L1')).data).toHaveLength(1);
  });

  it('treats a null or empty body as no bracket yet', async () => {
    t.set(sleeperUrls.winnersBracket('L1'), ok(null));
    t.set(sleeperUrls.losersBracket('L1'), ok([]));
    const { sleeper } = mk();
    expect((await sleeper.winnersBracket('L1')).data).toEqual([]);
    expect((await sleeper.losersBracket('L1')).data).toEqual([]);
  });

  it('refetches after five minutes (the bracket changes as games finish) and not before', async () => {
    t.set(sleeperUrls.winnersBracket('L1'), ok(ROWS));
    const { sleeper } = mk();
    await sleeper.winnersBracket('L1');
    clock += 4 * 60_000;
    expect((await sleeper.winnersBracket('L1')).fromCache).toBe(true);
    clock += 2 * 60_000;
    expect((await sleeper.winnersBracket('L1')).fromCache).toBe(false);
    expect(t.count(sleeperUrls.winnersBracket('L1'))).toBe(2);
    expect(TTL.bracket).toBe(300_000);
  });

  it('a bad shape is a shape error; a 404 is not found; the cache covers a later failure', async () => {
    t.set(sleeperUrls.winnersBracket('L1'), ok({ nope: true }));
    const { sleeper } = mk();
    await expect(sleeper.winnersBracket('L1')).rejects.toMatchObject({ kind: 'shape' });
    await expect(sleeper.losersBracket('missing')).rejects.toBeInstanceOf(DataError);
    t.set(sleeperUrls.winnersBracket('L2'), ok(ROWS));
    await sleeper.winnersBracket('L2');
    clock += 10 * 60_000;
    t.set(sleeperUrls.winnersBracket('L2'), status(500));
    const stale = await sleeper.winnersBracket('L2');
    expect(stale).toMatchObject({ fromCache: true, stale: true });
    expect(stale.data).toHaveLength(3);
  });
});
