import { describe, expect, it } from 'vitest';
import {
  EXTRA_ROUND_DECAY, firstPickSeason, indexFcPicks, parsePickId, pickKey, pickPrice, pickSeasons, projectedBuckets, roundLabel,
  valuePicks, type FinishTeam,
} from './picks.ts';
import { fcPickRows, fcPlayer } from './test-helpers.ts';

const index = () => indexFcPicks(fcPickRows())!;

describe('FantasyCalc pick ids', () => {
  it('parse bucketed (round is index + 1) and plain ids', () => {
    expect(parsePickId('FP_2027_early_0')).toEqual({ season: 2027, round: 1, bucket: 'early' });
    expect(parsePickId('FP_2027_late_3')).toEqual({ season: 2027, round: 4, bucket: 'late' });
    expect(parsePickId('FP_2028_2')).toEqual({ season: 2028, round: 2, bucket: null });
    expect(parsePickId('9221')).toBeNull();
    expect(parsePickId('FP_2027_soon_0')).toBeNull();
  });
  it('indexes only PICK rows and records seasons and the deepest round', () => {
    const idx = indexFcPicks({ ...fcPickRows(), '9221': fcPlayer('9221', 9000) })!;
    expect(idx.seasons).toEqual([2027, 2028, 2029]);
    expect(idx.maxRound.get(2027)).toBe(4);
    expect(idx.slots.size).toBe(16 + 8);
    expect(indexFcPicks({ '9221': fcPlayer('9221', 9000) })).toBeNull();
    expect(indexFcPicks(null)).toBeNull();
  });
});

describe('pick price: bucket mapping and the fallback', () => {
  it('uses the exact bucketed row for the next draft', () => {
    expect(pickPrice(index(), '2027', 1, 'early')).toEqual({ value: 4600, fcId: 'FP_2027_early_0', estimated: false });
    expect(pickPrice(index(), '2027', 2, 'late')).toEqual({ value: 1300, fcId: 'FP_2027_late_1', estimated: false });
    expect(pickPrice(index(), 2027, 4, 'mid')).toMatchObject({ value: 810, estimated: false });
  });
  it('mid in a season without bucketed rows is the plain row and is exact', () => {
    expect(pickPrice(index(), '2028', 1, 'mid')).toEqual({ value: 2000, fcId: 'FP_2028_1', estimated: false });
    expect(pickPrice(index(), '2029', 3, 'mid')).toMatchObject({ fcId: 'FP_2029_3', estimated: false });
  });
  it('early or late where only plain rows exist falls back to the plain row and is flagged', () => {
    expect(pickPrice(index(), '2028', 1, 'early')).toEqual({ value: 2000, fcId: 'FP_2028_1', estimated: true });
    expect(pickPrice(index(), '2029', 2, 'late')).toMatchObject({ fcId: 'FP_2029_2', estimated: true });
  });
  it('a missing bucket falls to the nearest bucket in a fixed order', () => {
    const idx = indexFcPicks({ a: { ...fcPickRows()['FP_2027_mid_0']!, sleeperId: 'FP_2027_mid_0' }, b: { ...fcPickRows()['FP_2027_late_0']!, sleeperId: 'FP_2027_late_0' } })!;
    expect(pickPrice(idx, '2027', 1, 'early')).toEqual({ value: 3000, fcId: 'FP_2027_mid_0', estimated: true });
    expect(pickPrice(idx, '2027', 1, 'late')).toMatchObject({ fcId: 'FP_2027_late_0', estimated: false });
    expect(pickPrice(idx, '2027', 1, 'mid')).toMatchObject({ fcId: 'FP_2027_mid_0', estimated: false });
  });
  it('a season FantasyCalc does not list uses the nearest one (ties go earlier) and is flagged', () => {
    expect(pickPrice(index(), '2030', 1, 'mid')).toEqual({ value: 1800, fcId: 'FP_2029_1', estimated: true });
    expect(pickPrice(index(), '2026', 1, 'mid')).toMatchObject({ fcId: 'FP_2027_mid_0', estimated: true });
  });
  it('a round deeper than FantasyCalc lists decays from the deepest round and is flagged', () => {
    const p = pickPrice(index(), '2027', 5, 'mid')!;
    expect(p.estimated).toBe(true);
    expect(p.value).toBeCloseTo(810 * EXTRA_ROUND_DECAY, 6);
    expect(pickPrice(index(), '2029', 6, 'mid')!.value).toBeCloseTo(750 * EXTRA_ROUND_DECAY ** 2, 6);
  });
  it('a round with no row in any bucket takes the next shallower round, flagged', () => {
    const idx = indexFcPicks({ x: { ...fcPickRows()['FP_2028_1']! }, y: { ...fcPickRows()['FP_2028_3']! } })!;
    expect(pickPrice(idx, '2028', 2, 'mid')).toEqual({ value: 2000, fcId: 'FP_2028_1', estimated: true });
  });
  it('is null when FantasyCalc lists no picks', () => {
    expect(pickPrice(null, '2027', 1, 'mid')).toBeNull();
  });
});

const finish = (n: number): FinishTeam[] => Array.from({ length: n }, (_, i) => ({ rid: i + 1, wins: 0, losses: 0, ties: 0, pf: 0, expWins: i + 1 }));

