/* A team's finished weeks, read off the engine's own week views (`buildView` of a past week's matchups and projections). */
import type { LiveView } from '../live/derive.ts';
import type { PastWeek } from './tendencies.ts';

const r1 = (x: number) => Math.round(x * 10) / 10;

/** `views` are the finished weeks' LiveViews. A week where the team has no matchup is skipped. `projected` false when the week's projections
    could not be read (every expectation is then 0), so the over / underperformer line has nothing to stand on. */
export function pastWeeksOf(rid: number, views: ReadonlyArray<{ view: LiveView; projected: boolean }>): PastWeek[] {
  const out: PastWeek[] = [];
  for (const { view, projected } of views) {
    const m = view.matchups.find((x) => x.a.rid === rid || x.b.rid === rid);
    const bench = view.bench.find((b) => b.rid === rid);
    if (!m || !bench) continue;
    const t = m.a.rid === rid ? m.a : m.b;
    out.push({ week: view.week, actual: t.actual, projection: projected ? r1(t.preProjection) : null, left: bench.left });
  }
  return out.sort((a, b) => a.week - b.week);
}
