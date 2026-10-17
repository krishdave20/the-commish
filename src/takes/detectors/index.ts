import type { Detector } from '../common.ts';
import type { TakeKind } from '../types.ts';
import { blitzBeater } from './blitz_beater.ts';
import { boxCountEdge } from './box_count_edge.ts';
import { buyLow } from './buy_low.ts';
import { coverageNote } from './coverage_note.ts';
import { dynastyMover } from './dynasty_mover.ts';
import { rzRoleChange } from './rz_role_change.ts';
import { sellHigh } from './sell_high.ts';
import { softSchedule } from './soft_schedule.ts';
import { targetHog } from './target_hog.ts';
import { usageSpike } from './usage_spike.ts';
import { waiverRiser } from './waiver_riser.ts';

export { blitzBeater, boxCountEdge, buyLow, coverageNote, dynastyMover, rzRoleChange, sellHigh, softSchedule, targetHog, usageSpike, waiverRiser };

/** One pure detector per TakeKind. */
export const DETECTORS: Record<TakeKind, Detector> = {
  usage_spike: usageSpike, target_hog: targetHog, buy_low: buyLow, sell_high: sellHigh, rz_role_change: rzRoleChange,
  box_count_edge: boxCountEdge, blitz_beater: blitzBeater, soft_schedule: softSchedule, waiver_riser: waiverRiser,
  dynasty_mover: dynastyMover, coverage_note: coverageNote,
};
export const DETECTOR_KINDS = Object.keys(DETECTORS) as TakeKind[];