describe('projected finish → slot bucket', () => {
  it('cuts 12 teams into thirds, worst finish early', () => {
    const b = projectedBuckets(finish(12));
    expect(Object.values(b).filter((x) => x === 'early')).toHaveLength(4);
    expect(Object.values(b).filter((x) => x === 'mid')).toHaveLength(4);
    expect(Object.values(b).filter((x) => x === 'late')).toHaveLength(4);
    expect([b[1], b[4], b[5], b[8], b[9], b[12]]).toEqual(['early', 'early', 'mid', 'mid', 'late', 'late']);
  });
  it('handles sizes that do not divide by three', () => {
    const b10 = Object.values(projectedBuckets(finish(10)));
    expect([b10.filter((x) => x === 'early').length, b10.filter((x) => x === 'mid').length, b10.filter((x) => x === 'late').length]).toEqual([3, 4, 3]);
    const b6 = Object.values(projectedBuckets(finish(6)));
    expect([b6.filter((x) => x === 'early').length, b6.filter((x) => x === 'late').length]).toEqual([2, 2]);
  });
  it('ranks by expected wins, then points for', () => {
    const teams: FinishTeam[] = [
      { rid: 1, wins: 6, losses: 0, ties: 0, pf: 700, expWins: 5 },
      { rid: 2, wins: 0, losses: 6, ties: 0, pf: 400, expWins: 9 },
      { rid: 3, wins: 3, losses: 3, ties: 0, pf: 500, expWins: 7 },
    ];
    expect(projectedBuckets(teams)).toEqual({ 1: 'early', 2: 'late', 3: 'mid' });
    const tie = [{ ...teams[0]!, expWins: 7, pf: 100 }, { ...teams[1]!, expWins: 7, pf: 900 }, { ...teams[2]!, expWins: 7, pf: 500 }];
    expect(projectedBuckets(tie)).toEqual({ 1: 'early', 2: 'late', 3: 'mid' });
  });
  it('falls back to record while the simulation is still running', () => {
    const teams: FinishTeam[] = [
      { rid: 1, wins: 5, losses: 1, ties: 0, pf: 1, expWins: 0 },
      { rid: 2, wins: 1, losses: 5, ties: 0, pf: 1, expWins: 0 },
      { rid: 3, wins: 3, losses: 3, ties: 0, pf: 1, expWins: 0 },
    ];
    expect(projectedBuckets(teams, true)).toEqual({ 1: 'late', 2: 'early', 3: 'mid' });
  });
});

describe('which drafts are ahead', () => {
  it('is next season once the league season is under way or done, this season while its rookie draft is pending', () => {
    expect(firstPickSeason({ season: '2026', status: 'in_season' })).toBe('2027');
    expect(firstPickSeason({ season: '2026', status: 'complete' })).toBe('2027');
    expect(firstPickSeason({ season: '2026', status: 'pre_draft' })).toBe('2026');
    expect(pickSeasons({ season: '2026', status: 'in_season' })).toEqual(['2027', '2028', '2029']);
    expect(pickSeasons({ season: '2026', status: 'drafting' }, 2)).toEqual(['2026', '2027']);
  });
  it('labels rounds', () => {
    expect([1, 2, 3, 4, 11, 12, 21].map(roundLabel)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '21st']);
  });
});

describe('valuePicks: ownership, buckets and values', () => {
  const buckets = { 1: 'early', 2: 'mid', 3: 'late' } as const;
  const traded = [
    { season: '2027', round: 1, roster_id: 3, owner_id: 1 }, // roster 1 owns roster 3's 2027 1st
    { season: '2028', round: 2, roster_id: 2, owner_id: 3 },
  ];
  const out = valuePicks({ tradedPicks: traded, rosterIds: [1, 2, 3], seasons: ['2027', '2028'], rounds: 2, buckets: { ...buckets }, fc: index() });

  it('every pick has exactly one owner', () => {
    expect(Object.values(out).flat()).toHaveLength(3 * 2 * 2);
    const keys = Object.values(out).flat().map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('values a bought pick by its ORIGINAL owner\'s projected finish', () => {
    const bought = out[1]!.find((p) => p.key === pickKey('2027', 1, 3))!;
    expect(bought).toMatchObject({ acquired: true, originalRosterId: 3, ownerRosterId: 1, bucket: 'late', value: 2300, estimated: false, label: '2027 1st' });
    const own = out[1]!.find((p) => p.key === pickKey('2027', 1, 1))!;
    expect(own).toMatchObject({ acquired: false, bucket: 'early', value: 4600 });
  });
  it('later seasons are mid, exact from the plain row', () => {
    const p = out[3]!.find((x) => x.key === pickKey('2028', 2, 2))!;
    expect(p).toMatchObject({ acquired: true, bucket: 'mid', value: 1300, estimated: false, fcId: 'FP_2028_2' });
  });
  it('has no values when FantasyCalc lists no picks', () => {
    const none = valuePicks({ tradedPicks: [], rosterIds: [1, 2], seasons: ['2027'], rounds: 1, buckets: {}, fc: null });
    expect(none[1]).toEqual([expect.objectContaining({ value: null, estimated: false, fcId: null, bucket: 'mid' })]);
  });
});
