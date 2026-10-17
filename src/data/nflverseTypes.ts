/* Output schemas of the nightly nflverse job (scripts/nflverse). The pipeline writes these files next to the
   site (./data/nflverse/*.json); src/data/nflverse.ts reads them. Types only, plus the few constants the UI
   and the pipeline must agree on. No DOM, no imports: Node scripts use it too.

   Conventions, everywhere below:
   - Every player is keyed by the SLEEPER player_id. Teams use Sleeper abbreviations (LAR, not LA).
   - Shares and rates are fractions 0 to 1 (0.253 = 25.3%) rounded to 3 decimals; yards-per-X values are
     rounded to 2 decimals. null means "no denominator" (0 targets, no model...), never 0.
   - Counts are raw. The UI hides a split whose sample is under the minimum below (it still gets the raw count).
   - Large tables are columnar: `cols` names each position of every row, so the files stay small. Use
     `decodeColumnar` in src/data/nflverse.ts to turn them into objects.
   - Regular season only (nflverse season_type REG). */

/** A split with fewer targets than this is hidden. */
export const MIN_TARGETS = 15;
/** A split with fewer routes (the route proxy, see `routesDefinition`) than this is hidden. */
export const MIN_ROUTES = 20;
/** A split with fewer carries than this is hidden. */
export const MIN_CARRIES = 15;

export const NFLVERSE_ATTRIBUTION = 'Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.';

/** File names inside the output directory. */
export const nflverseFiles = {
  manifest: 'manifest.json',
  weekly: (season: number | string) => `weekly_${season}.json`,
  season: (season: number | string) => `season_${season}.json`,
  teams: (season: number | string) => `teams_${season}.json`,
  coverage: (season: number | string) => `coverage_${season}.json`,
  unmatched: 'unmatched.json',
} as const;

/** How a Sleeper player was joined to nflverse, in the order they are tried. */
export type MatchMethod =
  /** Sleeper `gsis_id` equals an nflverse `gsis_id` */
  | 'gsis'
  /** Sleeper `espn_id` equals the nflverse `players.csv` `espn_id` (which gives the gsis_id and pfr_id) */
  | 'espn'
  /** normalized name + same team + same position group, and exactly one candidate on each side */
  | 'name_team_pos'
  /** normalized name + position group, team differs (a trade, say), exactly one candidate on each side AND both birth dates known and equal */
  | 'name_pos';

/* ---------- manifest.json ---------- */

export interface NflverseSource {
  /** which input: `pbp`, `snap_counts`, `ftn_charting`, `players`, `pbp_participation`, or `pbp_prev` (play-by-play of the participation season, needed to turn routes into yards) */
  id: 'pbp' | 'snap_counts' | 'ftn_charting' | 'players' | 'pbp_participation' | 'pbp_prev' | 'sleeper_players';
  /** file name, e.g. `play_by_play_2026.csv.gz` */
  name: string;
  url: string;
  /** season of the file; null for files that are not per season (players, sleeper_players) */
  season: number | null;
  /** HTTP ETag of the download; null if the server sent none */
  etag: string | null;
  /** HTTP Last-Modified of the download; null if the server sent none */
  lastModified: string | null;
  /** size of the downloaded file in bytes (compressed size for .gz) */
  bytes: number;
  /** true when this run reused the cached copy (HTTP 304 / still fresh) instead of downloading */
  fromCache: boolean;
}

