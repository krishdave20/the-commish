import type { Model, SimSummary } from '../engine';

export interface TeamResult {
  playoff: number;
  div: number;
  expW: number;
  seeds: number[];
  winsP10: number;
  winsP90: number;
}

/** A team's simulated results: from `sim` when it has them, else the model's own first run. */
export function teamResult(model: Model, sim: SimSummary | null | undefined, rid: number): TeamResult {
  const s = sim?.teams[rid];
  if (s) return { playoff: s.playoff, div: s.div, expW: s.expW, seeds: s.seeds, winsP10: s.winsP10, winsP90: s.winsP90 };
  const t = model.teams.find((x) => x.rid === rid);
  return {
    playoff: t?.playoffPct ?? 0, div: t?.divWinPct ?? 0, expW: t?.expWins ?? 0,
    seeds: t?.seedPct ?? [], winsP10: t?.winsP10 ?? 0, winsP90: t?.winsP90 ?? 0,
  };
}
