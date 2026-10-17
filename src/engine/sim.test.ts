// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { winProb } from './league.ts';
import { DEFAULT_SEED, createSim, mulberry32, quantile, simulate, simulateChunked, type SimInput } from './sim.ts';
import { cancelSim, runSimInWorker } from './simRunner.ts';
import type { SimWorkerIn, SimWorkerOut } from './sim.worker.ts';

/** 4 teams in 2 divisions ({1,2} and {3,4}), 3 weeks of round-robin games, current week 5. */
function league(over: Partial<SimInput> = {}): SimInput {
  const games: SimInput['games'] = [];
  const pairs: Array<[number, number]> = [[1, 3], [2, 4], [1, 4], [2, 3], [1, 2], [3, 4]];
  pairs.forEach(([a, b], i) => games.push({ id: `g${i}`, week: 5 + Math.floor(i / 2), teamA: a, teamB: b }));
  const means: SimInput['means'] = {};
  for (const r of [1, 2, 3, 4]) means[r] = { 5: 100 - 4 * r, 6: 100 - 4 * r, 7: 100 - 4 * r };
  return {
    teams: [1, 2, 3, 4].map((rid) => ({ rid, wins: 0, pf: 0, divId: rid <= 2 ? 1 : 2 })),
    games, means, sd: 20, currentWeek: 5, playoffTeams: 3, divisions: 2, runs: 4000, ...over,
  };
}
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('PRNG', () => {
  it('mulberry32 is reproducible and uniform in [0,1)', () => {
    const a = mulberry32(DEFAULT_SEED), b = mulberry32(DEFAULT_SEED);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(sum(xs) / 1000).toBeCloseTo(0.5, 1);
    // golden values from the reference's mulberry32 (same constants)
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12);
  });
  it('quantile interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([5], 0.9)).toBe(5);
    expect(quantile([], 0.5)).toBeNaN();
  });
});