export interface NflverseManifest {
  schema: 1;
  /** ISO time the pipeline finished. The UI shows it as "data as of". */
  generatedAt: string;
  /** current season: weekly, season and teams files cover this season */
  season: number;
  /** seasons the weekly/season/teams files cover (today just `[season]`) */
  seasonsCovered: number[];
  /** latest week that has any play-by-play. A week can be partial while games are being played. */
  throughWeek: number;
  /** season of the participation (routes, man/zone, coverage) data in coverage_{participationSeason}.json */
  participationSeason: number;
  /** true when participationSeason equals season. false means the panels must be labeled "last season". */
  participationIsCurrent: boolean;
  /** Plain-English definition of "routes run" for the UI to display next to every route stat. */
  routesDefinition: string;
  /** Short plain-English definition of each derived stat, by key (tgt_share, wopr, ...), for tooltips. */
  definitions: Record<string, string>;
  sources: NflverseSource[];
  /** files written, with their size in bytes (uncompressed) */
  files: Record<string, number>;
  /** expected-TD model status. When available is false, every xtd_* / td_gap field is null. */
  xtd: { available: boolean; fitSeason: number | null; version: number | null };
  /** Sleeper players joined to nflverse, by the method that matched them */
  matchMethods: Record<MatchMethod, number>;
  /** total Sleeper players joined (sum of matchMethods) */
  matched: number;
  /** gsis/espn id matches refused because the names disagreed (Sleeper carries a wrong or swapped id); those players fell through to the name tiers */
  idConflicts?: number;
  /** nflverse players with offensive snaps, targets or carries this season that could not be joined to a Sleeper player (length of unmatched.json `players`) */
  unmatchedCount: number;
  /** share of this season's pass plays and rushes that found their FTN charting row (0 to 1) */
  ftnJoinRate: number | null;
  attribution: string;
}

/* ---------- player stat columns (weekly and season) ---------- */

/** Raw counts for one player over one week, or summed over the season. All integers unless noted. */
export interface PlayerCounts {
  /** offensive snaps (snap_counts `offense_snaps`) */
  off_snaps: number;
  /** the team's offensive snaps in the same game(s) (the largest `offense_snaps` on the team that week); denominator of snap share */
  tm_snaps: number;

  /** targets: pass plays (not sacks, spikes, two-point tries) with this player as the intended receiver */
  tgt: number;
  /** receptions: targets that were completed */
  rec: number;
  /** receiving yards on those receptions */
  rec_yds: number;
  /** receiving touchdowns */
  rec_td: number;
  /** air yards on all his targets (yards from the line of scrimmage to the target spot, complete or not; can be negative) */
  air_yds: number;
  /** targets FTN charted as a catchable ball: the denominator of catch rate. Only counts targets that have an FTN row. */
  catchable_tgt: number;
  /** receptions among those catchable targets: the numerator of catch rate (so a catch with no FTN row cannot push it past 1).
      Always present in the files; optional in the type only so hand-built test data from before it existed still compiles. */
  catchable_rec?: number;
  /** drops FTN charted on his targets */
  drops: number;
  /** targets that have an FTN row (denominator of the FTN rates: play-action, screen, contested, blitz) */
  ftn_tgt: number;

  /** targets with the ball spotted inside the opponent's 20 (yardline_100 <= 20) */
  rz_tgt: number;
  /** targets with the ball spotted inside the opponent's 10 (yardline_100 <= 10) */
  i10_tgt: number;
  /** end-zone targets: spot of the target (yardline_100 minus air yards) is at or past the goal line */
  ez_tgt: number;

  /** carries: run plays (including QB scrambles, not kneels or two-point tries) with this player as rusher */
  car: number;
  rush_yds: number;
  rush_td: number;
  /** carries from inside the opponent's 20 */
  rz_car: number;
  /** carries from inside the opponent's 10 */
  i10_car: number;

  /** carries with a charted box count (FTN `n_defense_box` > 0): denominator of the box shares */
  box_car: number;
  /** carries into a stacked box (8 or more defenders in the box) */
  stk_car: number;
  /** rushing yards on those carries */
  stk_yds: number;
  /** carries into a light box (6 or fewer defenders in the box) */
  lgt_car: number;
  /** rushing yards on those carries */
  lgt_yds: number;

  /** targets on plays with at least one blitzer (FTN `n_blitzers` >= 1) */
  bl_tgt: number;
  bl_rec: number;
  bl_yds: number;
  /** targets on plays with no blitzer (`n_blitzers` = 0). bl_tgt + nbl_tgt = ftn_tgt. */
  nbl_tgt: number;
  nbl_rec: number;
  nbl_yds: number;

  /** targets on play-action plays (FTN `is_play_action`) */
  pa_tgt: number;
  /** targets on screen passes (FTN `is_screen_pass`) */
  scr_tgt: number;
  /** targets FTN charted as contested balls */
  cont_tgt: number;
  /** contested targets that were caught */
  cont_rec: number;

