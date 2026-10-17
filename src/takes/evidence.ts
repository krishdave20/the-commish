/* What the 2025 backtest (notebooks/takes_thresholds.ipynb, recorded in data/takes_thresholds.json `evidence`) says about
   each kind of take. It does three things to a candidate: overrides the tone with the evidence's `suggested_tone`, scales the
   score by how much the evidence trusts the detector, and writes the one-line track record shown on the card.
   Missing or malformed evidence changes nothing (factor 1, tone as the detector set it, no track record). */
import type { Candidate } from './common.ts';
import type { Take, TakeKind, TakesThresholds } from './types.ts';

/** Score multipliers by backtest verdict. */
export const VERDICT_FACTOR: Record<string, number> = { signal: 1, weak: 0.8, none: 0.6, leans_wrong: 0.6 };
/** Multiplier for kinds the notebook could not backtest (no history for the data). */
export const NOT_BACKTESTED_FACTOR = 0.7;
export const NOT_BACKTESTED_TEXT = 'not backtested: no 2025 history for this data';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const TONES = new Set(['good', 'bad', 'watch']);

function evidenceOf(th: TakesThresholds, kind: TakeKind): Record<string, unknown> | null {
  const e = th.evidence?.[kind];
  return isObj(e) ? e : null;
}

/** The numbers a track record quotes: the chosen threshold's (top level), or one direction's for rz_role_change. */
function stats(e: Record<string, unknown>, c: Candidate): { n: number; hit: number; universe: number } | null {
  let src: Record<string, unknown> = e;
  if (c.facts.kind === 'rz_role_change' && isObj(e.by_direction)) {
    const d = e.by_direction[c.facts.up ? 'up' : 'down'];
    if (isObj(d)) src = { ...e, ...d };
  }
  const n = num(src.n), hit = num(src.hit_rate), universe = num(src.universe_hit_rate);
  return n != null && hit != null && universe != null ? { n, hit, universe } : null;
}

/** "2025 backtest: beat projection 45% of the time vs 37% for all players (119 takes)", or the not-backtested line, or null. */
export function trackRecordFor(c: Candidate, th: TakesThresholds): string | null {
  const e = evidenceOf(th, c.kind);
  if (!e) return null;
  if (e.backtested === false) return NOT_BACKTESTED_TEXT;
  if (e.backtested !== true) return null;
  const s = stats(e, c);
  if (!s) return null;
  // the hit rate counts takes that went the way the take points; a "bad" detector (sell high, a falling role) points down
  const verb = c.tone === 'bad' ? 'fell short of' : 'beat';
  return `2025 backtest: ${verb} projection ${Math.round(s.hit * 100)}% of the time vs ${Math.round(s.universe * 100)}% for all players (${s.n} takes)`;
}

/** Tone, score and track record from the evidence. Pure: returns a new candidate. The track record's wording follows the
    detector's own direction, so it is computed before the tone is overridden. */
export function applyEvidence(c: Candidate, th: TakesThresholds): Candidate {
  const e = evidenceOf(th, c.kind);
  const trackRecord = trackRecordFor(c, th);
  if (!e) return { ...c, trackRecord };
  let tone: Take['tone'] = c.tone;
  let suggested: unknown = e.suggested_tone;
  if (c.facts.kind === 'rz_role_change' && isObj(e.by_direction)) {
    const d = e.by_direction[c.facts.up ? 'up' : 'down'];
    if (isObj(d) && TONES.has(d.suggested_tone as string)) suggested = d.suggested_tone;
  }
  if (typeof suggested === 'string' && TONES.has(suggested)) tone = suggested as Take['tone'];
  const factor = e.backtested === false ? NOT_BACKTESTED_FACTOR : typeof e.verdict === 'string' ? (VERDICT_FACTOR[e.verdict] ?? 1) : 1;
  return { ...c, tone, score: Math.round(c.score * factor * 1e4) / 1e4, trackRecord };
}
