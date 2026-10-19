// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allPlay } from '../league.ts';
import { POINTS, RIDS, historyOf } from './test-helpers.ts';
import { POWER_WEIGHTS, blend, finishedWeeks, powerParts, rankBy, scale100, scoreTeams, seasonToDate, weightsFor } from './score.ts';

const std = (weeks: number[], points = POINTS) => seasonToDate(historyOf(points), RIDS, weeks);
const of = (s: ReturnType<typeof std>, rid: number) => s.find((t) => t.rid === rid)!;

describe('season to date components', () => {
  const s = std([1, 2, 3, 4]);
  it('points for per game', () => {
    expect(of(s, 1).pf).toBe(310);
    expect(of(s, 1).games).toBe(4);
    expect(powerParts(s, null)[0]!.pfpg).toBe(77.5);
    expect(powerParts(s, null)[2]!.pfpg).toBe((80 + 80 + 100 + 120) / 4);
  });
  it('all-play share is the league all-play function over the same weeks (no ties counted as wins)', () => {
    const ap = allPlay(historyOf(POINTS), RIDS.map((rid) => ({ rid })));
    for (const rid of RIDS) {
      expect(of(s, rid).allPlayPct).toBeCloseTo(ap[rid]!.pct, 12);
      expect(of(s, rid).allPlayRecord).toEqual({ w: ap[rid]!.w, l: ap[rid]!.l });
    }
    // team 3 beat the field in weeks 3 and 4 and was 3rd and 3rd earlier
    expect(of(s, 3).allPlayRecord.w + of(s, 3).allPlayRecord.l).toBe(20);
  });
  it('only counts the weeks it is given', () => {
    const early = std([1, 2]);
    expect(of(early, 1).games).toBe(2);
    expect(powerParts(early, null)[0]!.pfpg).toBe(100);
    expect(of(early, 6).allPlayRecord).toEqual({ w: 0, l: 10 });
  });
  it('record from the head-to-head rows', () => {
    // team 1: w1 beat 2, w2 beat 2... (week 2 pairs 1-3: 100 vs 80 win), w3 60 v 70 loss, w4 (1-3) 50 v 120 loss
    expect(of(s, 1).record).toEqual({ w: 2, l: 2, t: 0 });
    expect(of(s, 3).record).toEqual({ w: 3, l: 1, t: 0 });
  });
  it('recent form is the last 3 weeks against each week\'s league average', () => {
    // league averages: w1 75, w2 75, w3 75, w4 81.67 (50+60+120+100+70+90 = 490 / 6)
    const avg4 = 490 / 6;
    // team 1 over weeks 2..4: (100-75) + (60-75) + (50-avg4)
    expect(of(s, 1).form).toBeCloseTo((25 - 15 + (50 - avg4)) / 3, 10);
    // with two weeks only, it is those two
    expect(of(std([1, 2]), 1).form).toBe(25);
  });
  it('streak: consecutive latest weeks above or below the league average', () => {
    expect(of(s, 3).streak).toEqual({ dir: 'over', weeks: 4 }); // 80 vs 75, 80 vs 75, 100 vs 75, 120 vs 81.7
  });
  it('luck is wins minus the all-play expectation', () => {
    const t = of(s, 3);
    expect(t.luck).toBeCloseTo(3 - t.allPlayPct * 4, 10);
  });
  it('last week\'s points and the league average that week', () => {
    expect(of(s, 1).lastPts).toBe(50);
    expect(of(s, 1).leagueAvg).toBeCloseTo(490 / 6, 10);
    expect(of(s, 1).lastVsAvg).toBeCloseTo(50 - 490 / 6, 10);
  });
  it('an unfinished week is not counted', () => {
    const rows = historyOf(POINTS, (w) => w < 4);
    const s3 = seasonToDate(rows, RIDS, [1, 2, 3, 4]);
    expect(of(s3, 1).games).toBe(3);
  });
});