  /** expected receiving TDs: sum over his targets of p_td(yardline_100) from data/xtd_model.json (pass buckets), 2 decimals. null when the model file is missing. */
  xtd_rec: number | null;
  /** expected rushing TDs: sum over his carries of p_td(yardline_100) from the rush buckets, 2 decimals. null when the model file is missing. */
  xtd_rush: number | null;
}

/** Shares of the team's opportunity. Fractions 0 to 1, null when the team denominator is 0. */
export interface PlayerShares {
  /** snap share: off_snaps / tm_snaps */
  snap_pct: number | null;
  /** target share: tgt / team pass attempts (pass plays, sacks excluded). Throwaways stay in the denominator. */
  tgt_share: number | null;
  /** air-yards share: air_yds / team air yards on pass attempts */
  ay_share: number | null;
  /** WOPR: 1.5 * tgt_share + 0.7 * ay_share (not a fraction: a typical WR1 is 0.6 to 0.9) */
  wopr: number | null;
  /** rush share: car / team carries (all run plays, including QB runs) */
  rush_share: number | null;
  /** red-zone target share: rz_tgt / team pass attempts from inside the 20 */
  rz_tgt_share: number | null;
  /** inside-10 target share: i10_tgt / team pass attempts from inside the 10 */
  i10_tgt_share: number | null;
  /** red-zone carry share: rz_car / team carries from inside the 20 */
  rz_car_share: number | null;
  /** inside-10 carry share: i10_car / team carries from inside the 10 */
  i10_car_share: number | null;
}

/** Per-play rates derived from the counts. null when the denominator is 0 or the field is unavailable. Season file only. */
export interface PlayerRates {
  /** average depth of target: air_yds / tgt, yards */
  adot: number | null;
  /** yards per target: rec_yds / tgt */
  ypt: number | null;
  /** catch rate vs catchable targets: catchable_rec / catchable_tgt (FTN). The sample is catchable_tgt. */
  catch_rate: number | null;
  /** drop rate: drops / catchable_tgt */
  drop_rate: number | null;
  /** yards per carry: rush_yds / car */
  ypc: number | null;
  /** yards per carry into stacked boxes: stk_yds / stk_car (sample: stk_car) */
  ypc_stk: number | null;
  /** yards per carry into light boxes: lgt_yds / lgt_car (sample: lgt_car) */
  ypc_lgt: number | null;
  /** targets per offensive snap: tgt / off_snaps. A PROXY for targets per route run; label it as such. */
  tgt_per_snap: number | null;
  /** yards per target on blitz plays: bl_yds / bl_tgt (sample: bl_tgt) */
  ypt_bl: number | null;
  /** yards per target with no blitz: nbl_yds / nbl_tgt (sample: nbl_tgt) */
  ypt_nbl: number | null;
  /** play-action share of his charted targets: pa_tgt / ftn_tgt */
  pa_share: number | null;
  /** screen share of his charted targets: scr_tgt / ftn_tgt */
  scr_share: number | null;
  /** contested-catch rate: cont_rec / cont_tgt (sample: cont_tgt) */
  cont_rate: number | null;
  /** touchdowns scored (rec_td + rush_td) minus expected (xtd_rec + xtd_rush). Positive = scoring above expectation. null without the xTD model. */
  td_gap: number | null;
}

/* ---------- weekly_{season}.json ---------- */

/** Identity columns of a weekly row. */
export interface PlayerWeekId {
  /** Sleeper player_id */
  pid: string;
  /** NFL week 1 to 18 */
  week: number;
  /** team he played for that week (Sleeper abbreviation) */
  team: string;
  /** opponent that week; null if unknown */
  opp: string | null;
}

/** One player-week, after `decodeColumnar`. Rows exist only for weeks with an offensive snap, target or carry. */
export type PlayerWeek = PlayerWeekId & PlayerCounts & PlayerShares;

export type WeeklyCell = string | number | null;

/** Columnar table: rows[i][j] is the value of cols[j] for row i. */
export interface Columnar<C extends string = string> {
  cols: C[];
  rows: WeeklyCell[][];
}

export interface WeeklyFile extends Columnar<keyof PlayerWeek & string> {
  schema: 1;
  season: number;
  generatedAt: string;
}

/* ---------- season_{season}.json ---------- */

