import type { HingeStarter } from '../../../engine/hinges';

export const projectionOf = (p: HingeStarter) => p.actual + p.mu * p.remaining;

export interface Pairing { slot: string; a: HingeStarter | null; b: HingeStarter | null }

/** Line the two lineups up slot by slot: the k-th WR against the k-th WR, in the order of the first team's lineup, then any slot only
    the other team has. Both lineups come in the league's slot order, so the usual case is a straight row-by-row match. */
export function pairStarters(a: readonly HingeStarter[], b: readonly HingeStarter[]): Pairing[] {
  const pool = new Map<string, HingeStarter[]>();
  for (const p of b) { const l = pool.get(p.slot); if (l) l.push(p); else pool.set(p.slot, [p]); }
  const out: Pairing[] = a.map((p) => ({ slot: p.slot, a: p, b: pool.get(p.slot)?.shift() ?? null }));
  for (const [slot, rest] of pool) for (const p of rest) out.push({ slot, a: null, b: p });
  return out;
}

/** Each side's share of the slot: of the points scored when anybody has scored, else of the projections. */
export function slotShare(a: HingeStarter | null, b: HingeStarter | null): { a: number; basis: 'points' | 'projection' } | null {
  const pa = a?.actual ?? 0, pb = b?.actual ?? 0;
  if (pa + pb > 0) return { a: pa / (pa + pb), basis: 'points' };
  const ja = a ? projectionOf(a) : 0, jb = b ? projectionOf(b) : 0;
  return ja + jb > 0 ? { a: ja / (ja + jb), basis: 'projection' } : null;
}

