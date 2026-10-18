import { useMemo } from 'react';
import { useScenario } from '../../app/modelContext';
import type { Engine } from '../../engine';

/** This week's opponent: both teams' projected totals, my win chance and, once games are on, the live score. */
export function useMatchup(engine: Engine) {
  const { scenario } = useScenario();
  const { model, meRid } = engine;
  const cur = model.meta.currentWeek;
  return useMemo(() => {
    const row = model.history.find((h) => h.week === cur && h.rid === meRid);
    const game = model.games.find((g) => g.week === cur && (g.teamA === meRid || g.teamB === meRid));
    const oppRid = row?.opp ?? (game ? (game.teamA === meRid ? game.teamB : game.teamA) : null);
    const opp = oppRid === null ? null : model.teams.find((t) => t.rid === oppRid) ?? null;
    if (!opp) return null;
    const means = engine.teamMeans(scenario);
    const mine = means[meRid]?.[cur] ?? 0, theirs = means[opp.rid]?.[cur] ?? 0;
    const live = row && !row.final && (row.pts > 0 || row.oppPts > 0) ? { mine: row.pts, theirs: row.oppPts } : null;
    return { opp, mine, theirs, p: engine.winProb(mine, theirs, scenario.volatility), live, week: cur };
  }, [engine, model, scenario, cur, meRid]);
}