/** Season to date for one player. Counts are sums over the weeks he played. Shares divide his summed counts by the summed team
    denominators of THOSE weeks only (weeks with a snap, target or carry), so missed games do not dilute them. */
export type PlayerSeason = {
  pid: string;
  /** most recent team */
  team: string;
  /** weeks with an offensive snap, target or carry */
  games: number;
} & PlayerCounts & PlayerShares & PlayerRates;

export interface SeasonFile extends Columnar<keyof PlayerSeason & string> {
  schema: 1;
  season: number;
  generatedAt: string;
  throughWeek: number;
}

/* ---------- teams_{season}.json ---------- */

/** One team-week: the offense's opportunity totals (the denominators of the shares) and what its DEFENSE faced.
    Rows exist for every team that played a counted play that week. */
export interface TeamWeek {
  team: string;
  week: number;
  opp: string | null;
  /** team offensive snaps (largest player `offense_snaps`) */
  off_snaps: number;
  /** pass attempts: pass plays, sacks excluded (denominator of target share) */
  pass_att: number;
  /** run plays, QB runs and scrambles included (denominator of rush share) */
  rush_att: number;
  /** air yards on pass_att (denominator of air-yards share) */
  air_yds: number;
  /** pass attempts from inside the opponent's 20 */
  rz_pass_att: number;
  /** pass attempts from inside the opponent's 10 */
  i10_pass_att: number;
  /** run plays from inside the opponent's 20 */
  rz_rush_att: number;
  /** run plays from inside the opponent's 10 */
  i10_rush_att: number;
  /** dropbacks the offense had: pass attempts + sacks + scrambles */
  dropbacks: number;

  /* what this team's DEFENSE faced that week ("allowed" tendencies; opponent offense stats) */
  /** dropbacks faced that have an FTN row (denominator of blitz rate) */
  def_db: number;
  /** of those, dropbacks on which it sent at least one blitzer (`n_blitzers` >= 1) */
  def_blitz: number;
  /** blitz rate: def_blitz / def_db */
  def_blitz_rate: number | null;
  /** rushes faced with a charted box count (denominator of box rates) */
  def_box_car: number;
  /** of those, rushes into a light box (6 or fewer defenders). */
  def_light_car: number;
  /** light-box rate: def_light_car / def_box_car */
  def_light_rate: number | null;
  /** of those, rushes into a stacked box (8 or more) */
  def_stk_car: number;
  /** stacked-box rate: def_stk_car / def_box_car */
  def_stk_rate: number | null;
  /** dropbacks faced that have a man/zone label from participation data. null when participation for this season is not published (the 2026 case); see coverage_{season}.json for last season. */
  def_mz_db: number | null;
  /** of those, dropbacks in man coverage */
  def_man: number | null;
  /** man rate: def_man / def_mz_db (zone rate = 1 - man rate) */
  def_man_rate: number | null;
}

export interface TeamsFile extends Columnar<keyof TeamWeek & string> {
  schema: 1;
  season: number;
  generatedAt: string;
  /** false when man/zone fields are null because participation for `season` is not published */
  hasManZone: boolean;
}

/* ---------- coverage_{participationSeason}.json ---------- */

/** Routes, targets and production for one situation. `routes` is the route PROXY (see NflverseManifest.routesDefinition). */
export interface CoverageSplit {
  /** route proxy: dropbacks he was on the field for as WR, TE or RB */
  routes: number;
  /** targets on those dropbacks */
  tgt: number;
  rec: number;
  yds: number;
  td: number;
}

/** Tuple form of CoverageSplit used inside `shells`: [routes, tgt, rec, yds, td]. */
export type CoverageTuple = [routes: number, tgt: number, rec: number, yds: number, td: number];

/** Season columns for one player. Prefix `man_` = against man coverage, `zone_` = against zone (participation `defense_man_zone_type`).
    Each prefix has the CoverageSplit fields: routes, tgt, rec, yds, td. */
