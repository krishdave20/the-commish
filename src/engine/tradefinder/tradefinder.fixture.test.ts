// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../../data/cache.ts';
import { fixtureDirSource } from '../../data/fixtureNode.ts';
import { createDataLayer } from '../../data/index.ts';
import type { Transaction } from '../../data/types.ts';
import { fixtureTransport } from '../../data/transport.ts';
import { simulate } from '../sim.ts';
import { FIXTURE_DIR, fixtureModel } from '../test-helpers.ts';
import { evaluateTrade } from '../trades.ts';
import { emptyScenario } from '../scenario.ts';
import { findTradeIdeas, FINDER_MIN_MY_GAIN, finderSimInputs, gradeTrades, parseTrades, tradeSimPair } from './index.ts';

/* The league's own fixture (week 6, captured Oct 2026): 12 teams, 15-man rosters, and two real trades in the transactions. */
let loaded: Awaited<ReturnType<typeof fixtureModel>>;
let byWeek: Record<number, Transaction[]>;

beforeAll(async () => {
  loaded = await fixtureModel();
  const src = await fixtureDirSource(FIXTURE_DIR);
  const m = src.manifest;
  const captured = typeof m.captured_at === 'number' ? m.captured_at : Date.parse(m.captured_at);
  const layer = createDataLayer({ transport: fixtureTransport(src), cache: createCache({ memoryOnly: true }), now: () => captured });
  byWeek = {};
  for (let w = 1; w <= loaded.model.meta.currentWeek; w++) {
    // the fixture has no file for the week in progress: the app treats a failed week as empty, so does this
    byWeek[w] = (await layer.sleeper.transactions(m.league_id, w).catch(() => ({ data: [] as Transaction[] }))).data;
  }
});

describe('trade finder on the fixture league', () => {
  it('finds ideas for icemen: need qb, surplus wr, all gains real, inside 1.5 s', () => {
    const { model } = loaded;
    const res = findTradeIdeas(model, { rosterSize: 15 });
    expect(res.need).toBe('QB');
    expect(res.surplus).toBe('WR');
    expect(res.ideas.length).toBeGreaterThan(0);
    expect(res.ms).toBeLessThan(1500);
    expect(res.evaluated).toBeGreaterThan(100);
    for (const i of res.ideas) {
      expect(i.sides[0]!.gain).toBeGreaterThanOrEqual(FINDER_MIN_MY_GAIN);
      expect(i.sides.slice(1).every((s) => s.gain >= 0)).toBe(true);
      expect(i.text).toMatch(/\+\d+\.\d a week/);
      expect(i.sides[0]!.send.every((p) => p.pos === 'WR')).toBe(true);
    }
    // everyone is at 15: a 2-for-1 sends the partner over the limit, so the partner shows a drop
    for (const i of res.ideas.filter((x) => x.kind === 'two-for-one')) expect(i.sides[1]!.drop).not.toBeNull();
    for (const i of res.ideas.filter((x) => x.kind === 'one-for-two')) expect(i.sides[0]!.drop).not.toBeNull();
  });

  it('agrees with evaluateTrade for the top 2-for-1 (the partner drop costs nothing)', () => {
    const { model } = loaded;
    const top = findTradeIdeas(model, { rosterSize: 15 }).ideas.find((i) => i.kind === 'two-for-one')!;
    const ev = evaluateTrade(model, emptyScenario(), { partnerRid: top.sides[1]!.rid, send: top.sides[0]!.send.map((p) => p.pid), get: top.sides[0]!.get.map((p) => p.pid) });
    expect(top.sides[0]!.reg).toBeCloseTo(ev.myReg, 6);
    expect(top.sides[0]!.po).toBeCloseTo(ev.myPo, 6);
    expect(top.sides[1]!.reg).toBeLessThanOrEqual(ev.theirReg + 1e-9);
  });

  it('the sim inputs for the top ideas run: your playoff odds before and after', () => {
    const { model } = loaded;
    const top = findTradeIdeas(model, { rosterSize: 15 }).ideas.slice(0, 2);
    const inputs = finderSimInputs(model, emptyScenario(), top, { runs: 1500 });
    const before = simulate(inputs.before).teams[model.meRid]!.playoff;
    for (const i of top) {
      const after = simulate(inputs.afters[i.id]!).teams[model.meRid]!.playoff;
      expect(after).toBeGreaterThanOrEqual(0);
      expect(after).toBeLessThanOrEqual(1);
      expect(Math.abs(after - before)).toBeLessThan(0.5);
    }
  });
});

describe('real trades on the fixture league', () => {
  it('reads the two real trades from the transactions', () => {
    const trades = parseTrades(byWeek);
    expect(trades.map((t) => [t.week, t.teams.map((x) => x.rid)])).toEqual([[2, [1, 8]], [5, [5, 12]]]);
    expect(trades[0]!.teams[0]).toMatchObject({ rid: 1, got: ['12533'], sent: ['13296'], faab: 3 });
  });

  it('grades both sides and labels the biggest', () => {
    const { model } = loaded;
    const g = gradeTrades(model, parseTrades(byWeek));
    expect(g).toHaveLength(2);
    for (const x of g) {
      expect(x.sides).toHaveLength(2);
      for (const s of x.sides) { expect(s.grade).toMatch(/^[A-DF][+−]?$/); expect(s.got.every((p) => p.name !== '')).toBe(true); }
    }
    const year = g.filter((x) => x.labels.some((l) => l.kind === 'trade of the year'));
    expect(year).toHaveLength(1);
    expect(year[0]!.margin).toBe(Math.max(...g.map((x) => x.margin)));
  });

  it('runs the with and without simulations for a real trade', () => {
    const { model } = loaded;
    const [t] = parseTrades(byWeek);
    const pair = tradeSimPair(model, t!, undefined, { runs: 1000 });
    const a = simulate(pair.with), b = simulate(pair.without);
    for (const team of t!.teams) {
      expect(a.teams[team.rid]!.playoff).toBeGreaterThanOrEqual(0);
      expect(Math.abs(a.teams[team.rid]!.playoff - b.teams[team.rid]!.playoff)).toBeLessThan(0.5);
    }
  });
});
