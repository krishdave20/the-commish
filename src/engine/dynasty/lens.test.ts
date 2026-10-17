import { describe, expect, it } from 'vitest';
import { classifyTeams, labelFor, lensReason, LENS_STRONG, type LensInput } from './lens.ts';

/** Twelve teams, strongest first, with every axis in the same order: rid 1 is best everywhere, rid 12 worst. */
function ladder(): LensInput[] {
  return Array.from({ length: 12 }, (_, i) => ({
    rid: i + 1, playoffPct: 1 - i / 12, ptsRos: 1200 - i * 20, value: 60000 - i * 3000, youthShare: 0.8 - i * 0.04,
  }));
}
const byRid = (teams: ReturnType<typeof classifyTeams>) => Object.fromEntries(teams.map((t) => [t.rid, t]));

describe('contender or rebuilder lens', () => {
  it('names the best team a contender and the worst a rebuilder', () => {
    const t = byRid(classifyTeams(ladder()));
    expect(t[1]).toMatchObject({ label: 'contender', nowScore: 1, futureScore: 1, playoffRank: 1, valueRank: 1 });
    expect(t[12]).toMatchObject({ label: 'rebuilder', nowScore: 0, futureScore: 0, playoffRank: 12 });
  });

  it('puts a strong-future, weak-now team in retool', () => {
    const rows = ladder();
    // rid 10: bad now, but the richest and youngest roster
    rows[9] = { rid: 10, playoffPct: 0.05, ptsRos: 900, value: 90000, youthShare: 0.95 };
    const t = byRid(classifyTeams(rows));
    expect(t[10]).toMatchObject({ label: 'retool', strongNow: false, strongFuture: true, valueRank: 1, youthRank: 1 });
  });

  it('puts a strong-now, weak-future team in all-in', () => {
    const rows = ladder();
    // rid 11: great odds and points, but an old, thin roster
    rows[10] = { rid: 11, playoffPct: 0.99, ptsRos: 1300, value: 20000, youthShare: 0.1 };
    const t = byRid(classifyTeams(rows));
    expect(t[11]).toMatchObject({ label: 'all-in', strongNow: true, strongFuture: false, playoffRank: 2, ptsRank: 1 });
  });

  it('the label is a function of the two strong flags', () => {
    expect(labelFor(true, true)).toBe('contender');
    expect(labelFor(true, false)).toBe('all-in');
    expect(labelFor(false, true)).toBe('retool');
    expect(labelFor(false, false)).toBe('rebuilder');
  });

  it('edge: the 6th of 12 is strong, the 7th is not (threshold 0.5)', () => {
    const t = classifyTeams(ladder());
    const sixth = t.find((x) => x.rid === 6)!, seventh = t.find((x) => x.rid === 7)!;
    expect(sixth.nowScore).toBeCloseTo(6 / 11, 10);
    expect(sixth.strongNow && sixth.strongFuture).toBe(true);
    expect(seventh.nowScore).toBeCloseTo(5 / 11, 10);
    expect(seventh.strongNow || seventh.strongFuture).toBe(false);
  });

  it('edge: a score of exactly 0.5 is strong (middle team of an odd-sized league)', () => {
    const rows = ladder().slice(0, 11);
    const mid = classifyTeams(rows).find((x) => x.rid === 6)!;
    expect(mid.nowScore).toBeCloseTo(LENS_STRONG, 10);
    expect(mid.strongNow).toBe(true);
    expect(mid.futureScore).toBeCloseTo(LENS_STRONG, 10);
    expect(mid.label).toBe('contender');
  });

  it('ties share the better rank, and one team is trivially the best', () => {
    const tied = classifyTeams([
      { rid: 1, playoffPct: 0.5, ptsRos: 100, value: 10, youthShare: 0.5 },
      { rid: 2, playoffPct: 0.5, ptsRos: 100, value: 10, youthShare: 0.5 },
      { rid: 3, playoffPct: 0.1, ptsRos: 90, value: 5, youthShare: 0.4 },
    ]);
    expect(tied.map((x) => x.playoffRank)).toEqual([1, 1, 3]);
    expect(classifyTeams([{ rid: 9, playoffPct: 0, ptsRos: 0, value: 0, youthShare: null }])[0]).toMatchObject({ label: 'contender', n: 1 });
  });

  it('a team with no youth share gets the middle on the youth half of the future score', () => {
    const rows = ladder();
    rows[0] = { ...rows[0]!, youthShare: null };
    const first = classifyTeams(rows)[0]!;
    expect(first.youthRank).toBeNull();
    expect(first.futureScore).toBeCloseTo(0.6 * 1 + 0.4 * 0.5, 10);
  });

  it('weights odds and points equally for win-now, value then youth for the future', () => {
    const t = classifyTeams([
      { rid: 1, playoffPct: 0.9, ptsRos: 100, value: 100, youthShare: 0.9 },
      { rid: 2, playoffPct: 0.1, ptsRos: 200, value: 50, youthShare: 0.1 },
    ]);
    expect(t[0]!.nowScore).toBeCloseTo(0.5, 10); // best odds, worst points
    expect(t[1]!.nowScore).toBeCloseTo(0.5, 10);
    expect(t[0]!.futureScore).toBe(1);
    expect(t[1]!.futureScore).toBe(0);
  });

  it('gives the reasoning numbers in a sentence', () => {
    const t = classifyTeams(ladder())[2]!;
    expect(lensReason(t)).toBe('playoff odds 83% (3rd of 12); 1,160 expected points rest of season (3rd); dynasty value 54,000 (3rd); 72% of player value is 26 or younger (3rd).');
  });
});
