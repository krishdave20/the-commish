// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BracketRow } from '../../data/types.ts';
import { baseSimInput, simulate } from '../index.ts';
import { fixtureModel } from '../test-helpers.ts';
import {
  bracketFromSleeper, bracketOrder, buildBracket, championOf, losersModeOf, machineOrder, matchupOf, playOnce, prunePicks, projectedOrder,
  rankTeams, realGamesOf, resolveBracket, roundWeeks, simulateConsolation, simulatePlayoffs, simulateToiletBowl, splitOrder, standingsOrder,
  type BracketCtx, type PlayoffRules,
} from './index.ts';

const rules = (o: Partial<PlayoffRules> = {}) => ({ weekStart: 15, roundType: 0, seedType: 0, ...o });
const seedsOf = (n: number) => Array.from({ length: n }, (_, i) => 100 + i + 1); // rid = 100 + seed
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** every team scores 100 a week with a 20 SD, except where `strong` says otherwise */
function ctxFor(rids: number[], over: Record<number, number> = {}, o: Partial<BracketCtx> = {}): BracketCtx {
  const means: BracketCtx['means'] = {};
  for (const r of rids) means[r] = { 15: over[r] ?? 100, 16: over[r] ?? 100, 17: over[r] ?? 100, 18: over[r] ?? 100 };
  return { means, sd: 20, currentWeek: 6, ...o };
}

