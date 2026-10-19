/* The drive chart's geometry: scoring updates laid out as plays on a football field, and the momentum line across it. Pure.

   - order:   plays sit left to right in time order (ties by id), spread evenly between the two goal lines, so two plays in the same poll never overlap
   - lanes:   your team's plays ride high, your opponent's low, the rest of the league's in the middle
   - size:    a play's marker is wider the more points it moved (square-root scale, so a 30-point play is not ten times a 3-point one)
   - momentum: the running margin (yours minus your opponent's) after each play, drawn so that ABOVE the midline means you are ahead. It is anchored to
               the margin on the scoreboard now: the margin when the visit began is the margin now minus everything the visit saw, so the line ends on
               the number you can see. */
import { fieldPct } from '../art/field';

export type PlaySide = 'me' | 'opp' | 'other';

export interface DrivePlay {
  id: string;
  /** any increasing time */
  t: number;
  /** signed fantasy points; a correction is negative and drawn hollow */
  points: number;
  side: PlaySide;
  /** the player, lowercase */
  name: string;
  /** "cin vs pit · q3 8:12": the game and where it stood */
  where: string;
  /** the player's id, position and NFL team: the popover shows his headshot (20 px) when it has them */
  pid?: string;
  pos?: string;
  nfl?: string | null;
}

export interface PlacedPlay {
  play: DrivePlay;
  /** percent of the field's width */
  x: number;
  /** percent of its height */
  y: number;
  /** marker width in px */
  size: number;
  index: number;
}

export const LANE: Record<PlaySide, number> = { me: 27, other: 50, opp: 73 };
/** the playing field between the goal lines, as percentages of the whole field */
export const X_MIN = fieldPct(3);
export const X_MAX = fieldPct(97);

export function playSize(side: PlaySide, points: number): number {
  const r = Math.sqrt(Math.abs(points));
  return side === 'other' ? Math.round(Math.max(7, Math.min(12, 6 + 1.2 * r))) : Math.round(Math.max(14, Math.min(30, 12 + 3 * r)));
}

export const signedPoints = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`;

/** "+6.4 · ja'marr chase · cin vs pit · q3 8:12": what a tap or hover says. */
export function playText(p: DrivePlay): string {
  return [signedPoints(p.points), p.name, p.where].filter(Boolean).join(' · ');
}

/** The context an assistive tech reads after the visible points: "ja'marr chase, cin vs pit, q3 8:12". */
export function playContext(p: DrivePlay): string {
  return [p.name, ...p.where.split(' · ')].filter(Boolean).join(', ');
}

export function sortPlays(plays: readonly DrivePlay[]): DrivePlay[] {
  return [...plays].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
}

export function placePlays(plays: readonly DrivePlay[]): PlacedPlay[] {
  const sorted = sortPlays(plays);
  const n = sorted.length;
  return sorted.map((play, index) => ({
    play, index, x: X_MIN + ((index + 0.5) / n) * (X_MAX - X_MIN), y: LANE[play.side], size: playSize(play.side, play.points),
  }));
}

export interface MomentumPoint { x: number; y: number; margin: number }

/** The margin line. `marginNow` is yours minus your opponent's on the scoreboard; with no plays the line is flat at that margin. */
export function momentum(plays: readonly DrivePlay[], marginNow: number): MomentumPoint[] {
  const placed = placePlays(plays);
  const signed = (p: DrivePlay) => (p.side === 'me' ? p.points : p.side === 'opp' ? -p.points : 0);
  const seen = placed.reduce((s, p) => s + signed(p.play), 0);
  let m = marginNow - seen;
  const raw: Array<{ x: number; margin: number }> = [{ x: X_MIN - 1, margin: m }];
  for (const p of placed) { m += signed(p.play); raw.push({ x: p.x, margin: m }); }
  raw.push({ x: X_MAX + 1, margin: marginNow });
  const scale = Math.max(1, ...raw.map((r) => Math.abs(r.margin)));
  return raw.map((r) => ({ x: r.x, margin: r.margin, y: 50 - (r.margin / scale) * 40 }));
}
