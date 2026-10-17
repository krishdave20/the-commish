// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyScenario } from './scenario.ts';
import { evaluateTrade, tradeIdeas, tradeOdds, tradeSimInputs } from './trades.ts';
import { handModel } from './test-helpers.ts';

// cur = 5, last = 8 → trade weeks 6,7,8; playoff weeks 9,10. Slots: RB WR.
const model = handModel({
  slots: ['RB', 'WR'],
  teams: [{ rid: 1, wins: 2 }, { rid: 2, wins: 2 }, { rid: 3, wins: 2 }, { rid: 4, wins: 2 }],
  games: [[5, 1, 2], [5, 3, 4], [6, 1, 3], [6, 2, 4], [7, 1, 4], [7, 2, 3], [8, 1, 2], [8, 3, 4]],
  playoffTeams: 2,
  players: [
    { pid: 'a', pos: 'RB', mu: 10, owner: 1, name: 'My RB' },
    { pid: 'b', pos: 'WR', mu: 5, owner: 1, name: 'My WR' },
    { pid: 'c', pos: 'RB', mu: 3, owner: 2, name: 'Their RB' },
    { pid: 'd', pos: 'WR', mu: 12, owner: 2, name: 'Their WR' },
    { pid: 'x', pos: 'WR', mu: 4, owner: 2, name: 'Their WR2' },
    { pid: 'e', pos: 'RB', mu: 9, owner: 3 }, { pid: 'f', pos: 'WR', mu: 9, owner: 3 },
    { pid: 'g', pos: 'RB', mu: 8, owner: 4 }, { pid: 'h', pos: 'WR', mu: 8, owner: 4 },
  ],
});
const S = emptyScenario();

describe('evaluateTrade', () => {
  it('1-for-1: re-scores both best lineups over weeks cur+1..last', () => {
    // I swap my 5-pt WR for their 12-pt WR: +7 a week for me, −7 for them, three weeks
    const r = evaluateTrade(model, S, { partnerRid: 2, send: ['b'], get: ['d'] });
    expect(r.weeks).toEqual([6, 8]);
    expect(r.myReg).toBeCloseTo(21, 9);
    expect(r.theirReg).toBeCloseTo(-21, 9);
    expect(r.myPo).toBeCloseTo(14, 9); // two playoff weeks
    expect(r.rosterDelta).toEqual({ mine: 0, theirs: 0 });
    expect(r.message).toBe('Good for you, but their lineup drops 21.0. Expect a counter.');
  });
  it('2-for-1 (I get two): roster counts change and the message tells me to plan a drop', () => {
    const r = evaluateTrade(model, S, { partnerRid: 2, send: ['b'], get: ['d', 'x'] });
    expect(r.rosterDelta).toEqual({ mine: 1, theirs: -1 });
    expect(r.message).toContain('You take on 1 extra player, so plan a drop.');
    expect(r.myReg).toBeCloseTo(21, 9); // the extra WR never starts
  });
  it('2-for-1 (I send two): frees a roster spot', () => {
    const r = evaluateTrade(model, S, { partnerRid: 2, send: ['b', 'a'], get: ['d'] });
    expect(r.rosterDelta).toEqual({ mine: -1, theirs: 1 });
    expect(r.message).toContain('Frees 1 roster spot for a waiver add.');
    expect(r.myReg).toBeLessThan(0);
  });
  it('3-for-1 pluralises', () => {
    const r = evaluateTrade(model, S, { partnerRid: 2, send: [], get: ['d', 'x', 'c'] });
    expect(r.message).toContain('You take on 3 extra players, so plan a drop.');
  });
  it('message rules: both better, helps them more, neutral', () => {
    // I upgrade a 5-pt WR for a 6-pt WR they hold... they get my 10-pt RB for their 3-pt RB: both lineups improve
    const both = evaluateTrade(model, S, { partnerRid: 2, send: ['a'], get: ['c'] });
    expect(both.myReg).toBeLessThan(0);
    expect(both.theirReg).toBeGreaterThan(0);
    expect(both.message.startsWith('Helps them more than you.')).toBe(true);
    const flat = evaluateTrade(model, S, { partnerRid: 2, send: [], get: [] });
    expect(flat.message).toBe('Close to neutral for your lineup.');
    // a deal where both lineups get better: my 5-pt WR for their 4-pt WR? no. Give them a RB upgrade in exchange for a WR upgrade
    const m = handModel({
      slots: ['RB', 'WR'], teams: [{ rid: 1 }, { rid: 2 }],
      players: [
        { pid: 'a1', pos: 'WR', mu: 5, owner: 1 }, { pid: 'a2', pos: 'RB', mu: 12, owner: 1 }, { pid: 'a3', pos: 'RB', mu: 11, owner: 1 },
        { pid: 'b1', pos: 'RB', mu: 4, owner: 2 }, { pid: 'b2', pos: 'WR', mu: 11, owner: 2 }, { pid: 'b3', pos: 'WR', mu: 10, owner: 2 },
      ],
    });
    const win = evaluateTrade(m, S, { partnerRid: 2, send: ['a3'], get: ['b3'] });
    expect(win.myReg).toBeGreaterThan(1);
    expect(win.theirReg).toBeGreaterThan(0);
    expect(win.message).toBe('Both lineups get better. Easy pitch.');
  });
});