describe('bracket construction', () => {
  it('standard bracket order is the layout Sleeper uses', () => {
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 3, 6, 2, 7]);
  });

  it('4 teams: 1v4 and 2v3, then the final', () => {
    const b = buildBracket({ kind: 'championship', seedOrder: seedsOf(4), rules: rules() });
    expect(b.rounds).toBe(2);
    expect(b.matches.map((m) => m.id)).toEqual(['r1m1', 'r1m2', 'r2m1']);
    const r = resolveBracket(b);
    expect(r.map((m) => [m.a.seed, m.b.seed])).toEqual([[1, 4], [2, 3], [null, null]]);
  });

  it('8 teams: 1v8, 4v5, 3v6, 2v7, no byes; the winner of 1v8 meets the winner of 4v5', () => {
    const b = buildBracket({ kind: 'championship', seedOrder: seedsOf(8), rules: rules() });
    expect(b.rounds).toBe(3);
    const r = resolveBracket(b);
    expect(r.filter((m) => m.round === 1).map((m) => [m.a.seed, m.b.seed])).toEqual([[1, 8], [4, 5], [3, 6], [2, 7]]);
    expect(r.some((m) => m.aBye || m.bBye)).toBe(false);
    const picks = { r1m1: 101, r1m2: 105 };
    const r2 = resolveBracket(b, picks).find((m) => m.id === 'r2m1')!;
    expect([r2.a.rid, r2.b.rid]).toEqual([101, 105]);
  });

  it('6 teams: seeds 1 and 2 have byes and meet the 4v5 and 3v6 winners', () => {
    const b = buildBracket({ kind: 'championship', seedOrder: seedsOf(6), rules: rules() });
    expect(b.rounds).toBe(3);
    const r = resolveBracket(b);
    expect(r.filter((m) => m.round === 1).map((m) => [m.a.seed, m.b.seed])).toEqual([[4, 5], [3, 6]]);
    const r2 = r.filter((m) => m.round === 2);
    expect(r2).toHaveLength(2);
    expect(r2[0]).toMatchObject({ a: { seed: 1 }, aBye: true, bBye: false });
    expect(r2[1]).toMatchObject({ b: { seed: 2 }, aBye: false, bBye: true });
    // 1 plays the winner of 4v5; 2 plays the winner of 3v6
    const adv = resolveBracket(b, { r1m1: 105, r1m2: 103 });
    expect(adv.find((m) => m.id === 'r2m1')).toMatchObject({ a: { rid: 101 }, b: { rid: 105 } });
    expect(adv.find((m) => m.id === 'r2m2')).toMatchObject({ a: { rid: 103 }, b: { rid: 102 } });
  });

  it('12 teams: the top four have byes and round 1 is 5v12, 6v11, 7v10, 8v9 (in the standard order)', () => {
    const b = buildBracket({ kind: 'championship', seedOrder: seedsOf(12), rules: rules() });
    expect(b.rounds).toBe(4);
    const r = resolveBracket(b);
    const r1 = r.filter((m) => m.round === 1).map((m) => [m.a.seed, m.b.seed].sort((x, y) => x! - y!));
    expect(r1).toHaveLength(4);
    expect(r1).toEqual(expect.arrayContaining([[5, 12], [6, 11], [7, 10], [8, 9]]));
    const byes = r.filter((m) => m.round === 2).flatMap((m) => [m.aBye ? m.a.seed : null, m.bBye ? m.b.seed : null]).filter(Boolean);
    expect(byes.sort()).toEqual([1, 2, 3, 4]);
    expect(b.matches).toHaveLength(11);
  });

  it('reseed: round 2 pairs the best surviving seed with the worst', () => {
    const b = buildBracket({ kind: 'championship', seedOrder: seedsOf(8), rules: rules({ seedType: 1 }) });
    expect(b.reseed).toBe(true);
    // upsets everywhere: 8, 5, 6, 7 survive (seeds 5,6,7,8) -> 5v8 and 6v7
    const r = resolveBracket(b, { r1m1: 108, r1m2: 105, r1m3: 106, r1m4: 107 });
    const r2 = r.filter((m) => m.round === 2).map((m) => [m.a.seed, m.b.seed]);
    expect(r2).toEqual([[5, 8], [6, 7]]);
    // the fixed bracket would have paired 8 with 5? check it differs from fixed for another outcome: chalk 1,4,3,2 survive
    const chalk = resolveBracket(b, { r1m1: 101, r1m2: 104, r1m3: 103, r1m4: 102 }).filter((m) => m.round === 2).map((m) => [m.a.seed, m.b.seed]);
    expect(chalk).toEqual([[1, 4], [2, 3]]);
    const fixed = buildBracket({ kind: 'championship', seedOrder: seedsOf(8), rules: rules() });
    const fixedChalk = resolveBracket(fixed, { r1m1: 101, r1m2: 104, r1m3: 103, r1m4: 102 }).filter((m) => m.round === 2).map((m) => [m.a.seed, m.b.seed]);
    expect(fixedChalk).toEqual([[1, 4], [3, 2]]);
  });

  it('fewer than two teams make no games', () => {
    expect(buildBracket({ kind: 'toilet', seedOrder: [7], rules: rules() }).matches).toEqual([]);
    expect(buildBracket({ kind: 'toilet', seedOrder: [], rules: rules() }).rounds).toBe(0);
  });

  it('round weeks: one week per round, two-week championship, two weeks every round', () => {
    expect(roundWeeks(3, { weekStart: 15, roundType: 0 })).toEqual([[15], [16], [17]]);
    expect(roundWeeks(3, { weekStart: 15, roundType: 1 })).toEqual([[15], [16], [17, 18]]);
    expect(roundWeeks(2, { weekStart: 14, roundType: 2 })).toEqual([[14, 15], [16, 17]]);
    // weeks past 18 do not exist
    expect(roundWeeks(3, { weekStart: 16, roundType: 0 })).toEqual([[16], [17], [18]]);
    expect(roundWeeks(2, { weekStart: 17, roundType: 2 })).toEqual([[17, 18], [18]]);
  });

  it('picks pointing at teams that are not in a game are ignored, and prunePicks drops them', () => {
    const b = buildBracket({ kind: 'championship', seedOrder: seedsOf(4), rules: rules() });
    const picks = { r1m1: 101, r1m2: 102, r2m1: 101 };
    expect(prunePicks(b, picks)).toEqual(picks);
    // change an earlier pick: the downstream pick for 101 is gone
    const changed = prunePicks(b, { ...picks, r1m1: 104 });
    expect(changed).toEqual({ r1m1: 104, r1m2: 102 });
    expect(championOf(resolveBracket(b, picks))).toBe(101);
    expect(championOf(resolveBracket(b, changed))).toBeNull();
  });
});

