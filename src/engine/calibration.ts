/* Calibration constants from the model-validation study (docs/MODEL_VALIDATION.md on branch claude/model-validation,
   later version on claude/sweet-mendel-8cd80d; notebooks odds_calibration, live_winprob_calibration, projection_bakeoff_2025).

   Two corrections, both off in `buildModel(pull, { referenceCompat: true })` so the strict regression test still
   proves the port matches the reference engine:
     1. the team weekly SD is scaled up (SD_CALIBRATION), which fixes every probability that rests on it;
     2. from mid-season the player mean is blended with the player's season average (see blendedMean). */

/** Multiplier on the team weekly score SD.
    Source: validation report, 104 finished leagues (8,422 weekly matchups). The real score difference was 1.25 times
    wider than the model's (z-SD 1.25, CI 1.24 to 1.28; 1.28 in 2023, 1.23 in 2024, 1.24 in 2025). Scaling the SD by
    1.245 out of sample took the pregame calibration slope from 0.78 to 0.99 (1 = calibrated, below 1 = overconfident).
    It is applied once, in `buildModel`: `model.meta.teamWeeklySd` is the calibrated SD that every probability reads
    (season simulation, weekly win chance, live win chance, hinges, trade odds, playoff machine, brackets). The raw
    SD is kept in `meta.teamWeeklySdRaw`. */
export const SD_CALIBRATION = 1.245;

/** The SD every probability should use: the raw team SD times the calibration (1 in reference-compatible builds). */
export const calibratedSd = (rawSd: number, referenceCompat = false): number => rawSd * (referenceCompat ? 1 : SD_CALIBRATION);

/* ---- late-season projection blend ----------------------------------------------------------------------------- */

/** First week (the model's current week) from which player means are blended with the season average.
    Evidence, full 2025 season, 14 held-out weeks (4,706 player-weeks, players projected above 0.5): the blend beat
    the plain projection by 0.020 MAE points in weeks 4 to 8 and by 0.039 from week 9 on (6 of the 9 weeks, 0.049 from
    week 11). On the 2026 weeks 4 and 5 the projection won (4.390 against 4.468), the early-season picture. */
export const PROJECTION_BLEND_START_WEEK = 9;
/** A player needs at least this many games played before the current week to be blended; fewer means the projection alone. */
export const BLEND_MIN_GAMES = 5;
/** Prior strength in the weight `gp / (gp + BLEND_PRIOR_GAMES)` the season average gets (projection_bakeoff_2025.ipynb). */
export const BLEND_PRIOR_GAMES = 10;
/** Only players projected above this are blended: the study's population, and a projection that says "not playing" stays zero. */
export const BLEND_MIN_PROJECTION = 0.5;
/** Positions the bake-off covered (team defenses and IDP were not in it). */
export const BLEND_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE', 'K'];

/** Weight on the season average after `gp` games: gp / (gp + 10). Note the direction: the average gets this weight,
    the projection gets the rest. After 9 games it is 0.47; after 16, 0.62. */
export const blendWeight = (gp: number): number => gp / (gp + BLEND_PRIOR_GAMES);

/** The blended player mean: (1 − w) × projection + w × season average, w = gp / (gp + 10). With fewer than
    BLEND_MIN_GAMES games, a missing average or a projection at or below BLEND_MIN_PROJECTION it returns the projection. */
export function blendedMean(projection: number, seasonAvg: number | null | undefined, gp: number): number {
  if (seasonAvg == null || !isFinite(seasonAvg) || gp < BLEND_MIN_GAMES || projection <= BLEND_MIN_PROJECTION) return projection;
  const w = blendWeight(gp);
  return (1 - w) * projection + w * seasonAvg;
}
