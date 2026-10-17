/* The Hot Takes engine (SPEC section 7). Rule-based: detectors read real numbers, templates fill in the words, and
   nothing here calls a network or a model. Entry point: buildTakes(inputs, thresholds?). */
import type { Candidate } from './common.ts';
import { DETECTORS, DETECTOR_KINDS } from './detectors/index.ts';
import { applyEvidence } from './evidence.ts';
import { rankTakes, toTakes } from './rank.ts';
import { loadThresholds } from './thresholds.ts';
import type { Take, TakeInputs, TakesThresholds } from './types.ts';

/** All takes for the current inputs, ranked: your players first, then waiver and trade targets, then league-wide; within a
    bucket by detector strength; at most `max_per_player_week` per player. Each detector runs on its own, so one that throws
    on odd data costs only its own takes. */
export function buildTakes(inputs: TakeInputs, thresholds: TakesThresholds = loadThresholds()): Take[] {
  const cands: Candidate[] = [];
  for (const kind of DETECTOR_KINDS) {
    try {
      cands.push(...DETECTORS[kind](inputs, thresholds).map((c) => applyEvidence(c, thresholds)));
    } catch {
      /* a detector failing never takes the feed down */
    }
  }
  return rankTakes(toTakes(cands, inputs), thresholds.max_per_player_week);
}

export type { Candidate, Detector, Facts } from './common.ts';
export { DETECTORS, DETECTOR_KINDS, blitzBeater, boxCountEdge, buyLow, coverageNote, dynastyMover, rzRoleChange, sellHigh, softSchedule, targetHog, usageSpike, waiverRiser } from './detectors/index.ts';
export { VERDICT_FACTOR, applyEvidence, trackRecordFor } from './evidence.ts';
export { RELEVANCE_ORDER, rankTakes, relevanceOf, toTakes } from './rank.ts';
export { BANNED_WORDS, MAX_HEADLINE_WORDS, bannedIn, headlineVariants, lineupSpot, renderCandidate, variantIndex, whyForYouLine, wordCount } from './templates.ts';
export { DEFAULT_THRESHOLDS, loadThresholds, validateThresholds } from './thresholds.ts';
export { validateTake } from './validate.ts';
export type { Take, TakeAction, TakeInputs, TakeKind, TakesThresholds, Relevance } from './types.ts';