describe('the toilet bowl: the loser advances', () => {
  it('a 4-team toilet bowl seeded worst-first crowns the team that loses every game', () => {
    const b = buildBracket({ kind: 'toilet', seedOrder: [12, 11, 10, 9], rules: rules() }); // seed 1 = the worst team, roster 12
    const r = resolveBracket(b);
    expect(r.filter((m) => m.round === 1).map((m) => [m.a.rid, m.b.rid])).toEqual([[12, 9], [11, 10]]);
    // real games: 12 lost to 9, 10 lost to 11 -> the losers advance
    const played = buildBracket({ kind: 'toilet', seedOrder: [12, 11, 10, 9], rules: rules(), real: [{ w: 9, l: 12 }, { w: 11, l: 10 }] });
    const rr = resolveBracket(played);
    expect(rr[0]).toMatchObject({ advancer: 12, out: 9, locked: true });
    expect(rr[1]).toMatchObject({ advancer: 10, out: 11, locked: true });
    expect(rr[2]).toMatchObject({ a: { rid: 12 }, b: { rid: 10 }, advancer: null });
    // the final is picked: roster 10 gets flushed too -> crowned
    const done = resolveBracket(played, { r2m1: 10 });
    expect(championOf(done)).toBe(10);
  });

  it('a decided toilet bowl gives the crowned team 100% and the sums are 1', () => {
    const seedOrder = [12, 11, 10, 9];
    const b = buildBracket({ kind: 'toilet', seedOrder, rules: rules(), real: [{ w: 9, l: 12 }, { w: 11, l: 10 }, { w: 12, l: 10 }] });
    // r2: 12 vs 10, 12 won, so 10 (the loser) is flushed
    const ctx = ctxFor(seedOrder);
    const o = simulateToiletBowl(b, { ...ctx });
    expect(o[10]!.flushPct).toBeCloseTo(1, 12);
    expect(o[12]!.flushPct).toBeCloseTo(0, 12);
    expect(sum(Object.values(o).map((x) => x.flushPct))).toBeCloseTo(1, 12);
  });

  it('flush odds favour the weaker team (it loses more) and add to 1', () => {
    const seedOrder = [12, 11, 10, 9, 8, 7];
    const b = buildBracket({ kind: 'toilet', seedOrder, rules: rules() });
    const ctx = ctxFor(seedOrder, { 12: 70, 11: 90, 8: 130 });
    const o = simulateToiletBowl(b, ctx);
    expect(sum(Object.values(o).map((x) => x.flushPct))).toBeCloseTo(1, 12);
    expect(o[12]!.flushPct).toBeGreaterThan(o[8]!.flushPct);
    expect(o[12]!.flushPct).toBeGreaterThan(1 / 6);
    // the same field as a consolation bracket crowns the best team instead
    const conso = simulateConsolation(buildBracket({ kind: 'consolation', seedOrder: [...seedOrder].reverse(), rules: rules() }), ctx);
    expect(sum(Object.values(conso).map((x) => x.consolationPct))).toBeCloseTo(1, 12);
    expect(conso[8]!.consolationPct).toBeGreaterThan(conso[12]!.consolationPct);
  });

  it('the chance of advancing from a game is the chance of losing it', () => {
    const b = buildBracket({ kind: 'toilet', seedOrder: [12, 9], rules: rules() });
    const ctx = ctxFor([12, 9], { 12: 80 });
    const m = matchupOf(b, ctx, 1, 12, 9);
    expect(m.pOutscoreA).toBeLessThan(0.5);
    expect(m.pAdvanceA).toBeCloseTo(1 - m.pOutscoreA, 12);
    expect(m.pAdvanceA + m.pAdvanceB).toBeCloseTo(1, 12);
    const champ = matchupOf(buildBracket({ kind: 'championship', seedOrder: [12, 9], rules: rules() }), ctx, 1, 12, 9);
    expect(champ.pAdvanceA).toBeCloseTo(m.pOutscoreA, 12);
  });
});