export interface CoverageRow {
  pid: string;
  team: string;
  routes: number; tgt: number; rec: number; yds: number; td: number;
  man_routes: number; man_tgt: number; man_rec: number; man_yds: number; man_td: number;
  zone_routes: number; zone_tgt: number; zone_rec: number; zone_yds: number; zone_td: number;
  /** yards per route run: yds / routes (route proxy) */
  yprr: number | null;
  /** targets per route run: tgt / routes */
  tprr: number | null;
  /** yards per route run vs man: man_yds / man_routes */
  yprr_man: number | null;
  tprr_man: number | null;
  /** yards per route run vs zone: zone_yds / zone_routes */
  yprr_zone: number | null;
  tprr_zone: number | null;
}

/** What one defense ran over the season, from participation. */
export interface CoverageTeam {
  /** dropbacks faced with a coverage label */
  dropbacks: number;
  man: number;
  zone: number;
  /** man / (man + zone) */
  man_rate: number | null;
  /** dropbacks by coverage shell (`COVER_3`, `COVER_1`, `COVER_2`, `COVER_4`, `COVER_6`, `2_MAN`, `COVER_0`, `COVER_9`, `COMBO`, `BLOWN`) */
  shells: Record<string, number>;
}

export interface CoverageFile extends Columnar<keyof CoverageRow & string> {
  schema: 1;
  season: number;
  generatedAt: string;
  /** false when `season` is older than the current season: label the panels "last season" */
  isCurrent: boolean;
  /** same text as the manifest's routesDefinition */
  routesDefinition: string;
  /** pid -> coverage shell -> [routes, tgt, rec, yds, td] (the same measure as CoverageSplit, per shell). Only shells with routes. */
  shells: Record<string, Record<string, CoverageTuple>>;
  /** defense team -> coverage mix it ran */
  teams: Record<string, CoverageTeam>;
}

/* ---------- unmatched.json ---------- */

export type UnmatchedReason =
  /** no Sleeper player has this gsis_id/espn_id, and no Sleeper player has this name on this team at this position */
  | 'no_candidate'
  /** two or more players on one side fit the name+team+position rule, so none was guessed */
  | 'ambiguous'
  /** a Sleeper player has the same name and position but a different team, and birth dates could not confirm it */
  | 'team_mismatch'
  /** another nflverse player claims the same Sleeper player (duplicate rows) */
  | 'duplicate';

export interface UnmatchedPlayer {
  /** nflverse gsis_id, or `pfr:<pfr_id>` when the player only appears in snap counts and players.csv has no gsis_id for him */
  key: string;
  gsis: string | null;
  pfr: string | null;
  name: string;
  team: string | null;
  pos: string | null;
  /** this season's offensive snaps, targets and carries (why he matters) */
  off_snaps: number;
  tgt: number;
  car: number;
  reason: UnmatchedReason;
  /** a Sleeper player considered and not accepted, when there is one (name + id), to help fix the join by hand */
  candidates: string[];
}

export interface UnmatchedFile {
  schema: 1;
  season: number;
  generatedAt: string;
  /** Skill positions only (QB, RB, WR, TE, FB); linemen have snaps but no fantasy value. Sorted by off_snaps, highest first. */
  players: UnmatchedPlayer[];
}

/* ---------- column lists (the order the pipeline writes, and the keys of each interface) ---------- */

export const COUNT_KEYS = [
  'off_snaps', 'tm_snaps', 'tgt', 'rec', 'rec_yds', 'rec_td', 'air_yds', 'catchable_tgt', 'catchable_rec', 'drops', 'ftn_tgt',
  'rz_tgt', 'i10_tgt', 'ez_tgt', 'car', 'rush_yds', 'rush_td', 'rz_car', 'i10_car',
  'box_car', 'stk_car', 'stk_yds', 'lgt_car', 'lgt_yds', 'bl_tgt', 'bl_rec', 'bl_yds', 'nbl_tgt', 'nbl_rec', 'nbl_yds',
  'pa_tgt', 'scr_tgt', 'cont_tgt', 'cont_rec', 'xtd_rec', 'xtd_rush',
] as const satisfies readonly (keyof PlayerCounts)[];

export const SHARE_KEYS = [
  'snap_pct', 'tgt_share', 'ay_share', 'wopr', 'rush_share', 'rz_tgt_share', 'i10_tgt_share', 'rz_car_share', 'i10_car_share',
] as const satisfies readonly (keyof PlayerShares)[];