describe('simulate: determinism', () => {
  it('the same seed gives identical output, a different seed gives a different one', () => {
    const a = simulate(league({ seed: 7 })), b = simulate(league({ seed: 7 })), c = simulate(league({ seed: 8 }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it('the default seed is 20261016', () => {
    expect(simulate(league())).toEqual(simulate(league({ seed: DEFAULT_SEED })));
  });
  it('stepping in chunks equals one run', () => {
    const s = createSim(league());
    let guard = 0;
    while (!s.step(777) && guard++ < 100) { /* keep stepping */ }
    expect(s.done).toBe(4000);
    expect(s.summary()).toEqual(simulate(league()));
  });
  it('simulateChunked gives the same answer, reports progress, and can be abandoned', async () => {
    const seen: number[] = [];
    const out = await simulateChunked(league(), (f) => seen.push(f), { chunk: 300, sliceMs: 1 });
    expect(out).toEqual(simulate(league()));
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((x, i) => i === 0 || x >= seen[i - 1]!)).toBe(true);
    let polls = 0;
    expect(await simulateChunked(league(), undefined, { chunk: 10, sliceMs: 0, isStale: () => polls++ > 2 })).toBeNull();
  });
});

describe('simulate: probabilities', () => {
  it('playoff probabilities sum to the playoff team count; division wins sum to the division count; seeds are a distribution', () => {
    const r = simulate(league());
    const t = Object.values(r.teams);
    expect(sum(t.map((x) => x.playoff))).toBeCloseTo(3, 9);
    expect(sum(t.map((x) => x.div))).toBeCloseTo(2, 9);
    for (const x of t) expect(sum(x.seeds)).toBeCloseTo(x.playoff, 9);
    for (let s = 0; s < 3; s++) expect(sum(t.map((x) => x.seeds[s]!))).toBeCloseTo(1, 9);
    expect(r.n).toBe(4000);
  });
  it('division winners take the top seeds (seeds 1-2 are division winners)', () => {
    const r = simulate(league());
    const divWinnerSeeds = [1, 2, 3, 4].map((rid) => r.teams[rid]!.seeds[0]! + r.teams[rid]!.seeds[1]!);
    expect(sum(divWinnerSeeds)).toBeCloseTo(2, 9);
    expect(sum([1, 2, 3, 4].map((rid) => r.teams[rid]!.div))).toBeCloseTo(2, 9);
    for (const rid of [1, 2, 3, 4]) expect(r.teams[rid]!.seeds[0]! + r.teams[rid]!.seeds[1]!).toBeCloseTo(r.teams[rid]!.div, 9);
  });
  it('with zero divisions it seeds by record only', () => {
    const r = simulate(league({ divisions: 0, teams: league().teams.map((t) => ({ ...t, divId: t.rid })), playoffTeams: 2 }));
    const t = Object.values(r.teams);
    expect(sum(t.map((x) => x.playoff))).toBeCloseTo(2, 9);
    expect(sum(t.map((x) => x.div))).toBe(0);
    // the strongest team (highest mean) is likeliest
    expect(r.teams[1]!.playoff).toBeGreaterThan(r.teams[4]!.playoff);
  });
  it('playoff teams are capped at the number of teams', () => {
    const r = simulate(league({ playoffTeams: 10, divisions: 0 }));
    expect(sum(Object.values(r.teams).map((x) => x.playoff))).toBeCloseTo(4, 9);
  });
  it('the current week uses 0.85 of the weekly SD; later weeks the full SD; volatility scales it', () => {
    const one = (week: number, extra: Partial<SimInput> = {}): SimInput => ({
      teams: [{ rid: 1, wins: 0, pf: 0, divId: 1 }, { rid: 2, wins: 0, pf: 0, divId: 2 }],
      games: [{ id: 'g', week, teamA: 1, teamB: 2 }], means: { 1: { [week]: 100 }, 2: { [week]: 90 } },
      sd: 20, currentWeek: 5, playoffTeams: 1, divisions: 0, runs: 40000, ...extra,
    });
    expect(simulate(one(5)).teams[1]!.playoff).toBeCloseTo(winProb(100, 90, 17), 1);
    expect(simulate(one(6)).teams[1]!.playoff).toBeCloseTo(winProb(100, 90, 20), 1);
    expect(simulate(one(6, { volatility: 2 })).teams[1]!.playoff).toBeCloseTo(winProb(100, 90, 40), 1);
  });
  it('tracks the win histogram for meRid', () => {
    const r = simulate(league({ meRid: 2 }));
    expect(sum(Object.values(r.myHist).map((h) => h.n))).toBe(4000);
    for (const h of Object.values(r.myHist)) expect(h.made).toBeLessThanOrEqual(h.n);
    expect(simulate(league()).myHist).toEqual({});
  });
});

describe('simulate: playoff-machine picks', () => {
  it('picks force the winner of a game', () => {
    const base = league({ runs: 500 });
    // team 4 (weakest) is made to win all of its games, team 1 (strongest) to lose all of them
    const picks: Record<string, number> = {};
    for (const g of base.games) {
      if (g.teamA === 4 || g.teamB === 4) picks[g.id] = 4;
      else if (g.teamA === 1 || g.teamB === 1) picks[g.id] = g.teamA === 1 ? g.teamB : g.teamA;
    }
    const r = simulate({ ...base, picks });
    expect(r.teams[4]!.expW).toBe(3);
    expect(r.teams[1]!.expW).toBe(0);
    // team 1 lost every game, team 4 won every game: team 4 wins its division
    expect(r.teams[4]!.div).toBe(1);
    expect(r.teams[1]!.div).toBe(0);
  });
  it('a fully picked slate has no randomness in the standings', () => {
    const base = league({ runs: 200 });
    const picks = Object.fromEntries(base.games.map((g) => [g.id, g.teamA]));
    const r = simulate({ ...base, picks });
    for (const rid of [1, 2, 3, 4]) expect(Number.isInteger(r.teams[rid]!.expW)).toBe(true);
    const r2 = simulate({ ...base, picks, seed: 99 });
    for (const rid of [1, 2, 3, 4]) expect(r2.teams[rid]!.expW).toBe(r.teams[rid]!.expW);
  });
  it('picks do not disturb the random stream of the unpicked games', () => {
    const base = league({ runs: 300 });
    const first = base.games[0]!;
    const forced = simulate({ ...base, picks: { [first.id]: first.teamB } });
    expect(forced.teams[first.teamB]!.expW).toBeGreaterThan(simulate(base).teams[first.teamB]!.expW);
  });
});

describe('runSimInWorker', () => {
  afterEach(() => { (globalThis as { Worker?: unknown }).Worker = undefined; cancelSim('a'); cancelSim('b'); cancelSim('scen'); });

  it('falls back to time slices on the calling thread when Worker is undefined', async () => {
    expect(typeof Worker).toBe('undefined');
    const progress: number[] = [];
    const out = await runSimInWorker(league(), (f) => progress.push(f));
    expect(out).toEqual(simulate(league()));
    expect(progress.at(-1)).toBe(1);
  });
  it('a newer run on the same channel cancels the older one (it resolves null)', async () => {
    const first = runSimInWorker(league({ runs: 20000 }), undefined, { channel: 'a' });
    const second = runSimInWorker(league({ runs: 500, seed: 3 }), undefined, { channel: 'a' });
    expect(await first).toBeNull();
    expect(await second).toEqual(simulate(league({ runs: 500, seed: 3 })));
  });
  it('different channels do not cancel each other', async () => {
    const a = runSimInWorker(league({ runs: 500 }), undefined, { channel: 'a' });
    const b = runSimInWorker(league({ runs: 500, seed: 5 }), undefined, { channel: 'b' });
    expect(await a).not.toBeNull();
    expect(await b).not.toBeNull();
  });

  /** A stand-in Worker that runs sim.worker.ts's protocol inline, to test the main-thread side. */
  class FakeWorker {
    static made: FakeWorker[] = [];
    onmessage: ((e: { data: SimWorkerOut }) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    url: URL;
    opts: { type: string };
    constructor(url: URL, opts: { type: string }) { this.url = url; this.opts = opts; FakeWorker.made.push(this); }
    postMessage(m: SimWorkerIn) {
      setTimeout(() => {
        if (this.terminated) return;
        const s = createSim(m.input);
        s.step(m.input.runs / 2);
        this.onmessage?.({ data: { type: 'progress', frac: s.done / s.total } });
        s.step(m.input.runs);
        this.onmessage?.({ data: { type: 'done', summary: s.summary() } });
      }, 0);
    }
    terminate() { this.terminated = true; }
  }
  it('uses a module worker when one exists, reports progress, and terminates it afterwards', async () => {
    FakeWorker.made = [];
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const progress: number[] = [];
    const out = await runSimInWorker(league({ runs: 400 }), (f) => progress.push(f));
    expect(out).toEqual(simulate(league({ runs: 400 })));
    expect(progress).toEqual([0.5, 1]);
    expect(FakeWorker.made.length).toBe(1);
    expect(FakeWorker.made[0]!.opts).toEqual({ type: 'module' });
    expect(String(FakeWorker.made[0]!.url)).toMatch(/sim\.worker\.ts$/);
    expect(FakeWorker.made[0]!.terminated).toBe(true);
  });
  it('cancelling terminates the stale worker and resolves null', async () => {
    FakeWorker.made = [];
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const first = runSimInWorker(league({ runs: 400 }), undefined, { channel: 'a' });
    const second = runSimInWorker(league({ runs: 400, seed: 2 }), undefined, { channel: 'a' });
    expect(await first).toBeNull();
    expect(FakeWorker.made[0]!.terminated).toBe(true);
    expect(await second).toEqual(simulate(league({ runs: 400, seed: 2 })));
  });
  it('falls back to the main thread when the worker errors', async () => {
    class Broken extends FakeWorker {
      override postMessage() { setTimeout(() => this.onerror?.(), 0); }
    }
    (globalThis as { Worker?: unknown }).Worker = Broken;
    expect(await runSimInWorker(league({ runs: 400 }))).toEqual(simulate(league({ runs: 400 })));
  });
});
