/* Geometry of a bracket drawn left to right. Pure, so it can be tested without a browser.

   Every team that enters a game from "outside" (round 1, or a bye) takes one row; a game sits halfway between the
   two things that feed it. That keeps every game level with its feeders whatever the team count, byes included. */
import type { Bracket, Source } from '../../engine';

/** The vertical sizes that change with the device: a team's slot, and the room one team takes in the first column. */
export interface Dims { slotH: number; unit: number; matchH: number }
const dims = (slotH: number, unit: number): Dims => ({ slotH, unit, matchH: slotH * 2 + 1 });
/** with a mouse */
export const DEFAULT_DIMS: Dims = dims(30, 40);
/** on a phone or any touch screen: every team slot is a 40px tap target */
export const TOUCH_DIMS: Dims = dims(40, 52);

export const SLOT_H = DEFAULT_DIMS.slotH;
export const MATCH_H = DEFAULT_DIMS.matchH;
export const COL_W = 236;
export const GAP_W = 46;
export const UNIT = DEFAULT_DIMS.unit;
export const HEAD_H = 28;
export const CHAMP_H = 118;

export interface Placed {
  id: string;
  round: number;
  /** left edge */
  x: number;
  /** top edge of the box */
  y: number;
  /** vertical middle */
  cy: number;
}

export interface Connector {
  /** the game the line comes from */
  from: string;
  /** the game it goes into, and which slot */
  to: string;
  slot: 'a' | 'b';
  path: string;
}

export interface Layout {
  placed: Placed[];
  connectors: Connector[];
  width: number;
  height: number;
  /** the champion box (null when there are no games) */
  champ: { x: number; y: number; cy: number } | null;
  /** the line into the champion box */
  champPath: string | null;
  /** the id of the last game */
  finalId: string | null;
}

export function layoutBracket(bk: Bracket, d: Dims = DEFAULT_DIMS): Layout {
  const { slotH: SLOT_H, unit: UNIT, matchH: MATCH_H } = d;
  const byId = new Map(bk.matches.map((m) => [m.id, m] as const));
  const cy = new Map<string, number>();
  let leaf = 0;
  const side = (s: Source): number => {
    if (s.kind === 'win' && byId.has(s.match)) return place(s.match);
    return (leaf++ + 0.5) * UNIT;
  };
  const place = (id: string): number => {
    const known = cy.get(id);
    if (known !== undefined) return known;
    const m = byId.get(id)!;
    const ya = side(m.a), yb = side(m.b);
    const c = (ya + yb) / 2;
    cy.set(id, c);
    return c;
  };
  const last = bk.matches[bk.matches.length - 1];
  if (!last) return { placed: [], connectors: [], width: 0, height: 0, champ: null, champPath: null, finalId: null };
  place(last.id);
  for (const m of bk.matches) place(m.id); // games not reachable from the final (should not happen)

  const colX = (round: number) => (round - 1) * (COL_W + GAP_W);
  const placed: Placed[] = bk.matches.map((m) => {
    const c = cy.get(m.id)! + HEAD_H;
    return { id: m.id, round: m.round, x: colX(m.round), y: c - MATCH_H / 2, cy: c };
  });
  const at = new Map(placed.map((p) => [p.id, p] as const));
  const connectors: Connector[] = [];
  for (const m of bk.matches) {
    const to = at.get(m.id)!;
    for (const slot of ['a', 'b'] as const) {
      const s = m[slot];
      if (s.kind !== 'win') continue;
      const from = at.get(s.match);
      if (!from) continue;
      const x1 = from.x + COL_W, y1 = from.cy;
      const y2 = to.y + (slot === 'a' ? SLOT_H / 2 : SLOT_H + 1 + SLOT_H / 2);
      const xm = x1 + GAP_W / 2;
      connectors.push({ from: from.id, to: to.id, slot, path: `M${x1} ${y1}H${xm}V${y2}H${to.x}` });
    }
  }
  const fin = at.get(last.id)!;
  const cx = colX(bk.rounds + 1);
  const champ = { x: cx, y: fin.cy - CHAMP_H / 2, cy: fin.cy };
  const champPath = `M${fin.x + COL_W} ${fin.cy}H${cx}`;
  const height = Math.max(...placed.map((p) => p.y + MATCH_H), champ.y + CHAMP_H) + 8;
  return { placed, connectors, width: cx + COL_W, height, champ, champPath, finalId: last.id };
}
