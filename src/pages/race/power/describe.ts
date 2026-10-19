import { ordinal } from '../../../app/format';
import type { BumpSeries } from '../../../engine/power';

/** "icemen: 12th, 12th, 10th (weeks 2 to 4)" */
export function describeSeries(s: BumpSeries): string {
  const first = s.points[0], last = s.points[s.points.length - 1];
  if (!first || !last) return s.team;
  const span = first.week === last.week ? `week ${first.week}` : `weeks ${first.week} to ${last.week}`;
  return `${s.team}: ${s.points.map((p) => ordinal(p.rank)).join(', ')} (${span})`;
}
