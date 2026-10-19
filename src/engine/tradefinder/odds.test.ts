import { describe, expect, it } from 'vitest';
import { simulate } from '../sim.ts';
import { findTradeIdeas } from './find.ts';
import { finderSimInputs } from './odds.ts';
import { finderModel } from './test-helpers.ts';

describe('finderSimInputs', () => {
  const model = finderModel();
  const { ideas } = findTradeIdeas(model, { rosterSize: 6 });
  const two = ideas.find((i) => i.kind === 'two-for-one' && i.sides[0]!.get[0]!.pid === 'q2')!;
  const rot = ideas.find((i) => i.kind === 'three-team')!;
  const inputs = finderSimInputs(model, undefined, [two, rot]);

  it('builds one shared before-season and one after-season per idea', () => {
    expect(Object.keys(inputs.afters).sort()).toEqual([two.id, rot.id].sort());
    expect(inputs.before.runs).toBe(6000);
    expect(inputs.afters[two.id]!.runs).toBe(6000);
  });

  it('applies the deal to every team in it from next week, and leaves this week and the other teams alone', () => {
    const b = inputs.before.means, a = inputs.afters[two.id]!.means;
    // you: QB 10 -> 25 from week 6; Two: wideouts 8 + 7 -> 18 + 17 and QB 25 -> 22 in week 6; Three and Four untouched
    expect(b[1]![6]).toBe(10 + 12 + 20 + 19);
    expect(a[1]![6]).toBe(25 + 12 + 20 + 19);
    expect(a[1]![5]).toBe(b[1]![5]);
    expect(b[2]![6]).toBe(25 + 15 + 8 + 7);
    expect(a[2]![6]).toBe(22 + 15 + 18 + 17);
    expect(a[3]).toEqual(b[3]);
    expect(a[4]).toEqual(b[4]);
  });

  it('a rotation moves three teams', () => {
    const b = inputs.before.means, a = inputs.afters[rot.id]!.means;
    const moved = [1, 2, 3, 4].filter((rid) => JSON.stringify(a[rid]) !== JSON.stringify(b[rid]));
    expect(moved.sort()).toEqual(rot.sides.map((s) => s.rid).sort());
  });

  it('runs: a deal that lifts your lineup by 15 points a week raises your playoff odds', () => {
    const small = finderSimInputs(model, undefined, [two], { runs: 2000 });
    const before = simulate(small.before).teams[1]!.playoff, after = simulate(small.afters[two.id]!).teams[1]!.playoff;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
