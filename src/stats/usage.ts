/* Usage and efficiency formulas (SPEC section 5, "New derived stats"). Pure functions of counts so the
   pipeline (per week and per season) and the UI (a custom range) compute exactly the same numbers.
   Shares are fractions 0 to 1, rounded to 3 decimals; yards-per-X to 2. */
import { ratio, round } from './ratio.ts';

/** Snaps / team snaps. */
export const snapShare = (offSnaps: number, teamSnaps: number) => ratio(offSnaps, teamSnaps);

/** Targets / team pass attempts. Pass attempts exclude sacks (they have no target) but keep throwaways, so a team's shares sum to a bit under 1. */
export const targetShare = (targets: number, teamPassAtt: number) => ratio(targets, teamPassAtt);

/** The player's air yards on his targets / the team's air yards on its pass attempts. */
export const airYardsShare = (airYards: number, teamAirYards: number) => ratio(airYards, teamAirYards);

/** Average depth of target: air yards / targets, in yards (2 decimals). */
export const adot = (airYards: number, targets: number) => ratio(airYards, targets, 2);

/** Weighted opportunity rating: 1.5 * target share + 0.7 * air-yards share. null if either share is null (no team denominator). */
export function wopr(tgtShare: number | null, ayShare: number | null): number | null {
  if (tgtShare === null || ayShare === null) return null;
  return round(1.5 * tgtShare + 0.7 * ayShare, 3);
}

/** Receiving yards per target (2 decimals). */
export const yardsPerTarget = (recYards: number, targets: number) => ratio(recYards, targets, 2);

/** Receptions on catchable targets / catchable targets (FTN `is_catchable_ball`), so at most 1. */
export const catchRate = (catchableReceptions: number, catchableTargets: number) => ratio(catchableReceptions, catchableTargets);

/** Drops / catchable targets. */
export const dropRate = (drops: number, catchableTargets: number) => ratio(drops, catchableTargets);

/** Contested catches / contested targets. */
export const contestedCatchRate = (contestedCatches: number, contestedTargets: number) => ratio(contestedCatches, contestedTargets);

/** Carries / team run plays. */
export const rushShare = (carries: number, teamRushAtt: number) => ratio(carries, teamRushAtt);

/** Rushing yards per carry (2 decimals). */
export const yardsPerCarry = (rushYards: number, carries: number) => ratio(rushYards, carries, 2);

/** Targets per offensive snap. A PROXY for targets per route run (routes are not published for the current season); always label it. */
export const targetsPerSnap = (targets: number, offSnaps: number) => ratio(targets, offSnaps);

/** Part / whole, for the FTN mix shares (play-action share of targets, screen share, stacked-box rate...). */
export const share = (part: number, whole: number) => ratio(part, whole);

/** Yards per route run and targets per route run. `routes` is the route PROXY (dropbacks on the field as WR/TE/RB). */
export const yardsPerRouteRun = (yards: number, routes: number) => ratio(yards, routes, 2);
export const targetsPerRouteRun = (targets: number, routes: number) => ratio(targets, routes);

/** Red zone: a play is "red zone" at yardline_100 <= 20 (yards from the opponent's end zone), "inside 10" at <= 10. */
export const isRedZone = (yardline100: number | null) => yardline100 !== null && yardline100 <= 20;
export const isInside10 = (yardline100: number | null) => yardline100 !== null && yardline100 <= 10;

/** End-zone target: the target spot (yardline_100 minus air yards) is at or past the goal line. */
export function isEndZoneTarget(yardline100: number | null, airYards: number | null): boolean {
  return yardline100 !== null && airYards !== null && yardline100 - airYards <= 0;
}

/** Box buckets from FTN `n_defense_box`: 0 means "not charted"; 8+ is stacked, 6 or fewer is light, 7 is neither. */
export type BoxBucket = 'stacked' | 'light' | 'neutral' | 'unknown';
export function boxBucket(box: number | null): BoxBucket {
  if (box === null || !(box > 0)) return 'unknown';
  if (box >= 8) return 'stacked';
  if (box <= 6) return 'light';
  return 'neutral';
}

/** Does a split of `n` samples meet the minimum? The UI calls this to decide whether to show it. */
export const hasSample = (n: number, min: number) => n >= min;
