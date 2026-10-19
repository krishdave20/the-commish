/* Where each game sits vertically in a bracket card. The same rule as the page's layout (src/components/bracket/layout.ts): every team that
   enters from outside (round 1, or a bye) takes one row, and a game sits halfway between the two things that feed it. Units are rows. */
import type { Bracket, Source } from '../bracket/types.ts';

export interface BracketRows {
  /** match id -> the vertical middle, in rows (a first-round game of two teams has its middle on a whole row boundary) */
  cy: Record<string, number>;
  /** how many rows the bracket is tall */
  rows: number;
  /** match id -> the game it feeds and the slot it fills (absent for the final) */
  feeds: Record<string, { to: string; slot: 'a' | 'b' }>;
}

export function bracketRows(bk: Bracket): BracketRows {
  const byId = new Map(bk.matches.map((m) => [m.id, m] as const));
  const cy: Record<string, number> = {};
  const feeds: BracketRows['feeds'] = {};
  let leaf = 0;
  const side = (s: Source): number => (s.kind === 'win' && byId.has(s.match) ? place(s.match) : leaf++ + 0.5);
  const place = (id: string): number => {
    const known = cy[id];
    if (known !== undefined) return known;
    const m = byId.get(id)!;
    const ya = side(m.a), yb = side(m.b);
    if (m.a.kind === 'win') feeds[m.a.match] = { to: id, slot: 'a' };
    if (m.b.kind === 'win') feeds[m.b.match] = { to: id, slot: 'b' };
    cy[id] = (ya + yb) / 2;
    return cy[id]!;
  };
  const last = bk.matches[bk.matches.length - 1];
  if (!last) return { cy, rows: 0, feeds };
  place(last.id);
  for (const m of bk.matches) place(m.id);
  return { cy, rows: leaf, feeds };
}
