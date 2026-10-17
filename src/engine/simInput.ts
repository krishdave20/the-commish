/* Build a SimInput from a model and a means table (see scenario.ts teamMeans). */
import { DEFAULT_SEED, SIM_RUNS, type SimInput, type SimSummary } from './sim.ts';
import type { Means } from './scenario.ts';
import type { Model } from './types.ts';

export interface SimInputOpts {
  runs?: number;
  /** multiplier on the weekly SD (Scenario.volatility) */
  volatility?: number;
  seed?: number;
  /** playoff-machine picks: game id -> winning rid */
  picks?: Record<string, number>;
  /** team whose win histogram is tracked (default: the model's signed-in team) */
  meRid?: number;
}

export function simInputFor(model: Model, means: Means, o: SimInputOpts = {}): SimInput {
  return {
    teams: model.teams.map((t) => ({ rid: t.rid, wins: t.wins, pf: t.pf, divId: t.divId })),
    games: model.games.map((g) => ({ id: g.id, week: g.week, teamA: g.teamA, teamB: g.teamB })),
    means,
    sd: model.meta.teamWeeklySd,
    volatility: o.volatility ?? 1,
    currentWeek: model.meta.currentWeek,
    playoffTeams: model.meta.playoffTeams,
    divisions: model.meta.divisions,
    runs: o.runs ?? SIM_RUNS,
    seed: o.seed ?? DEFAULT_SEED,
    picks: o.picks ?? {},
    meRid: o.meRid ?? model.meRid,
  };
}

/** The input of the model's initial simulation: each team's own expected lineup points, default seed and 20,000 runs. */
export function baseSimInput(model: Model): SimInput {
  const means: Means = {};
  for (const t of model.teams) means[t.rid] = { ...t.exp };
  return simInputFor(model, means);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Fill the teams' odds fields from a SimSummary of `baseSimInput(model)` (computed anywhere, e.g. in a worker).
    Returns a new Model with `oddsPending: false`; the input model is not changed. */
export function applyBaseSim(model: Model, summary: SimSummary): Model {
  const nDiv = model.meta.divisions;
  return {
    ...model,
    oddsPending: false,
    teams: model.teams.map((t) => {
      const o = summary.teams[t.rid];
      if (!o) return t;
      return { ...t, playoffPct: o.playoff, divWinPct: nDiv ? o.div : 0, expWins: r2(o.expW), winsP10: o.winsP10, winsP90: o.winsP90, seedPct: o.seeds };
    }),
  };
}
