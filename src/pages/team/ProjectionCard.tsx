import { useMemo } from 'react';
import { useScenario } from '../../app/modelContext';
import { WeeklyProjectionChart } from '../../components/charts/WeeklyProjectionChart';
import type { WeekProjection } from '../../components/charts/WeeklyProjectionChart';
import type { Engine } from '../../engine';

/** My weekly expected points with floor to ceiling, actuals for finished weeks, playoff weeks shaded. The title lives on the disclosure that holds it. */
export function ProjectionCard({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const { currentWeek: cur, maxWeek, playoffWeeks } = engine.model.meta;

  const weeks = useMemo<WeekProjection[]>(() => {
    const scope = engine.scope(scenario);
    const ros = scope.myRoster();
    const mine = new Map(engine.model.history.filter((h) => h.rid === engine.meRid && h.final).map((h) => [h.week, h.pts]));
    const out: WeekProjection[] = [];
    for (let w = 1; w <= maxWeek; w++) {
      const playoff = playoffWeeks.includes(w);
      if (w < cur) {
        if (mine.has(w)) out.push({ week: w, actual: mine.get(w), playoff });
        continue;
      }
      const L = scope.lineup(ros, w, true);
      let floor = 0, ceiling = 0;
      for (const s of L.slots) if (s.p) { const [a, b] = scope.range(s.p, w, true); floor += a; ceiling += b; }
      out.push({ week: w, expected: L.total, floor, ceiling, actual: mine.get(w) ?? null, playoff });
    }
    return out;
  }, [engine, scenario, cur, maxWeek, playoffWeeks]);

  return <WeeklyProjectionChart weeks={weeks} />;
}
