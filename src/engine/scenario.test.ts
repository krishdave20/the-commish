// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createScope, describeScenario, emptyScenario, irEstimate, isScenarioActive, myRoster, otherRoster, range, teamMeans, toggleIn, val, withOverride,
} from './scenario.ts';
import { handModel } from './test-helpers.ts';

// cur = 5, last = 8, playoff weeks 9-10. slots QB RB RB WR.
const model = handModel({
  slots: ['QB', 'RB', 'RB', 'WR'],
  teams: [{ rid: 1, starters: ['q', 'r1', 'r2', 'w1'] }, { rid: 2 }],
  players: [
    { pid: 'q', pos: 'QB', mu: 20, owner: 1 },
    { pid: 'r1', pos: 'RB', mu: 15, owner: 1 },
    { pid: 'r2', pos: 'RB', mu: 10, owner: 1, bye: [7] },
    { pid: 'w1', pos: 'WR', mu: 8, owner: 1, name: 'WR One' },
    { pid: 'ir', pos: 'WR', mu: (w) => (w >= 9 ? 12 : 0), owner: 1, onIr: true, seasonAvg: 11 },
    { pid: 'oq', pos: 'QB', mu: 18, owner: 2 },
    { pid: 'oir', pos: 'WR', mu: 14, owner: 2, onIr: true },
    { pid: 'fa', pos: 'WR', mu: 9, owner: 0 },
  ],
});
const P = (pid: string) => model.players.find((p) => p.pid === pid)!;

describe('Scenario state', () => {
  it('is a plain serializable object', () => {
    const s = withOverride(toggleIn(emptyScenario(), 'adds', 'fa'), 'ir', { returnWeek: 7 });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(isScenarioActive(emptyScenario())).toBe(false);
    expect(isScenarioActive(s)).toBe(true);
    expect(isScenarioActive({ ...emptyScenario(), volatility: 1.2 })).toBe(true);
  });
  it('toggleIn adds then removes; withOverride(null) clears', () => {
    let s = toggleIn(emptyScenario(), 'pins', 'q');
    expect(s.pins).toEqual(['q']);
    s = toggleIn(s, 'pins', 'q');
    expect(s.pins).toEqual([]);
    s = withOverride(s, 'ir', { ppg: 10 });
    expect(Object.keys(s.overrides)).toEqual(['ir']);
    expect(Object.keys(withOverride(s, 'ir', null).overrides)).toEqual([]);
    expect(isScenarioActive(withOverride(emptyScenario(), 'ir', {}))).toBe(false);
  });
  it('describes what changed in words', () => {
    const s = { ...emptyScenario(), overrides: { w1: { returnWeek: 7, ppg: 11.25 } }, adds: ['fa'], drops: ['r2'], pins: ['q'], benches: ['r1'], volatility: 1.25 };
    expect(describeScenario(model, s)).toEqual([
      'WR One back week 7, 11.3 pts/game', 'add fa', 'drop r2', 'always start q', 'never start r1', 'weekly swing 1.25×',
    ]);
  });
});

