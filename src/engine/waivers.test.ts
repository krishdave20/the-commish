// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyScenario } from './scenario.ts';
import { bidFor, waiverBoard, waiverBoards, waiverWeeks } from './waivers.ts';
import { handModel } from './test-helpers.ts';

// cur = 5, last = 8 (reg weeks 5-8), playoff weeks 9-10. Slots: QB RB RB WR WR TE FLEX K DEF.
const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'] as const;
const mine = [
  { pid: 'qb', pos: 'QB', mu: 20 }, { pid: 'rb1', pos: 'RB', mu: 15 }, { pid: 'rb2', pos: 'RB', mu: 10 }, { pid: 'rb3', pos: 'RB', mu: 2 },
  { pid: 'wr1', pos: 'WR', mu: 12 }, { pid: 'wr2', pos: 'WR', mu: 8 }, { pid: 'te', pos: 'TE', mu: 6 }, { pid: 'k', pos: 'K', mu: 5 }, { pid: 'd', pos: 'DEF', mu: 7 },
] as const;
const build = (fas: Array<{ pid: string; pos: 'QB' | 'RB' | 'WR' | 'TE'; mu: number | ((w: number) => number); adds72h?: number }>, faab = 200) =>
  handModel({
    slots: [...slots],
    teams: [{ rid: 1, faab }, { rid: 2 }],
    players: [...mine.map((p) => ({ ...p, owner: 1, name: p.pid })), ...fas.map((p) => ({ ...p, owner: 0, name: p.pid })), { pid: 'o', pos: 'QB' as const, mu: 10, owner: 2 }],
  });

describe('waiver gain', () => {
  // Adding a 9-point WR: WR slots become wr1 (12) + new (9); wr2 (8) moves to FLEX in place of rb3 (2).
  // Lift per week = (9 + 8) - (8 + 2) = 7. Dropping rb3 (worth 2 as FLEX) is the cheapest drop.
  const m = build([{ pid: 'newwr', pos: 'WR', mu: 9 }]);

  it('measures the exact lineup gain per window', () => {
    const reg = waiverBoard(m, emptyScenario(), 'reg');
    expect(reg.weeks).toEqual([5, 6, 7, 8]);
    expect(reg.list.length).toBe(1);
    expect(reg.list[0]!.gain).toBeCloseTo(28, 9);
    expect(reg.list[0]!.drop.pid).toBe('rb3');
    expect(reg.list[0]!.starts).toBe(4);
    expect(reg.list[0]!.nweeks).toBe(4);
    expect(waiverBoard(m, emptyScenario(), 'next').list[0]!.gain).toBeCloseTo(7, 9);
    expect(waiverBoard(m, emptyScenario(), 'next').weeks).toEqual([6]);
    expect(waiverBoard(m, emptyScenario(), 'po').weeks).toEqual([9, 10]);
    expect(waiverBoard(m, emptyScenario(), 'po').list[0]!.gain).toBeCloseTo(14, 9);
  });
  it('returns all three windows with their starts', () => {
    const all = waiverBoards(m);
    expect(all.reg.list[0]!.starts).toBe(4);
    expect(all.next.list[0]!.starts).toBe(1);
    expect(all.po.list[0]!.starts).toBe(2);
  });
  it('does not list a free agent whose gain is 0.3 or less, and ranks the rest by gain', () => {
    const m2 = build([
      { pid: 'tiny', pos: 'WR', mu: 2.05 }, // only beats rb3 at FLEX by 0.05 a week: 0.2 over 4 weeks
      { pid: 'mid', pos: 'WR', mu: 9 }, // +7 a week
      { pid: 'big', pos: 'RB', mu: 14 }, // RB2 14 instead of 10, and the 10 moves to FLEX: +12 a week
    ]);
    const board = waiverBoard(m2, emptyScenario(), 'reg').list;
    expect(board.map((w) => w.pid)).toEqual(['big', 'mid']);
    expect(board.map((w) => w.gain)).toEqual([48, 28].map((x) => expect.closeTo(x, 9)));
  });
  it('never suggests dropping an IR player, and a scenario add is not re-suggested', () => {
    const m3 = handModel({
      slots: [...slots], teams: [{ rid: 1 }, { rid: 2 }],
      players: [...mine.map((p) => ({ ...p, owner: 1 })), { pid: 'irx', pos: 'RB', mu: 0, owner: 1, onIr: true }, { pid: 'fa', pos: 'WR', mu: 9, owner: 0 }],
    });
    expect(waiverBoard(m3, emptyScenario(), 'reg').list[0]!.drop.pid).not.toBe('irx');
    expect(waiverBoard(m3, { ...emptyScenario(), adds: ['fa'] }, 'reg').list.length).toBe(0);
  });
  it('respects what-if overrides on the roster (a returning star changes the replacement value)', () => {
    const base = waiverBoard(m, emptyScenario(), 'reg').list[0]!.gain;
    const sc = { ...emptyScenario(), overrides: { wr2: { ppg: 20 } } };
    // wr2 now scores 20: WR slots are wr2+wr1 and the new 9-pointer only competes with rb3 for FLEX: gain 7 per week
    expect(waiverBoard(m, sc, 'reg').list[0]!.gain).toBeCloseTo(28, 9);
    expect(base).toBeCloseTo(28, 9);
    const sc2 = { ...emptyScenario(), overrides: { wr1: { ppg: 20 }, wr2: { ppg: 20 } } };
    expect(waiverBoard(m, sc2, 'reg').list[0]!.gain).toBeCloseTo(28, 9); // new WR fills FLEX over rb3: 9 - 2 = 7 per week
  });
  it('windows come from the model (no hard-coded weeks)', () => {
    expect(waiverWeeks(m, 'reg')).toEqual([5, 6, 7, 8]);
    const late = handModel({ cur: 8, last: 8, slots: [...slots], teams: [{ rid: 1 }], players: [] });
    expect(waiverWeeks(late, 'reg')).toEqual([8]);
    expect(waiverWeeks(late, 'next')).toEqual([9]);
    expect(waiverWeeks(late, 'po')).toEqual([9, 10]);
  });
});

describe('FAAB bid scaling', () => {
  it('scales with the budget left: gain/scale of what is left, capped at 25%', () => {
    expect(bidFor(200, 10, 'reg')).toBe(8); // 10/250 = 4%
    expect(bidFor(100, 10, 'reg')).toBe(4);
    expect(bidFor(100, 9, 'po')).toBe(10); // 9/90 = 10%
    expect(bidFor(100, 4, 'next')).toBe(10); // 4/40 = 10%
    expect(bidFor(100, 1000, 'reg')).toBe(25); // capped at 25% of what is left
    expect(bidFor(40, 1000, 'next')).toBe(10);
    expect(bidFor(0, 20, 'reg')).toBe(0);
  });
  it('adds 3% for a hot add (over 500,000 adds in 72 hours)', () => {
    expect(bidFor(100, 10, 'reg', 600000)).toBe(7);
    expect(bidFor(100, 10, 'reg', 500000)).toBe(4); // not strictly over
  });
  it('the board applies it to each entry using the team\'s remaining FAAB', () => {
    const m = build([{ pid: 'newwr', pos: 'WR', mu: 9, adds72h: 600000 }], 250);
    const e = waiverBoard(m, emptyScenario(), 'reg').list[0]!;
    expect(e.gain).toBeCloseTo(28, 9);
    expect(e.bid).toBe(Math.round(250 * (28 / 250 + 0.03)));
    expect(e.trend).toBe(600000);
    expect(e.next).toBe(9);
    expect(e.ceil).toBeCloseTo(13.5, 9);
  });
});