describe('tradeOdds / tradeSimInputs', () => {
  it('re-simulates before and after with 6,000 runs and a shared seed', () => {
    const t = { partnerRid: 2, send: ['b'], get: ['d'] };
    const { before, after } = tradeSimInputs(model, S, t);
    expect(before.runs).toBe(6000);
    expect(after.runs).toBe(6000);
    expect(before.seed).toBe(after.seed);
    expect(after.means[1]![6]).toBeGreaterThan(before.means[1]![6]!);
    expect(after.means[2]![6]).toBeLessThan(before.means[2]![6]!);
    expect(after.means[2]![5]).toBe(before.means[2]![5]); // current week is never touched for the partner
    const o = tradeOdds(model, S, t);
    expect(o.after).toBeGreaterThan(o.before);
    expect(o.delta).toBeCloseTo(o.after - o.before, 12);
    expect(tradeOdds(model, S, t)).toEqual(o); // deterministic
  });
});

describe('tradeIdeas (win-win 1-for-1)', () => {
  const m = handModel({
    slots: ['RB', 'WR'], cur: 5, last: 10,
    teams: [{ rid: 1 }, { rid: 2 }, { rid: 3 }],
    players: [
      { pid: 'a1', pos: 'RB', mu: 14, owner: 1 }, { pid: 'a2', pos: 'RB', mu: 13, owner: 1 }, { pid: 'a3', pos: 'WR', mu: 3, owner: 1, name: 'Weak WR' },
      { pid: 'b1', pos: 'WR', mu: 12, owner: 2, name: 'Good WR' }, { pid: 'b2', pos: 'WR', mu: 11, owner: 2 }, { pid: 'b3', pos: 'RB', mu: 2, owner: 2 },
      { pid: 'c1', pos: 'WR', mu: 9, owner: 3, name: 'OK WR' }, { pid: 'c2', pos: 'RB', mu: 1, owner: 3 }, { pid: 'c3', pos: 'WR', mu: 1, owner: 3 },
      { pid: 'ck', pos: 'K', mu: 50, owner: 2 },
    ],
  });
  it('finds trades where both lineups gain, ranked by the smaller gain, one per incoming player, no K/DEF', () => {
    const ideas = tradeIdeas(m, 1);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.length).toBeLessThanOrEqual(8);
    expect(new Set(ideas.map((x) => x.getPid)).size).toBe(ideas.length);
    expect(ideas.every((x) => x.myGain > 2 && x.theirGain > 0)).toBe(true);
    expect(ideas.some((x) => x.getPid === 'ck')).toBe(false);
    const mins = ideas.map((x) => Math.min(x.myGain, x.theirGain));
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(ideas.map((x) => x.idea)).toEqual(ideas.map((_, i) => i + 1));
    const top = ideas[0]!;
    expect(top.givePid).toBe('a2'); // my surplus RB goes out
    expect(top.partnerRid).toBeDefined();
    expect(top.startsForMe).toBeGreaterThanOrEqual(4);
  });
  it('is empty when no regular-season week is left', () => {
    expect(tradeIdeas(handModel({ cur: 8, last: 8, slots: ['RB'], teams: [{ rid: 1 }, { rid: 2 }], players: [{ pid: 'p', pos: 'RB', mu: 5, owner: 1 }] }), 1)).toEqual([]);
  });
  it('can be computed for any team', () => {
    expect(tradeIdeas(m, 2).every((x) => x.partnerRid !== 2)).toBe(true);
  });
});