describe('title odds', () => {
  it('a decided bracket gives the champion 100% and everyone else 0', () => {
    const seedOrder = seedsOf(4);
    const real = [{ w: 101, l: 104 }, { w: 103, l: 102 }, { w: 101, l: 103 }];
    const b = buildBracket({ kind: 'championship', seedOrder, rules: rules(), real });
    const o = simulatePlayoffs(b, ctxFor(seedOrder));
    expect(o[101]!.titlePct).toBeCloseTo(1, 12);
    for (const r of [102, 103, 104]) expect(o[r]!.titlePct).toBeCloseTo(0, 12);
    expect(o[101]!.expFinish).toBe(1);
    expect(o[103]!.expFinish).toBe(2);
    expect(o[102]!.expFinish).toBe(3.5);
  });

  it('title odds sum to 1, and the finals sum to 2, fixed and reseed, with byes and without', () => {
    for (const n of [4, 6, 8, 12]) {
      for (const seedType of [0, 1]) {
        const seedOrder = seedsOf(n);
        const b = buildBracket({ kind: 'championship', seedOrder, rules: rules({ seedType }) });
        const over: Record<number, number> = {};
        seedOrder.forEach((r, i) => { over[r] = 120 - i * 4; });
        const o = simulatePlayoffs(b, ctxFor(seedOrder, over));
        expect(sum(Object.values(o).map((x) => x.titlePct)), `${n} teams seedType ${seedType}`).toBeCloseTo(1, 10);
        expect(sum(Object.values(o).map((x) => x.finalsPct))).toBeCloseTo(2, 10);
        // the best team is the favourite
        const best = Object.entries(o).sort((a, c) => c[1].titlePct - a[1].titlePct)[0]![0];
        expect(Number(best)).toBe(101);
        // places: the champion's expected finish beats the field's
        expect(sum(Object.values(o).map((x) => x.expFinish))).toBeCloseTo((n * (n + 1)) / 2, 8);
      }
    }
  });

  it('picks move the odds: picking a team to advance raises its title chance and a decided pick removes the opponent', () => {
    const seedOrder = seedsOf(8);
    const b = buildBracket({ kind: 'championship', seedOrder, rules: rules() });
    const ctx = ctxFor(seedOrder);
    const base = simulatePlayoffs(b, ctx);
    const picked = simulatePlayoffs(b, { ...ctx, picks: { r1m1: 108 } });
    expect(picked[108]!.titlePct).toBeGreaterThan(base[108]!.titlePct);
    expect(picked[101]!.titlePct).toBe(0);
    expect(sum(Object.values(picked).map((x) => x.titlePct))).toBeCloseTo(1, 12);
  });

  it('two-week rounds add means and variances: a 2-week final is less of a coin flip than a 1-week one', () => {
    const seedOrder = [101, 102];
    const ctx = ctxFor(seedOrder, { 101: 110 });
    const one = buildBracket({ kind: 'championship', seedOrder, rules: rules() });
    const two = buildBracket({ kind: 'championship', seedOrder, rules: rules({ roundType: 1 }) });
    expect(two.roundWeeks).toEqual([[15, 16]]);
    const m1 = matchupOf(one, ctx, 1, 101, 102), m2 = matchupOf(two, ctx, 1, 101, 102);
    expect(m1.meanA).toBe(110);
    expect(m2.meanA).toBe(220);
    expect(m2.meanB).toBe(200);
    expect(m2.pOutscoreA).toBeGreaterThan(m1.pOutscoreA);
    // exactly: mean difference doubles, SD grows by sqrt 2 -> z grows by sqrt 2
    const z = (p: number) => {
      // invert via the same erf-based normal cdf by bisection
      let lo = -6, hi = 6;
      for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; const c = 0.5 * (1 + (Math.sign(mid) * Math.sqrt(1 - Math.exp(-mid * mid * (4 / Math.PI + 0.147 * mid * mid) / (1 + 0.147 * mid * mid))))); if (c < p) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    };
    expect(z(m2.pOutscoreA) / z(m1.pOutscoreA)).toBeCloseTo(Math.SQRT2, 2);
    // the current week's SD is x0.85
    const cur = matchupOf(one, { ...ctx, currentWeek: 15 }, 1, 101, 102);
    expect(cur.pOutscoreA).toBeGreaterThan(m1.pOutscoreA);
  });

  it('a missing week borrows the team average; a team with no means scores zero', () => {
    const seedOrder = [101, 102];
    const b = buildBracket({ kind: 'championship', seedOrder, rules: rules() });
    const ctx: BracketCtx = { means: { 101: { 6: 100, 7: 120 }, 102: {} }, sd: 20, currentWeek: 6 };
    const m = matchupOf(b, ctx, 1, 101, 102);
    expect(m.meanA).toBe(110);
    expect(m.meanB).toBe(0);
  });

  it('a big bracket falls back to sampling and still adds to 1', () => {
    const seedOrder = Array.from({ length: 20 }, (_, i) => 200 + i);
    const b = buildBracket({ kind: 'championship', seedOrder, rules: rules() });
    const o = simulatePlayoffs(b, { ...ctxFor(seedOrder), runs: 600, seed: 3 });
    expect(sum(Object.values(o).map((x) => x.titlePct))).toBeCloseTo(1, 9);
  });

  it('playOnce is seeded: the same seed gives the same run, a different seed another, and every game is decided', () => {
    const seedOrder = seedsOf(8);
    const b = buildBracket({ kind: 'championship', seedOrder, rules: rules() });
    const ctx = ctxFor(seedOrder);
    const a = playOnce(b, ctx, { seed: 7 }), c = playOnce(b, ctx, { seed: 7 }), d = playOnce(b, ctx, { seed: 8 });
    expect(a).toEqual(c);
    expect(a.picks).not.toEqual(d.picks);
    expect(Object.keys(a.picks)).toHaveLength(7);
    expect(a.champion).not.toBeNull();
    expect(championOf(resolveBracket(b, a.picks))).toBe(a.champion);
    // the toilet bowl advances the lower score
    const t = buildBracket({ kind: 'toilet', seedOrder: [12, 11, 10, 9], rules: rules() });
    const run = playOnce(t, ctxFor([12, 11, 10, 9]), { seed: 5 });
    const [sx, sy] = run.scores.r1m1!;
    expect(run.picks.r1m1).toBe(sx! < sy! ? 12 : 9);
  });
});

/* ---------- Sleeper's rows ---------- */

