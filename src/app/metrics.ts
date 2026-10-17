/* Thresholds shared by the M2 presentational components. Ported from ff_live.js. */

export type OddsTone = 'ok' | 'warn' | 'bad';

/** Green at 65% and up, gold at 35% and up, red below. */
export function oddsTone(p: number): OddsTone {
  return p >= 0.65 ? 'ok' : p >= 0.35 ? 'warn' : 'bad';
}

export type TierPillClass = 'solid-ok' | 'ok' | 'warn' | 'bad' | 'solid-bad';

/** Playoff-chance tier: Lock, Likely, Bubble, Long shot, Done. */
export function tierOf(p: number): { label: string; pill: TierPillClass } {
  if (p >= 0.99) return { label: 'Lock', pill: 'solid-ok' };
  if (p >= 0.75) return { label: 'Likely', pill: 'ok' };
  if (p >= 0.35) return { label: 'Bubble', pill: 'warn' };
  if (p >= 0.01) return { label: 'Long shot', pill: 'bad' };
  return { label: 'Done', pill: 'solid-bad' };
}

export type GradeKind = 'soft' | 'mid' | 'tough' | 'none';

/** Matchup grade from the defense-versus-position ratio (points allowed over league average). */
export function gradeOf(dvp: number | null | undefined): { kind: GradeKind; label: string; text: string } {
  if (dvp === null || dvp === undefined) return { kind: 'none', label: '', text: 'no data' };
  if (dvp >= 1.15) return { kind: 'soft', label: 'soft', text: 'soft matchup' };
  if (dvp <= 0.87) return { kind: 'tough', label: 'tough', text: 'tough matchup' };
  return { kind: 'mid', label: 'avg', text: 'average matchup' };
}

export type ClinchMarkKind = 'x' | 'y' | 'd' | 'e';

export const MARK_MEANING: Record<ClinchMarkKind, string> = {
  x: 'clinched a playoff spot',
  y: 'clinched division',
  d: 'out of division race',
  e: 'eliminated',
};
