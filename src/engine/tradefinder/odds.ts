/* The simulations behind "your playoff odds" for finder ideas: one shared "before" input and one "after" input per idea, as pure
   data to run in the worker (top few ideas only: each is 6,000 simulated seasons).

   After the deal your roster has the incoming players (minus any drop) and every other team in the idea has its own swap applied to its
   weekly expected lineup points, exactly the way tradeSimInputs does it for the partner, extended to all the teams a rotation touches. */
import { createScope, emptyScenario, type Scenario } from '../scenario.ts';
import { simInputFor } from '../simInput.ts';
import { TRADE_SIM_RUNS } from '../trades.ts';
import type { SimInput } from '../sim.ts';
import type { ByWeek, Model } from '../types.ts';
import type { FinderIdea } from './types.ts';

export interface FinderSimInputs {
  before: SimInput;
  /** idea id → the season after the deal */
  afters: Record<string, SimInput>;
}

export function finderSimInputs(model: Model, scenario: Scenario | undefined, ideas: readonly FinderIdea[], o: { meRid?: number; runs?: number } = {}): FinderSimInputs {
  const meRid = o.meRid ?? model.meRid;
  const scen = scenario ?? emptyScenario();
  const sc = createScope(model, scen, meRid);
  const w0 = model.meta.currentWeek + 1;
  const opts = { runs: o.runs ?? TRADE_SIM_RUNS, volatility: scen.volatility, meRid };
  const baseMeans = sc.teamMeans();
  const before = simInputFor(model, baseMeans, opts);
  const afters: Record<string, SimInput> = {};
  for (const idea of ideas) {
    const mine = idea.sides.find((s) => s.rid === meRid);
    if (!mine) continue;
    const out = new Set(mine.send.map((p) => p.pid)), into = mine.get.map((p) => p.pid);
    if (mine.drop) out.add(mine.drop.pid);
    const myAfter = sc.myRoster().filter((id) => !out.has(id)).concat(into);
    const ov: Record<number, ByWeek<number>> = {};
    for (const s of idea.sides) {
      if (s.rid === meRid) continue;
      const leaving = new Set(s.send.map((p) => p.pid));
      if (s.drop) leaving.add(s.drop.pid);
      const arriving = s.get.map((p) => p.pid);
      ov[s.rid] = {};
      for (let w = w0; w <= model.meta.maxWeek; w++) {
        ov[s.rid]![w] = sc.total(sc.otherRoster(s.rid, w).filter((id) => !leaving.has(id)).concat(arriving), w, false);
      }
    }
    // the deal takes effect from next week (like evaluateTrade): this week's lineup, part of it already played, stays as it is
    const means = sc.teamMeans(myAfter, ov);
    means[meRid]![model.meta.currentWeek] = baseMeans[meRid]![model.meta.currentWeek]!;
    afters[idea.id] = simInputFor(model, means, opts);
  }
  return { before, afters };
}
