import type { CoverageRow, PlayerSeason, PlayerWeek } from '../../data/nflverseTypes';
import { MIN_CARRIES, MIN_ROUTES, MIN_TARGETS } from '../../data/nflverseTypes';

/* Pure helpers for the nflverse panels: pick a player's rows and apply the sample-size minimums. */

export const forPlayer = <T extends { pid: string }>(rows: readonly T[] | null | undefined, pid: string): T[] =>
  (rows ?? []).filter((r) => r.pid === pid);

export function seasonOf(rows: readonly PlayerSeason[] | null | undefined, pid: string): PlayerSeason | null {
  return (rows ?? []).find((r) => r.pid === pid) ?? null;
}

export function coverageOf(rows: readonly CoverageRow[] | null | undefined, pid: string): CoverageRow | null {
  return (rows ?? []).find((r) => r.pid === pid) ?? null;
}

export type Gate = 'targets' | 'carries' | 'routes';
const MINIMUM: Record<Gate, number> = { targets: MIN_TARGETS, carries: MIN_CARRIES, routes: MIN_ROUTES };
export const minimumFor = (g: Gate): number => MINIMUM[g];

/** The value, or null when its sample is under the minimum (the caller shows the sample size either way). */
export function gated(value: number | null | undefined, sample: number | null | undefined, gate: Gate): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return (sample ?? 0) >= MINIMUM[gate] ? value : null;
}

/** Weekly rows ordered by week, newest week last. */
export const byWeek = (rows: readonly PlayerWeek[]): PlayerWeek[] => [...rows].sort((a, b) => a.week - b.week);