const row = (m: number, r: number, t1: number | null, t2: number | null, w: number | null = null, l: number | null = null, extra: Partial<BracketRow> = {}): BracketRow =>
  ({ m, r, t1, t2, w, l, ...extra });

/** the finished 8-team 2025 season of the fixture account's other league, as Sleeper sent it */
const FINISHED: BracketRow[] = [
  row(1, 1, 3, 1, 3, 1), row(2, 1, 5, 6, 5, 6), row(3, 1, 2, 4, 2, 4), row(4, 1, 7, 8, 7, 8),
  row(5, 2, 3, 5, 3, 5, { t1_from: { w: 1 }, t2_from: { w: 2 } }), row(6, 2, 2, 7, 7, 2, { t1_from: { w: 3 }, t2_from: { w: 4 } }),
  row(7, 2, 1, 6, 1, 6, { t1_from: { l: 1 }, t2_from: { l: 2 } }), row(8, 2, 4, 8, 4, 8, { t1_from: { l: 3 }, t2_from: { l: 4 } }),
  row(9, 3, 3, 7, 3, 7, { p: 1, t1_from: { w: 5 }, t2_from: { w: 6 } }), row(10, 3, 5, 2, 5, 2, { p: 3, t1_from: { l: 5 }, t2_from: { l: 6 } }),
  row(11, 3, 1, 4, 4, 1, { p: 5, t1_from: { w: 7 }, t2_from: { w: 8 } }), row(12, 3, 6, 8, 6, 8, { p: 7, t1_from: { l: 7 }, t2_from: { l: 8 } }),
];

/** the live league's winners bracket before any game: Sleeper fills round 1 from the standings */
const PRESEASON: BracketRow[] = [
  row(1, 1, 9, 12), row(2, 1, 3, 8), row(3, 1, 11, 7), row(4, 1, 5, 4),
  row(5, 2, null, null, null, null, { t1_from: { w: 1 }, t2_from: { w: 2 } }), row(6, 2, null, null, null, null, { t1_from: { w: 3 }, t2_from: { w: 4 } }),
  row(7, 2, null, null, null, null, { t1_from: { l: 1 }, t2_from: { l: 2 } }), row(8, 2, null, null, null, null, { t1_from: { l: 3 }, t2_from: { l: 4 } }),
  row(9, 3, null, null, null, null, { p: 1, t1_from: { w: 5 }, t2_from: { w: 6 } }), row(10, 3, null, null, null, null, { p: 3, t1_from: { l: 5 }, t2_from: { l: 6 } }),
  row(11, 3, null, null, null, null, { p: 5, t1_from: { w: 7 }, t2_from: { w: 8 } }), row(12, 3, null, null, null, null, { p: 7, t1_from: { l: 7 }, t2_from: { l: 8 } }),
];

