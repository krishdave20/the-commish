// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { futurePicksByRoster } from './picks.ts';

describe('future picks (dynasty)', () => {
  const traded = [
    { season: '2027', round: 1, roster_id: 1, owner_id: 2 },
    { season: '2027', round: 2, roster_id: 3, owner_id: 1 },
    { season: '2028', round: 1, roster_id: 1, owner_id: 2 },
    { season: '2028', round: 1, roster_id: 1, owner_id: 3 }, // traded on again: the last owner wins
    { season: '2031', round: 1, roster_id: 1, owner_id: 2 }, // outside the seasons asked for: ignored
  ];
  const r = futurePicksByRoster(traded, [1, 2, 3], ['2027', '2028'], 2);
  it('every team starts with its own picks; trades move them', () => {
    expect(r[1]!.length).toBe(4 - 2 + 1); // lost 27R1 and 28R1, gained 27R2 from 3
    expect(r[2]!.length).toBe(4 + 1);
    expect(r[3]!.length).toBe(4 - 1 + 1);
    expect(r[1]!.find((p) => p.originalRosterId === 3)).toEqual({ season: '2027', round: 2, originalRosterId: 3, acquired: true });
    expect(r[2]!.filter((p) => p.acquired)).toEqual([{ season: '2027', round: 1, originalRosterId: 1, acquired: true }]);
    expect(r[3]!.filter((p) => p.acquired)).toEqual([{ season: '2028', round: 1, originalRosterId: 1, acquired: true }]);
  });
  it('picks are accounted for exactly once', () => {
    expect(Object.values(r).flat().length).toBe(3 * 2 * 2);
  });
  it('no trades = everyone owns their own', () => {
    const none = futurePicksByRoster([], [1, 2], ['2027'], 1);
    expect(none[1]).toEqual([{ season: '2027', round: 1, originalRosterId: 1, acquired: false }]);
  });
});
