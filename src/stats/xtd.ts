/* Expected touchdowns from a yardline model fit in the notebook (data/xtd_model.json). The model is a table of
   buckets by play type and yardline_100 (yards from the opponent's end zone); each bucket says how often that
   kind of play produced a TD. Applied per target (pass bucket) and per carry (rush bucket). */
import { round } from './ratio.ts';

export interface XtdBucket {
  play_type: 'pass' | 'rush';
  /** yardline_100 lower edge, inclusive */
  yardline_from: number;
  /** yardline_100 upper edge, inclusive (buckets are whole yards: 1-1, 2-2, 4-5, 6-10, ...) */
  yardline_to: number;
  /** probability of a touchdown on a play in this bucket, 0 to 1 */
  p_td: number;
  /** plays the bucket was fit on */
  n: number;
}

export interface XtdModel {
  version: number;
  fit_season: number;
  buckets: XtdBucket[];
}

export const isXtdModel = (x: unknown): x is XtdModel => {
  if (typeof x !== 'object' || x === null) return false;
  const m = x as Partial<XtdModel>;
  return typeof m.version === 'number' && typeof m.fit_season === 'number' && Array.isArray(m.buckets) &&
    m.buckets.every((b) => b && (b.play_type === 'pass' || b.play_type === 'rush') && Number.isFinite(b.yardline_from) &&
      Number.isFinite(b.yardline_to) && Number.isFinite(b.p_td));
};

/** p(TD) for one play: the bucket of that play type with yardline_from <= yardline_100 <= yardline_to. A yardline in no
    bucket uses the nearest bucket of the same play type (so a model fit on yardlines 1 to 60 still answers at 75).
    null when the model has no bucket for that play type. */
export function xtdProbability(model: XtdModel, playType: 'pass' | 'rush', yardline100: number | null): number | null {
  if (yardline100 === null || !Number.isFinite(yardline100)) return null;
  let best: XtdBucket | null = null;
  let bestD = Infinity;
  for (const b of model.buckets) {
    if (b.play_type !== playType) continue;
    const d = yardline100 < b.yardline_from ? b.yardline_from - yardline100 : yardline100 > b.yardline_to ? yardline100 - b.yardline_to : 0;
    if (d < bestD) { bestD = d; best = b; }
    if (d === 0) break;
  }
  return best ? best.p_td : null;
}

/** Sum of p(TD) over a list of yardlines (one per target, or one per carry). null if the model is missing. */
export function expectedTds(model: XtdModel | null, playType: 'pass' | 'rush', yardlines: Array<number | null>): number | null {
  if (!model) return null;
  let sum = 0;
  for (const y of yardlines) sum += xtdProbability(model, playType, y) ?? 0;
  return round(sum, 2);
}

/** Touchdowns scored minus expected, 2 decimals. null when either side is unknown. */
export function tdGap(tds: number, xtd: number | null): number | null {
  return xtd === null ? null : round(tds - xtd, 2);
}
