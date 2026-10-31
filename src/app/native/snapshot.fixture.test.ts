// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createEngine, emptyScenario } from '../../engine';
import { fixtureModel } from '../../engine/test-helpers';
import { lineup, standings } from './snapshot';

describe('the native screens’ snapshot, on the saved league', () => {
  it('lists every team in standings order with the engine’s odds as chances, and my team marked', async () => {
    const { model } = await fixtureModel();
    const engine = createEngine(model);
    const rows = standings(engine, model, null);
    expect(rows).toHaveLength(model.teams.length);
    expect(rows.map((r) => r.place)).toEqual(rows.map((_, i) => i + 1));
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]!, b = rows[i]!;
      expect(a.wins + a.ties / 2 > b.wins + b.ties / 2 || (a.wins + a.ties / 2 === b.wins + b.ties / 2 && a.pf >= b.pf)).toBe(true);
    }
    expect(rows.filter((r) => r.isMe)).toHaveLength(1);
    expect(rows.every((r) => r.playoff >= 0 && r.playoff <= 1 && r.title <= r.playoff + 1e-9)).toBe(true);

    const l = lineup(engine, emptyScenario());
    expect(l.week).toBe(model.meta.currentWeek);
    const starters = l.rows.filter((r) => r.starting);
    expect(starters.length).toBeGreaterThan(5);
    expect(l.total).toBeCloseTo(starters.reduce((s, r) => s + (r.exp), 0), 0);
    expect(l.best).toBeGreaterThanOrEqual(l.total - 0.05);
    expect(l.rows.find((r) => !r.starting)?.slot).toBe('BN');
    expect(starters.every((r) => r.floor <= r.exp + 1e-9 && r.exp <= r.ceiling + 1e-9)).toBe(true);
  });

});
