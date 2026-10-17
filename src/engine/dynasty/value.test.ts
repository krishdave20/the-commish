import { describe, expect, it } from 'vitest';
import { rosterAsset, teamDynastyValue, YOUNG_MAX_AGE } from './value.ts';
import type { PickValuation } from './picks.ts';
import { fcPlayer } from './test-helpers.ts';

const pick = (value: number | null, estimated = false): PickValuation => ({
  key: `k${value}`, season: '2027', round: 1, originalRosterId: 1, ownerRosterId: 1, acquired: false, bucket: 'mid', value, estimated, fcId: null, label: '2027 1st',
});

describe('rosterAsset', () => {
  const fc = { a: fcPlayer('a', 5000, 'RB', 'Alpha Back') };
  it('joins the FantasyCalc row and the age', () => {
    expect(rosterAsset('a', fc, { age: 23 })).toEqual({ pid: 'a', name: 'Alpha Back', pos: 'RB', value: 5000, age: 23 });
  });
  it('keeps a player FantasyCalc does not value, with the players file\'s facts', () => {
    expect(rosterAsset('z', fc, { age: 30, pos: 'TE', name: 'Zed' })).toEqual({ pid: 'z', name: 'Zed', pos: 'TE', value: null, age: 30 });
    expect(rosterAsset('q', null, null)).toEqual({ pid: 'q', name: 'q', pos: '?', value: null, age: null });
  });
});

describe('teamDynastyValue', () => {
  const roster = [
    { pid: 'a', name: 'a', pos: 'RB', value: 5000, age: 22 },
    { pid: 'b', name: 'b', pos: 'WR', value: 3000, age: YOUNG_MAX_AGE }, // 26 is still young
    { pid: 'c', name: 'c', pos: 'WR', value: 2000, age: YOUNG_MAX_AGE + 1 }, // 27 is old
    { pid: 'd', name: 'd', pos: 'QB', value: 4000, age: 33 },
    { pid: 'e', name: 'e', pos: 'TE', value: 1000, age: null },
    { pid: 'f', name: 'f', pos: 'TE', value: null, age: 25 },
  ];
  const v = teamDynastyValue(7, roster, [pick(3000), pick(1500, true), pick(null)]);

  it('sums players and picks', () => {
    expect(v.players).toBe(15000);
    expect(v.picks).toBe(4500);
    expect(v.total).toBe(19500);
    expect(v.pickCount).toBe(3);
    expect(v.estimatedPicks).toBe(1);
  });
  it('splits value by position', () => {
    expect(v.byPosition).toEqual({ RB: 5000, WR: 5000, QB: 4000, TE: 1000 });
  });
  it('splits value by age: 26 and under vs 27 and up, unknown ages on their own', () => {
    expect(v.young).toBe(8000);
    expect(v.old).toBe(6000);
    expect(v.unknownAge).toBe(1000);
    expect(v.youthShare).toBeCloseTo(8000 / 14000, 10);
  });
  it('counts unvalued players without adding value', () => {
    expect(v.unvalued).toBe(1);
  });
  it('has no youth share when no valued player has an age, and zero value for an empty team', () => {
    expect(teamDynastyValue(1, [{ pid: 'x', name: 'x', pos: 'WR', value: 100, age: null }], []).youthShare).toBeNull();
    expect(teamDynastyValue(1, [], [])).toMatchObject({ total: 0, youthShare: null, byPosition: {} });
  });
});
