/* Thresholds for the takes detectors: data/takes_thresholds.json (tuned by notebooks/takes_thresholds.ipynb) with
   SPEC section 7's numbers as typed defaults. The JSON is validated key by key: a missing or malformed key falls
   back to its default, so a half-written file can never break the feed. */
import raw from '../../data/takes_thresholds.json';
import type { TakesThresholds } from './types.ts';

/** SPEC section 7 defaults. Mirrors data/takes_thresholds.json as shipped. */
export const DEFAULT_THRESHOLDS: TakesThresholds = {
  version: 1,
  fit_season: null,
  max_per_player_week: 3,
  detectors: {
    usage_spike: { snap_share_jump: 0.15, baseline_weeks: 3, min_team_snaps: 40 },
    target_hog: { min_target_share: 0.25, weeks: 3, min_targets: 15 },
    buy_low: { ay_share_rank_max: 24, ppg_rank_min: 36, min_games: 3 },
    sell_high: { td_over_expected_min: 2, min_opportunities: 20 },
    rz_role_change: { i10_share_delta: 0.2, weeks: 3, min_team_i10_plays: 6 },
    box_count_edge: { ypc_light_min: 5.0, opp_light_rate_min: 0.35, min_light_carries: 15 },
    blitz_beater: { ypt_blitz_over_baseline: 2.0, opp_blitz_rate_min: 0.35, min_blitz_targets: 15 },
    soft_schedule: { weeks: 3, dvp_soft_min: 1.15 },
    waiver_riser: { min_trending_adds: 1000, usage_delta: 0.1 },
    dynasty_mover: { tail_pct: 0.05 },
    coverage_note: { yprr_gap_min: 0.6, opp_rate_min: 0.6, min_routes: 20 },
  },
  evidence: {},
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Keys that must be whole numbers of at least 1 (week and rank counts). */
const INTEGER_KEYS = new Set(['baseline_weeks', 'weeks', 'ay_share_rank_max', 'ppg_rank_min', 'min_games', 'max_per_player_week']);

/** Merge one detector block over its defaults, keeping only finite numbers (and positive integers where a count is meant). */
function mergeBlock<T extends object>(defaults: T, given: unknown): T {
  const out = { ...defaults } as Record<string, number>;
  if (!isObj(given)) return out as T;
  for (const k of Object.keys(defaults)) {
    const v = given[k];
    if (!isNum(v) || v < 0) continue;
    if (INTEGER_KEYS.has(k) && (!Number.isInteger(v) || v < 1)) continue;
    out[k] = v;
  }
  return out as T;
}

/** Validate untrusted JSON into a complete TakesThresholds. Anything missing or invalid takes its default. */
export function validateThresholds(input: unknown): TakesThresholds {
  const d = DEFAULT_THRESHOLDS;
  if (!isObj(input)) return structuredClone(d);
  const det = isObj(input.detectors) ? input.detectors : {};
  const detectors = {} as Record<string, unknown>;
  for (const k of Object.keys(d.detectors) as Array<keyof TakesThresholds['detectors']>) detectors[k] = mergeBlock(d.detectors[k], det[k]);
  const cap = input.max_per_player_week;
  return {
    version: 1,
    fit_season: isNum(input.fit_season) ? input.fit_season : null,
    max_per_player_week: isNum(cap) && Number.isInteger(cap) && cap >= 1 ? cap : d.max_per_player_week,
    detectors: detectors as unknown as TakesThresholds['detectors'],
    evidence: isObj(input.evidence) ? input.evidence : {},
  };
}

let loaded: TakesThresholds | null = null;

/** The shipped thresholds (data/takes_thresholds.json), validated. Cached; callers get a copy-safe object, do not mutate it. */
export function loadThresholds(): TakesThresholds {
  loaded ??= validateThresholds(raw);
  return loaded;
}
