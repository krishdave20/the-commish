import type { Model, SimSummary } from '../engine';

export interface TeamResult {
  playoff: number;
  div: number;
  expW: number;
  seeds: number[];
  winsP10: number;
  winsP90: number;
  /** playoff results from the same simulation: 0 when the run was made without them */
  title: number;
  finals: number;
  /** chance of being crowned the worst team (toilet bowl) or of winning the consolation bracket */
  flush: number;
  consolation: number;
  inField: number;
}

/** A team's simulated results: from `sim` when it has them, else the model's own first run. */
export function teamResult(model: Model, sim: SimSummary | null | undefined, rid: number): TeamResult {
  const s = sim?.teams[rid];
  if (s) {
    return {
      playoff: s.playoff, div: s.div, expW: s.expW, seeds: s.seeds, winsP10: s.winsP10, winsP90: s.winsP90,
      title: s.titlePct ?? 0, finals: s.finalsPct ?? 0, flush: s.flushPct ?? 0, consolation: s.consolationPct ?? 0, inField: s.inToiletBowlPct ?? 0,
    };
  }
  const t = model.teams.find((x) => x.rid === rid);
  return {
    playoff: t?.playoffPct ?? 0, div: t?.divWinPct ?? 0, expW: t?.expWins ?? 0,
    seeds: t?.seedPct ?? [], winsP10: t?.winsP10 ?? 0, winsP90: t?.winsP90 ?? 0,
    title: t?.titlePct ?? 0, finals: t?.finalsPct ?? 0, flush: t?.flushPct ?? 0, consolation: t?.consolationPct ?? 0, inField: t?.inToiletBowlPct ?? 0,
  };
}
