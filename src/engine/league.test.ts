// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allPlay, erf, luck, winProb } from './league.ts';
import type { HistoryRow } from './types.ts';

const h = (week: number, rid: number, pts: number, final = true): HistoryRow => ({ key: `w${week}-${rid}`, week, rid, opp: 0, pts, oppPts: 0, final });

describe('all-play', () => {
  // two finished weeks, three teams. Week 1: 1=100, 2=90, 3=80. Week 2: 1=70, 2=95, 3=60. Week 3 is in progress.
  const history = [h(1, 1, 100), h(1, 2, 90), h(1, 3, 80), h(2, 1, 70), h(2, 2, 95), h(2, 3, 60), h(3, 1, 999, false), h(3, 2, 0, false), h(3, 3, 0, false)];
  it('counts a win for every team a team outscored in each finished week', () => {
    const ap = allPlay(history, [{ rid: 1 }, { rid: 2 }, { rid: 3 }]);
    expect(ap[1]).toMatchObject({ w: 3, l: 1, record: '3–1', pct: 0.75 });
    expect(ap[2]).toMatchObject({ w: 3, l: 1, record: '3–1' });
    expect(ap[3]).toMatchObject({ w: 0, l: 4, pct: 0 });
  });
  it('ignores the in-progress week', () => {
    expect(allPlay(history, [{ rid: 1 }])[1]!.w + allPlay(history, [{ rid: 1 }])[1]!.l).toBe(4);
  });
  it('luck = actual wins − all-play pct × games played', () => {
    expect(luck({ wins: 2, losses: 0, ties: 0 }, { pct: 0.5 })).toBe(1);
    expect(luck({ wins: 1, losses: 2, ties: 0 }, { pct: 0.75 })).toBeCloseTo(-1.25, 12);
    expect(luck({ wins: 1, losses: 1, ties: 1 }, { pct: 0.5 })).toBeCloseTo(-0.5, 12);
  });
  it('an empty history gives 0-0 and pct 0', () => {
    expect(allPlay([], [{ rid: 1 }])[1]).toMatchObject({ w: 0, l: 0, pct: 0 });
  });
});

describe('winProb', () => {
  it('is 50% for equal means and symmetric', () => {
    expect(winProb(100, 100, 20)).toBeCloseTo(0.5, 6);
    expect(winProb(110, 100, 20) + winProb(100, 110, 20)).toBeCloseTo(1, 6);
  });
  it('matches the normal CDF of the score difference (SD √2 · sd)', () => {
    // P(N(0, (√2·20)²) < 10) = Φ(0.35355) = 0.6382
    expect(winProb(110, 100, 20)).toBeCloseTo(0.638, 3);
    expect(winProb(150, 100, 20)).toBeGreaterThan(0.95);
  });
  it('a bigger SD pulls it toward 50%', () => {
    expect(winProb(110, 100, 40)).toBeLessThan(winProb(110, 100, 20));
  });
  it('erf approximation is accurate to ~1e-6', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(erf(-1)).toBeCloseTo(-0.8427008, 6);
    expect(erf(2)).toBeCloseTo(0.9953223, 6);
  });
});