describe('bracketFromSleeper', () => {
  it('keeps only the road to the title (not the 5th-place and placement games) and locks the real results', () => {
    const b = bracketFromSleeper(FINISHED, { rules: rules() })!;
    expect(b.origin).toBe('sleeper');
    expect(b.rounds).toBe(3);
    expect(b.matches).toHaveLength(7);
    expect(b.matches.map((m) => m.sleeperM)).toEqual([1, 2, 3, 4, 5, 6, 9]);
    expect(b.matches.map((m) => m.id)).toEqual(['r1m1', 'r1m2', 'r1m3', 'r1m4', 'r2m1', 'r2m2', 'r3m1']);
    const r = resolveBracket(b);
    expect(r.every((m) => m.locked)).toBe(true);
    expect(championOf(r)).toBe(3);
    const o = simulatePlayoffs(b, ctxFor([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(o[3]!.titlePct).toBeCloseTo(1, 12);
    expect(o[7]!.finalsPct).toBeCloseTo(1, 12);
  });

  it('reads seeds off the standard layout (round-1 game order 1v8, 4v5, 3v6, 2v7)', () => {
    const b = bracketFromSleeper(FINISHED, { rules: rules() })!;
    // rosters 3,5,2,7 are seeds 1,4,3,2 and rosters 1,6,4,8 are seeds 8,5,6,7
    expect(b.seeds).toEqual({ 3: 1, 1: 8, 5: 4, 6: 5, 2: 3, 4: 6, 7: 2, 8: 7 });
  });

  it('a bracket before the playoffs: round 1 filled from the standings, nothing decided, everything open to pick', () => {
    const b = bracketFromSleeper(PRESEASON, { rules: rules() })!;
    expect(b.matches).toHaveLength(7);
    const r = resolveBracket(b);
    expect(r.filter((m) => m.round === 1).map((m) => [m.a.rid, m.b.rid])).toEqual([[9, 12], [3, 8], [11, 7], [5, 4]]);
    expect(r.filter((m) => m.round === 1).every((m) => m.ready && !m.locked)).toBe(true);
    expect(r.find((m) => m.id === 'r2m1')).toMatchObject({ ready: false });
    const next = resolveBracket(b, { r1m1: 12, r1m2: 3 });
    expect(next.find((m) => m.id === 'r2m1')).toMatchObject({ a: { rid: 12 }, b: { rid: 3 }, ready: true });
    const o = simulatePlayoffs(b, ctxFor([9, 12, 3, 8, 11, 7, 5, 4]));
    expect(sum(Object.values(o).map((x) => x.titlePct))).toBeCloseTo(1, 12);
  });

  it('a bracket half played: the real results stand, the rest is open', () => {
    const rows = PRESEASON.map((r) => (r.m === 1 ? { ...r, w: 9, l: 12 } : r.m === 2 ? { ...r, w: 8, l: 3 } : r));
    const b = bracketFromSleeper(rows, { rules: rules() })!;
    const r = resolveBracket(b, { r1m1: 12 }); // a pick cannot overturn a real result
    expect(r[0]).toMatchObject({ locked: true, advancer: 9, picked: false });
    expect(r.find((m) => m.id === 'r2m1')).toMatchObject({ a: { rid: 9 }, b: { rid: 8 }, ready: true, locked: false });
    const o = simulatePlayoffs(b, ctxFor([9, 12, 3, 8, 11, 7, 5, 4]));
    expect(o[12]!.titlePct).toBe(0);
    expect(o[3]!.titlePct).toBe(0);
  });

  it('byes: a team that already sits in round 2 is a bye entrant', () => {
    // a 6-team layout: round 1 has 2 games, round 2 starts with the byes in their slots
    const rows: BracketRow[] = [
      row(1, 1, 5, 4), row(2, 1, 3, 6),
      row(3, 2, 1, null, null, null, { t2_from: { w: 1 } }), row(4, 2, null, 2, null, null, { t1_from: { w: 2 } }),
      row(5, 3, null, null, null, null, { p: 1, t1_from: { w: 3 }, t2_from: { w: 4 } }),
    ];
    const b = bracketFromSleeper(rows, { rules: rules() })!;
    expect(b.matches).toHaveLength(5);
    const r = resolveBracket(b, { r1m1: 4 });
    expect(r.find((m) => m.id === 'r2m1')).toMatchObject({ a: { rid: 1 }, b: { rid: 4 } });
    // seeds from the layout: 1 and 2 are the byes
    expect(b.seeds[1]).toBe(1);
    expect(b.seeds[2]).toBe(2);
    expect(b.seeds[5]).toBe(4);
    expect(b.seeds[4]).toBe(5);
  });

  it('empty, null and malformed input give no bracket', () => {
    expect(bracketFromSleeper([], { rules: rules() })).toBeNull();
    expect(bracketFromSleeper(null, { rules: rules() })).toBeNull();
    expect(bracketFromSleeper(undefined, { rules: rules() })).toBeNull();
  });

  it('a reseed league ignores links after round 1 and shows round 2 when Sleeper fills it', () => {
    const rows = PRESEASON.map((r) => (r.m === 5 ? { ...r, t1: 9, t2: 3 } : r));
    const b = bracketFromSleeper(rows, { rules: rules({ seedType: 1 }) })!;
    const r = resolveBracket(b);
    expect(r.find((m) => m.id === 'r2m1')).toMatchObject({ a: { rid: 9 }, b: { rid: 3 }, ready: true });
    expect(r.find((m) => m.id === 'r2m2')).toMatchObject({ a: { rid: null }, ready: false });
  });

  it('detects whether the league\'s losers bracket is a consolation bracket or a toilet bowl, and lists the games played', () => {
    const consolation: BracketRow[] = [
      row(1, 1, 10, 1, 10, 1), row(2, 1, 2, 6), row(3, 2, 10, null, null, null, { p: 1, t1_from: { w: 1 }, t2_from: { w: 2 } }),
      row(4, 2, 1, null, null, null, { p: 3, t1_from: { l: 1 }, t2_from: { l: 2 } }),
    ];
    expect(losersModeOf(consolation)).toBe('consolation');
    const toilet = consolation.map((r) => (r.p === 1 ? { ...r, t1_from: { l: 1 }, t2_from: { l: 2 } } : r));
    expect(losersModeOf(toilet)).toBe('toilet');
    expect(losersModeOf([])).toBeNull();
    expect(losersModeOf(null)).toBeNull();
    expect(realGamesOf(consolation)).toEqual([{ w: 10, l: 1 }]);
    expect(realGamesOf(null)).toEqual([]);
  });

  it('real losers-bracket games lock a toilet bowl built from the standings, wherever the pair meets', () => {
    // 12 teams, 8 make it: rosters 10, 1, 2, 6 are the field; Sleeper played 10v1 and 2v6 and then its 3rd-place game
    const real = [{ w: 10, l: 1 }, { w: 6, l: 2 }, { w: 1, l: 2 }];
    const b = buildBracket({ kind: 'toilet', seedOrder: [2, 1, 6, 10], rules: rules(), real });
    const r = resolveBracket(b);
    // seed 1 (2) meets seed 4 (10); seed 2 (1) meets seed 3 (6): the pairs differ from Sleeper's, so those games stay open
    expect(r.filter((m) => m.round === 1).every((m) => !m.locked)).toBe(true);
    const aligned = buildBracket({ kind: 'toilet', seedOrder: [1, 2, 10, 6], rules: rules(), real });
    const ra = resolveBracket(aligned);
    expect(ra.filter((m) => m.round === 1).map((m) => [m.a.rid, m.b.rid])).toEqual([[1, 6], [2, 10]]);
  });
});

describe('seeding', () => {
  const team = (rid: number, wins: number, pf: number, divId: number, ties = 0) => ({ rid, wins, losses: 6 - wins, ties, pf, divId });
  // division 1: rids 1-3, division 2: rids 4-6
  const teams = [team(1, 4, 600, 1), team(2, 5, 650, 1), team(3, 2, 500, 1), team(4, 5, 700, 2), team(5, 4, 620, 2), team(6, 1, 450, 2)];

  it('division winners first, then the rest by record with points for breaking ties', () => {
    // division winners: 2 (5-1, 650) and 4 (5-1, 700); then 1 (4-2, 600), 5 (4-2, 620) by pf
    expect(rankTeams(teams, { playoffTeams: 4, divisions: 2 })).toEqual([4, 2, 5, 1, 3, 6]);
    expect(rankTeams(teams, { playoffTeams: 4, divisions: 0 })).toEqual([4, 2, 5, 1, 3, 6]);
    // a division winner with a worse record still jumps the wildcard
    const odd = [team(1, 5, 650, 1), team(2, 5, 700, 1), team(3, 1, 400, 2), team(4, 4, 600, 2), team(5, 4, 610, 2), team(6, 1, 300, 2)];
    expect(rankTeams(odd, { playoffTeams: 4, divisions: 2 }).slice(0, 2)).toEqual([2, 5]);
    expect(standingsOrder(teams, { playoffTeams: 4, divisions: 2 })).toEqual([4, 2, 5, 1, 3, 6]);
  });

  it('splits the order into playoff seeds and the field: worst-first for a toilet bowl, best-first for consolation', () => {
    const order = [4, 2, 5, 1, 3, 6];
    expect(splitOrder(order, 4, 'toilet')).toEqual({ playoff: [4, 2, 5, 1], field: [6, 3] });
    expect(splitOrder(order, 4, 'consolation')).toEqual({ playoff: [4, 2, 5, 1], field: [3, 6] });
    expect(splitOrder(order, 5, 'toilet').field).toEqual([]); // one team is not a bracket
    expect(splitOrder(order, 6, 'toilet').field).toEqual([]);
  });

  it('projected: the most likely seed, never giving two teams one seed', () => {
    const t = [
      { rid: 1, seeds: [0.5, 0.3, 0.1], expW: 9, pf: 1 },
      { rid: 2, seeds: [0.45, 0.4, 0.05], expW: 8, pf: 1 },
      { rid: 3, seeds: [0.05, 0.2, 0.6], expW: 7, pf: 1 },
      { rid: 4, seeds: [0, 0.05, 0.2], expW: 4, pf: 1 },
      { rid: 5, seeds: [0, 0, 0], expW: 2, pf: 1 },
    ];
    // 3 takes seed 3 (0.6), 1 takes seed 1 (0.5), 2 is left with seed 2
    expect(projectedOrder(t, 3)).toEqual([1, 2, 3, 4, 5]);
    // both teams like seed 1 best; the likelier one gets it and the other takes its next best
    const tie = [{ rid: 1, seeds: [0.4, 0.35], expW: 8, pf: 1 }, { rid: 2, seeds: [0.6, 0.3], expW: 8, pf: 1 }, { rid: 3, seeds: [0, 0], expW: 3, pf: 1 }];
    expect(projectedOrder(tie, 2)).toEqual([2, 1, 3]);
    // an empty seat goes to the likeliest remaining team
    const gap = [{ rid: 1, seeds: [1, 0, 0], expW: 8, pf: 1 }, { rid: 2, seeds: [0, 0, 0.1], expW: 6, pf: 1 }, { rid: 3, seeds: [0, 0, 0.05], expW: 5, pf: 1 }];
    expect(projectedOrder(gap, 3)).toEqual([1, 3, 2]); // team 2 takes seat 3 (0.1); the empty seat 2 goes to the next likeliest team
    expect(new Set(projectedOrder(gap, 3)).size).toBe(3);
  });

  it('the machine: picks decide the games they cover, the favourite decides the rest', () => {
    const games = [{ id: 'g1', week: 7, teamA: 3, teamB: 1 }, { id: 'g2', week: 7, teamA: 6, teamB: 4 }];
    const means = { 1: { 7: 100 }, 3: { 7: 90 }, 4: { 7: 110 }, 6: { 7: 80 } };
    const rl = { playoffTeams: 2, divisions: 0 };
    const none = machineOrder(teams, games, {}, means, rl);
    expect(none.slice(0, 2)).toEqual([4, 1]); // 1 beats 3 (5-1, more points than team 2) and 4 beats 6
    const flipped = machineOrder(teams, games, { g2: 6, g1: 3 }, means, rl);
    expect(flipped.slice(0, 2)).toEqual([4, 2]); // team 1 now loses to 3, so team 2 (5-1) is second again
  });
});

/* ---------- the season simulation ---------- */

describe('the playoff part of the season simulation', () => {
  it('leaves every regular-season number exactly as it was (the fixture, exact equality)', async () => {
    const { model } = await fixtureModel();
    const input = baseSimInput(model);
    expect(input.playoff).toBeDefined();
    const withPlayoffs = simulate(input);
    const without = simulate({ ...input, playoff: undefined });
    expect(Object.keys(withPlayoffs.teams)).toEqual(Object.keys(without.teams));
    for (const rid of Object.keys(without.teams)) {
      const a = withPlayoffs.teams[Number(rid)]!, b = without.teams[Number(rid)]!;
      expect(a.playoff).toBe(b.playoff);
      expect(a.div).toBe(b.div);
      expect(a.expW).toBe(b.expW);
      expect(a.seeds).toEqual(b.seeds);
      expect(a.winsP10).toBe(b.winsP10);
      expect(a.winsP90).toBe(b.winsP90);
      expect(b.titlePct).toBeUndefined();
      expect(a.titlePct).toBeDefined();
    }
    expect(withPlayoffs.myHist).toEqual(without.myHist);
    expect(withPlayoffs.n).toBe(without.n);
  });

  it('title odds sum to 1, finals to 2, flush and consolation to 1 over the fixture league', async () => {
    const { model } = await fixtureModel();
    const s = simulate(baseSimInput(model));
    const t = Object.values(s.teams);
    expect(sum(t.map((x) => x.titlePct!))).toBeCloseTo(1, 9);
    expect(sum(t.map((x) => x.finalsPct!))).toBeCloseTo(2, 9);
    expect(sum(t.map((x) => x.flushPct!))).toBeCloseTo(1, 9);
    expect(sum(t.map((x) => x.consolationPct!))).toBeCloseTo(1, 9);
    // 12 teams, 8 playoff spots: four teams in the field in every run
    expect(sum(t.map((x) => x.inToiletBowlPct!))).toBeCloseTo(4, 9);
    for (const x of t) {
      expect(x.titlePct!).toBeLessThanOrEqual(x.playoff + 1e-12);
      expect(x.flushPct!).toBeLessThanOrEqual(x.inToiletBowlPct! + 1e-12);
      expect(x.inToiletBowlPct!).toBeCloseTo(1 - x.playoff, 9);
    }
  });

  it('is deterministic and applied to the model', async () => {
    const { model } = await fixtureModel();
    expect(simulate(baseSimInput(model))).toEqual(simulate(baseSimInput(model)));
    expect(model.teams.every((t) => typeof t.titlePct === 'number' && typeof t.flushPct === 'number')).toBe(true);
    expect(model.meta.playoff).toMatchObject({ teams: 8, weekStart: 15, roundType: 0, seedType: 0 });
  });

  it('a league that has no non-playoff teams has no toilet bowl', async () => {
    const { model } = await fixtureModel();
    const input = { ...baseSimInput(model), playoffTeams: model.teams.length, runs: 500 };
    const s = simulate(input);
    expect(sum(Object.values(s.teams).map((x) => x.flushPct!))).toBe(0);
    expect(sum(Object.values(s.teams).map((x) => x.titlePct!))).toBeCloseTo(1, 9);
  });
});
