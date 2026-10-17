// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bestSet, bestTotal, fillOrder, optimizeLineup, startingSlots } from './lineup.ts';
import type { Slot } from './types.ts';

interface P { pid: string; pos: string; v: number }
const p = (pid: string, pos: string, v: number): P => ({ pid, pos, v });
const value = (x: P) => x.v;
const slotMap = (r: ReturnType<typeof optimizeLineup<P>>) => r.slots.map((s) => `${s.slot}:${s.p?.pid ?? '-'}`);

const standard: Slot[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

describe('startingSlots', () => {
  it('keeps lineup slots and drops bench, IR and taxi', () => {
    expect(startingSlots(['QB', 'RB', 'FLEX', 'SUPER_FLEX', 'BN', 'BN', 'IR', 'TAXI'])).toEqual(['QB', 'RB', 'FLEX', 'SUPER_FLEX']);
    expect(startingSlots(null)).toEqual([]);
  });
});

describe('fill order', () => {
  it('fixed slots first, then flex slots from most to least restrictive', () => {
    const slots: Slot[] = ['SUPER_FLEX', 'FLEX', 'QB', 'REC_FLEX', 'RB', 'WRRB_FLEX'];
    expect(fillOrder(slots).map((i) => slots[i])).toEqual(['QB', 'RB', 'REC_FLEX', 'WRRB_FLEX', 'FLEX', 'SUPER_FLEX']);
  });
});

describe('optimizeLineup: standard league', () => {
  const roster = [
    p('qb1', 'QB', 20), p('qb2', 'QB', 15), p('rb1', 'RB', 18), p('rb2', 'RB', 14), p('rb3', 'RB', 11), p('wr1', 'WR', 17), p('wr2', 'WR', 13),
    p('wr3', 'WR', 12), p('te1', 'TE', 9), p('te2', 'TE', 4), p('k1', 'K', 8), p('d1', 'DEF', 7),
  ];
  it('fills each slot with the best eligible player and the flex with the best leftover RB/WR/TE', () => {
    const r = optimizeLineup(roster, standard, { value });
    expect(slotMap(r)).toEqual(['QB:qb1', 'RB:rb1', 'RB:rb2', 'WR:wr1', 'WR:wr2', 'TE:te1', 'FLEX:wr3', 'K:k1', 'DEF:d1']);
    expect(r.total).toBe(20 + 18 + 14 + 17 + 13 + 9 + 12 + 8 + 7);
    expect(r.bench.map((x) => x.pid)).toEqual(['qb2', 'rb3', 'te2']);
  });
  it('leaves a slot empty when nobody is eligible', () => {
    const r = optimizeLineup([p('qb1', 'QB', 10)], standard, { value });
    expect(r.slots.filter((s) => s.p).length).toBe(1);
    expect(r.total).toBe(10);
  });
  it('bestSet / bestTotal agree with optimizeLineup when there are no locks, pins or benches', () => {
    expect(bestTotal(roster, standard, value)).toBe(optimizeLineup(roster, standard, { value }).total);
    expect(bestSet(roster, standard, value).used.has('wr3')).toBe(true);
  });
});

describe('optimizeLineup: superflex', () => {
  const slots: Slot[] = ['QB', 'RB', 'WR', 'SUPER_FLEX'];
  it('puts the second QB in the superflex when he beats every other option', () => {
    const r = optimizeLineup([p('qb1', 'QB', 22), p('qb2', 'QB', 19), p('rb1', 'RB', 12), p('wr1', 'WR', 10), p('wr2', 'WR', 9)], slots, { value });
    expect(slotMap(r)).toEqual(['QB:qb1', 'RB:rb1', 'WR:wr1', 'SUPER_FLEX:qb2']);
  });
  it('uses a skill player in the superflex when the second QB is worse', () => {
    const r = optimizeLineup([p('qb1', 'QB', 22), p('qb2', 'QB', 5), p('rb1', 'RB', 12), p('rb2', 'RB', 11), p('wr1', 'WR', 10)], slots, { value });
    expect(slotMap(r)).toEqual(['QB:qb1', 'RB:rb1', 'WR:wr1', 'SUPER_FLEX:rb2']);
  });
});

describe('optimizeLineup: REC_FLEX + WRRB_FLEX', () => {
  const slots: Slot[] = ['QB', 'RB', 'WR', 'REC_FLEX', 'WRRB_FLEX'];
  it('REC_FLEX takes only WR/TE and WRRB_FLEX only RB/WR', () => {
    const roster = [p('qb', 'QB', 20), p('rb1', 'RB', 15), p('rb2', 'RB', 14), p('wr1', 'WR', 13), p('wr2', 'WR', 12), p('te1', 'TE', 11), p('te2', 'TE', 10)];
    const r = optimizeLineup(roster, slots, { value });
    // RB: rb1, WR: wr1; REC_FLEX (WR/TE) takes best of wr2(12)/te1(11)/te2 = wr2; WRRB_FLEX (RB/WR) takes rb2(14)
    expect(slotMap(r)).toEqual(['QB:qb', 'RB:rb1', 'WR:wr1', 'REC_FLEX:wr2', 'WRRB_FLEX:rb2']);
  });
  it('a TE can only enter through REC_FLEX', () => {
    const r = optimizeLineup([p('qb', 'QB', 1), p('te1', 'TE', 30), p('te2', 'TE', 29)], slots, { value });
    expect(slotMap(r)).toEqual(['QB:qb', 'RB:-', 'WR:-', 'REC_FLEX:te1', 'WRRB_FLEX:-']);
  });
});

describe('optimizeLineup: IDP', () => {
  const slots: Slot[] = ['QB', 'RB', 'DL', 'LB', 'DB', 'IDP_FLEX'];
  it('fills DL/LB/DB and then the IDP flex with the best remaining defender', () => {
    const r = optimizeLineup(
      [p('qb', 'QB', 18), p('rb', 'RB', 12), p('dl1', 'DL', 9), p('dl2', 'DL', 8), p('lb1', 'LB', 10), p('db1', 'DB', 6), p('db2', 'DB', 5)],
      slots, { value },
    );
    expect(slotMap(r)).toEqual(['QB:qb', 'RB:rb', 'DL:dl1', 'LB:lb1', 'DB:db1', 'IDP_FLEX:dl2']);
  });
  it('an offensive player never fills an IDP slot', () => {
    const r = optimizeLineup([p('rb', 'RB', 30), p('rb2', 'RB', 29)], slots, { value });
    expect(slotMap(r).filter((s) => s.endsWith(':-')).length).toBe(5);
  });
});

describe('optimizeLineup: greedy order matters', () => {
  it('a flex-eligible player does not steal the only candidate of a fixed slot', () => {
    // FLEX is listed before RB. The only RB must still go to the RB slot; FLEX takes the WR.
    const slots: Slot[] = ['FLEX', 'RB'];
    const r = optimizeLineup([p('rb', 'RB', 10), p('wr', 'WR', 5)], slots, { value });
    expect(slotMap(r)).toEqual(['FLEX:wr', 'RB:rb']);
    expect(r.total).toBe(15);
  });
  it('a RB-only slot is filled before WRRB_FLEX even when the flex is listed first', () => {
    const slots: Slot[] = ['WRRB_FLEX', 'RB', 'WR'];
    const r = optimizeLineup([p('rb1', 'RB', 10), p('wr1', 'WR', 9), p('wr2', 'WR', 8)], slots, { value });
    expect(slotMap(r)).toEqual(['WRRB_FLEX:wr2', 'RB:rb1', 'WR:wr1']);
    expect(r.total).toBe(27);
  });
  it('REC_FLEX fills before FLEX, so the TE is not wasted', () => {
    const slots: Slot[] = ['FLEX', 'REC_FLEX', 'RB'];
    const r = optimizeLineup([p('rb1', 'RB', 10), p('rb2', 'RB', 9), p('te', 'TE', 8)], slots, { value });
    expect(slotMap(r)).toEqual(['FLEX:rb2', 'REC_FLEX:te', 'RB:rb1']);
  });
});

describe('optimizeLineup: locked starters, pins and benches', () => {
  const slots: Slot[] = ['QB', 'RB', 'RB', 'FLEX'];
  const roster = [p('qb', 'QB', 20), p('rb1', 'RB', 15), p('rb2', 'RB', 10), p('rb3', 'RB', 9), p('wr', 'WR', 12)];

  it('a locked player keeps his slot even when a better player is on the bench', () => {
    const r = optimizeLineup(roster, slots, { value, locked: [null, roster[3], null, null] });
    expect(slotMap(r)).toEqual(['QB:qb', 'RB:rb3', 'RB:rb1', 'FLEX:wr']);
    expect(r.slots[1]!.locked).toBe(true);
    expect(r.slots[2]!.locked).toBe(false);
  });
  it('unavailable players (already played, not locked) are never chosen but still appear on the bench', () => {
    const r = optimizeLineup(roster, slots, { value, unavailable: (x) => x.pid === 'rb1' });
    expect(slotMap(r)).toContain('RB:rb2');
    expect(slotMap(r).join()).not.toContain('rb1');
    expect(r.bench.map((x) => x.pid)).toContain('rb1');
  });
  it('a pinned player starts even if he is not the best option', () => {
    const r = optimizeLineup(roster, slots, { value, pins: new Set(['rb3']) });
    expect(slotMap(r).join()).toContain('rb3');
    expect(r.total).toBe(20 + 15 + 9 + 12); // rb3 takes an RB slot, rb2 loses out
  });
  it('a pin only counts while the player has positive value', () => {
    const r = optimizeLineup([...roster, p('inj', 'RB', 0)], slots, { value, pins: new Set(['inj']) });
    expect(slotMap(r).join()).not.toContain('inj');
  });
  it('a benched player never starts', () => {
    const r = optimizeLineup(roster, slots, { value, benches: new Set(['qb', 'rb1']) });
    expect(slotMap(r).join()).not.toContain('rb1');
    expect(r.slots[0]!.p).toBeNull(); // no other QB
    expect(r.total).toBe(10 + 9 + 12);
  });
});
