import type { HealthResult } from '../data';
import { HEALTH_LABEL } from './names';

/** "27 healthy · 6 questionable · 0 out" (levels ok, warn and fail, shown as injury designations) */
export function summarize(results: HealthResult[]): string {
  const n = (l: HealthResult['level']) => results.filter((r) => r.level === l).length;
  return `${n('ok')} ${HEALTH_LABEL.ok} · ${n('warn')} ${HEALTH_LABEL.warn} · ${n('fail')} ${HEALTH_LABEL.fail}`;
}