describe('streaks', () => {
  const flat = [10, 20, 30, 40, 50, 60]; // league average 35
  it('counts the latest weeks on one side of the league average', () => {
    const s = seasonToDate(historyOf([flat, flat, flat, flat]), RIDS, [1, 2, 3, 4]);
    expect(of(s, 1).streak).toEqual({ dir: 'under', weeks: 4 });
    expect(of(s, 4).streak).toEqual({ dir: 'over', weeks: 4 });
  });
  it('breaks at the first week on the other side', () => {
    const s = seasonToDate(historyOf([flat, flat, flat, [40, 20, 30, 10, 50, 60]]), RIDS, [1, 2, 3, 4]);
    expect(of(s, 1).streak).toEqual({ dir: 'over', weeks: 1 });
    expect(of(s, 4).streak).toEqual({ dir: 'under', weeks: 1 });
  });
  it('a week exactly at the average is no streak', () => {
    expect(of(seasonToDate(historyOf([[35, 35, 35, 35, 35, 35]]), RIDS, [1]), 1).streak).toBeNull();
  });
});

describe('scaling and the blend', () => {
  it('scale100 maps the league range to 0..100 and gives everyone 50 when all tie', () => {
    expect(scale100([10, 20, 30])).toEqual([0, 50, 100]);
    expect(scale100([7, 7, 7])).toEqual([50, 50, 50]);
  });
  it('weights: 35 / 25 / 15 / 25 with the roster part, the other three renormalised without it', () => {
    expect(POWER_WEIGHTS).toEqual({ allPlay: 0.35, pf: 0.25, form: 0.15, ros: 0.25 });
    const w = weightsFor(true), n = weightsFor(false);
    expect(w.allPlay + w.pf + w.form + w.ros).toBeCloseTo(1, 12);
    expect(n.allPlay + n.pf + n.form + n.ros).toBeCloseTo(1, 12);
    expect(n.ros).toBe(0);
    expect(n.allPlay).toBeCloseTo(0.35 / 0.75, 12);
    expect(n.pf).toBeCloseTo(0.25 / 0.75, 12);
    expect(n.form).toBeCloseTo(0.15 / 0.75, 12);
  });
  it('blend is the weighted sum of the scaled parts, and 0..100', () => {
    expect(blend({ pfpg: 100, allPlay: 100, form: 100, ros: 100 })).toBeCloseTo(100, 10);
    expect(blend({ pfpg: 0, allPlay: 0, form: 0, ros: 0 })).toBe(0);
    expect(blend({ pfpg: 40, allPlay: 80, form: 20, ros: 60 })).toBeCloseTo(0.35 * 80 + 0.25 * 40 + 0.15 * 20 + 0.25 * 60, 10);
    // without ros: all-play 80, pf 40, form 20
    expect(blend({ pfpg: 40, allPlay: 80, form: 20, ros: null })).toBeCloseTo((0.35 * 80 + 0.25 * 40 + 0.15 * 20) / 0.75, 10);
  });
  it('scoreTeams uses ros only when every team has it', () => {
    const s = std([1, 2, 3, 4]);
    const without = scoreTeams(powerParts(s, null));
    expect(without.every((x) => x.scaled.ros === null)).toBe(true);
    const ros = Object.fromEntries(RIDS.map((r) => [r, 100 + r]));
    const withRos = scoreTeams(powerParts(s, ros));
    expect(withRos.every((x) => x.scaled.ros !== null)).toBe(true);
    expect(withRos[5]!.scaled.ros).toBe(100);
    expect(withRos[0]!.scaled.ros).toBe(0);
    for (const x of [...without, ...withRos]) { expect(x.index).toBeGreaterThanOrEqual(0); expect(x.index).toBeLessThanOrEqual(100); }
  });
});

describe('helpers', () => {
  it('rankBy: 1 is highest, ties by the second key, then roster id', () => {
    expect(rankBy([1, 2, 3], [5, 9, 5], [1, 1, 2])).toEqual([3, 1, 2]);
    expect(rankBy([1, 2, 3], [5, 5, 5])).toEqual([1, 2, 3]);
  });
  it('finishedWeeks lists weeks whose rows are all final, within the regular season', () => {
    expect(finishedWeeks(historyOf(POINTS), 8)).toEqual([1, 2, 3, 4]);
    expect(finishedWeeks(historyOf(POINTS, (w) => w < 3), 8)).toEqual([1, 2]);
    expect(finishedWeeks(historyOf(POINTS), 2)).toEqual([1, 2]);
    expect(finishedWeeks([], 8)).toEqual([]);
  });
});