describe('val / range / irEstimate', () => {
  it('returns the model value with no override, and ignores overrides for other teams', () => {
    const s = withOverride(emptyScenario(), 'r1', { ppg: 3 });
    expect(val(model, s, P('r1'), 6, true)).toBe(3);
    expect(val(model, s, P('r1'), 6, false)).toBe(15);
    expect(val(model, emptyScenario(), P('r1'), 6, true)).toBe(15);
  });
  it('ppg applies only in weeks with a game', () => {
    const s = withOverride(emptyScenario(), 'r2', { ppg: 7 });
    expect(val(model, s, P('r2'), 6, true)).toBe(7);
    expect(val(model, s, P('r2'), 7, true)).toBe(0); // bye
  });
  it('returnWeek zeroes earlier weeks and falls back to the IR estimate when the model has him at 0', () => {
    const s = withOverride(emptyScenario(), 'ir', { returnWeek: 7 });
    expect(val(model, s, P('ir'), 6, true)).toBe(0);
    expect(val(model, s, P('ir'), 7, true)).toBe(12); // mean of his positive future weeks
    expect(val(model, s, P('ir'), 9, true)).toBe(12); // model value already positive
  });
  it('irEstimate is the mean of positive future weeks, else the season average', () => {
    expect(irEstimate(model, P('ir'))).toBe(12);
    expect(irEstimate(model, P('w1'))).toBe(8);
    const none = handModel({ slots: ['QB'], teams: [{ rid: 1 }], players: [{ pid: 'x', pos: 'QB', mu: 0, owner: 1, seasonAvg: 6.5 }] });
    expect(irEstimate(none, none.players[0]!)).toBe(6.5);
  });
  it('a player whose game already kicked off keeps his actual points in the current week', () => {
    const m = handModel({ slots: ['QB'], teams: [{ rid: 1 }], players: [{ pid: 'x', pos: 'QB', mu: 22, owner: 1, played: true }] });
    const s = withOverride(emptyScenario(), 'x', { ppg: 5 });
    expect(val(m, s, m.players[0]!, 5, true)).toBe(22);
    expect(val(m, s, m.players[0]!, 6, true)).toBe(5);
  });
  it('range scales the floor and ceiling with the overridden value, and is flat for a played game', () => {
    const s = withOverride(emptyScenario(), 'r1', { ppg: 10 });
    expect(range(model, s, P('r1'), 6, true)).toEqual([5, 15]);
    expect(range(model, emptyScenario(), P('r1'), 6, true)).toEqual([7.5, 22.5]);
    const m = handModel({ slots: ['QB'], teams: [{ rid: 1 }], players: [{ pid: 'x', pos: 'QB', mu: 22, owner: 1, played: true }] });
    expect(range(m, emptyScenario(), m.players[0]!, 5, true)).toEqual([22, 22]);
    expect(range(model, emptyScenario(), P('ir'), 6, true)).toEqual([0, 0]); // base 0 → position ratio × 0
  });
});

describe('rosters', () => {
  it('myRoster applies drops then adds', () => {
    const s = { ...emptyScenario(), drops: ['r2'], adds: ['fa'] };
    expect(myRoster(model, s)).toEqual(['q', 'r1', 'w1', 'ir', 'fa']);
  });
  it('otherRoster hides IR players until four weeks out', () => {
    expect(otherRoster(model, 2, 8)).toEqual(['oq']);
    expect(otherRoster(model, 2, 9)).toEqual(['oq', 'oir']);
  });
});

describe('lineup and teamMeans', () => {
  it('teamMeans re-scores only my team for the scenario', () => {
    const base = teamMeans(model, emptyScenario());
    expect(base[1]![6]).toBe(20 + 15 + 10 + 8);
    expect(base[2]![6]).toBe(18);
    const withFa = teamMeans(model, { ...emptyScenario(), adds: ['fa'] });
    expect(withFa[1]![6]).toBe(20 + 15 + 10 + 9);
    expect(withFa[2]).toEqual(base[2]);
    const ov = teamMeans(model, emptyScenario(), 1, undefined, { 2: { 6: 99 } });
    expect(ov[2]![6]).toBe(99);
    expect(ov[2]![7]).toBe(base[2]![7]);
  });
  it('the scenario pins and benches feed the lineup', () => {
    const sc = createScope(model, { ...emptyScenario(), benches: ['q'], pins: ['w1'] });
    const L = sc.lineup(sc.myRoster(), 6, true);
    expect(L.slots[0]!.p).toBeNull();
    expect(L.total).toBe(15 + 10 + 8);
  });
  it('current-week starters whose game kicked off stay in their slot', () => {
    const m = handModel({
      slots: ['QB', 'RB', 'RB'],
      teams: [{ rid: 1, starters: ['q', 'low', '0'] }],
      players: [
        { pid: 'q', pos: 'QB', mu: 20, owner: 1 },
        { pid: 'low', pos: 'RB', mu: 2, owner: 1, played: true }, // already played, scored 2, is in slot 2
        { pid: 'r1', pos: 'RB', mu: 15, owner: 1 },
        { pid: 'r2', pos: 'RB', mu: 12, owner: 1 },
        { pid: 'played-bench', pos: 'RB', mu: 30, owner: 1, played: true }, // played but was on the bench: out for the week
      ],
    });
    const sc = createScope(m);
    const L = sc.lineup(sc.myRoster(), 5, true);
    expect(L.slots.map((s) => s.p?.pid)).toEqual(['q', 'low', 'r1']);
    expect(L.slots[1]!.locked).toBe(true);
    expect(L.total).toBe(20 + 2 + 15);
    // a later week has no locks
    expect(sc.lineup(sc.myRoster(), 6, true).slots.map((s) => s.p?.pid)).toEqual(['q', 'played-bench', 'r1']);
  });
});
