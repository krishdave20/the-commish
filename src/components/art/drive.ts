import { END_ZONE, FIELD_YARDS } from './field';

export type DriveSide = 'me' | 'opp' | 'other';

/** One scoring play: when it was seen, how many points moved, and whose it was. */
export interface DriveMark {
  id: string;
  /** any increasing time: marks keep their order along the field */
  t: number;
  /** signed fantasy points; a correction (negative) is drawn as a ring */
  points: number;
  side: DriveSide;
  /** a short description for the hover title */
  text?: string;
}

const LANE: Record<DriveSide, number> = { me: 28, other: 50, opp: 72 };
const SPREAD = 1.7;

/** where each mark sits: its share of the elapsed time across the playing field, nudged apart when two plays share a moment and a lane */
export function placeMarks(marks: readonly DriveMark[]): Array<{ mark: DriveMark; x: number; y: number; d: number }> {
  if (!marks.length) return [];
  const sorted = [...marks].sort((a, b) => a.t - b.t);
  const t0 = sorted[0]!.t, t1 = sorted[sorted.length - 1]!.t;
  const span = t1 - t0;
  const seen = new Map<string, number>();
  const margin = (END_ZONE / FIELD_YARDS) * 100;
  const width = 100 - margin * 2;
  return sorted.map((mark, i) => {
    const base = span > 0 ? (mark.t - t0) / span : sorted.length > 1 ? i / (sorted.length - 1) : 0.5;
    const key = `${mark.side}:${base.toFixed(3)}`;
    const dup = seen.get(key) ?? 0;
    seen.set(key, dup + 1);
    const x = Math.min(100 - margin - 1, margin + 1 + base * (width - 2) + dup * SPREAD);
    const d = mark.side === 'other' ? 6 + Math.min(6, Math.sqrt(Math.abs(mark.points))) : Math.max(8, Math.min(22, 6 + 4 * Math.sqrt(Math.abs(mark.points))));
    return { mark, x, y: LANE[mark.side], d };
  });
}