export const RATE_KEYS = [
  'adot', 'ypt', 'catch_rate', 'drop_rate', 'ypc', 'ypc_stk', 'ypc_lgt', 'tgt_per_snap', 'ypt_bl', 'ypt_nbl', 'pa_share', 'scr_share', 'cont_rate', 'td_gap',
] as const satisfies readonly (keyof PlayerRates)[];

export const WEEKLY_COLS = ['pid', 'week', 'team', 'opp', ...COUNT_KEYS, ...SHARE_KEYS] as const satisfies readonly (keyof PlayerWeek)[];
export const SEASON_COLS = ['pid', 'team', 'games', ...COUNT_KEYS, ...SHARE_KEYS, ...RATE_KEYS] as const satisfies readonly (keyof PlayerSeason)[];

export const TEAM_COLS = [
  'team', 'week', 'opp', 'off_snaps', 'pass_att', 'rush_att', 'air_yds', 'rz_pass_att', 'i10_pass_att', 'rz_rush_att', 'i10_rush_att', 'dropbacks',
  'def_db', 'def_blitz', 'def_blitz_rate', 'def_box_car', 'def_light_car', 'def_light_rate', 'def_stk_car', 'def_stk_rate', 'def_mz_db', 'def_man', 'def_man_rate',
] as const satisfies readonly (keyof TeamWeek)[];

export const COVERAGE_COLS = [
  'pid', 'team', 'routes', 'tgt', 'rec', 'yds', 'td',
  'man_routes', 'man_tgt', 'man_rec', 'man_yds', 'man_td', 'zone_routes', 'zone_tgt', 'zone_rec', 'zone_yds', 'zone_td',
  'yprr', 'tprr', 'yprr_man', 'tprr_man', 'yprr_zone', 'tprr_zone',
] as const satisfies readonly (keyof CoverageRow)[];

/** The plain-English definitions the manifest carries, so tooltips and the code agree. */
export const ROUTES_DEFINITION =
  'Routes run are an estimate. nflverse participation data records the route only for the targeted receiver, so a player\'s routes are counted ' +
  'as the dropbacks (pass attempts, sacks and scrambles) on which he was on the field as a WR, TE or RB. Players who stay in to block are still ' +
  'counted, so routes run high (and yards per route run low) for TEs and especially RBs.';

export const STAT_DEFINITIONS: Record<string, string> = {
  snap_pct: 'Offensive snaps divided by the team\'s offensive snaps.',
  tgt_share: 'Targets divided by team pass attempts (sacks excluded, throwaways included).',
  ay_share: 'Air yards on his targets divided by the team\'s air yards on all pass attempts.',
  wopr: 'Weighted opportunity rating: 1.5 x target share + 0.7 x air-yards share.',
  adot: 'Average depth of target: air yards per target.',
  ypt: 'Receiving yards per target.',
  catch_rate: 'Receptions divided by targets FTN charted as catchable.',
  rush_share: 'Carries divided by team run plays (QB runs included).',
  rz_tgt_share: 'Targets inside the opponent\'s 20 divided by team pass attempts from there.',
  i10_tgt_share: 'Targets inside the opponent\'s 10 divided by team pass attempts from there.',
  rz_car_share: 'Carries inside the opponent\'s 20 divided by team runs from there.',
  i10_car_share: 'Carries inside the opponent\'s 10 divided by team runs from there.',
  ez_tgt: 'Targets whose catch spot is at or past the goal line.',
  td_gap: 'Touchdowns scored minus expected touchdowns from a yardline model (positive = scoring above expectation).',
  tgt_per_snap: 'Targets per offensive snap. A proxy for targets per route run, which is not published for this season.',
  ypc_stk: 'Yards per carry into a stacked box (8 or more defenders).',
  ypc_lgt: 'Yards per carry into a light box (6 or fewer defenders).',
  ypt_bl: 'Yards per target when the defense blitzed (at least one blitzer).',
  pa_share: 'Share of his charted targets that came on play action.',
  scr_share: 'Share of his charted targets that were screens.',
  cont_rate: 'Contested targets that were caught.',
  drop_rate: 'Drops divided by targets FTN charted as catchable.',
  yprr: 'Yards per route run, using the route estimate in routesDefinition.',
  tprr: 'Targets per route run, using the route estimate in routesDefinition.',
};
