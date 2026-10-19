/* Types for the weekly power rankings. Plain data, no classes. */

/** The four ingredients of a power score. `ros` exists only for the current week (past weeks have no past projections). */
export interface PowerParts {
  /** points for per game, season to date */
  pfpg: number;
  /** all-play win share, season to date (0..1) */
  allPlay: number;
  /** the last 3 weeks' average points minus the league average of those same weeks (points per game) */
  form: number;
  /** expected points over the remaining regular season (the draft room's ROS strength), as of now. null for a past week. */
  ros: number | null;
}

export interface PowerTeamWeek {
  rid: number;
  team: string;
  isMe: boolean;
  /** 1 = best */
  rank: number;
  /** rank in the previous week's rankings; null in the first week */
  prevRank: number | null;
  /** places gained (prevRank − rank): +3 is up three, −1 is down one, 0 is no change; null in the first week */
  movement: number | null;
  /** 0 to 100 */
  index: number;
  raw: PowerParts;
  /** each part scaled 0..100 across the league (min–max); ros null when absent */
  scaled: { pfpg: number; allPlay: number; form: number; ros: number | null };
  /** rank of each raw part across the league (1 = best) */
  ranks: { pf: number; allPlay: number; form: number; ros: number | null; record: number };
  /** record through this week's results */
  record: { w: number; l: number; t: number };
  allPlayRecord: { w: number; l: number };
  /** wins minus all-play expected wins */
  luck: number;
  games: number;
  /** consecutive most-recent weeks above ('over') or below ('under') the league average; null when the last week was level */
  streak: { dir: 'over' | 'under'; weeks: number } | null;
  /** points in the last completed week, and how far from that week's league average */
  lastPts: number | null;
  lastVsAvg: number | null;
  /** league average points per team in the last completed week */
  leagueAvg: number | null;
  /** what the line is mostly about (see lines.ts) */
  driver: string;
  /** one rule-based line, lowercase, 20 words or fewer */
  line: string;
}

export interface PowerWeek {
  /** "week N power rankings": the rankings as they stand going into week N, from results through week N − 1 */
  week: number;
  /** the last week of results that counts */
  through: number;
  /** the roster-strength part is in this week's index (the current week only) */
  hasRos: boolean;
  /** best first */
  teams: PowerTeamWeek[];
  /** biggest move up and down this week; null when nobody moved that way (or in the first week) */
  riser: PowerTeamWeek | null;
  faller: PowerTeamWeek | null;
}

export interface PowerRankings {
  /** oldest first; empty before week 2 */
  weeks: PowerWeek[];
  /** the week the model is in; the last entry is this week when the season is live */
  currentWeek: number;
}

export interface BumpSeries {
  rid: number;
  team: string;
  isMe: boolean;
  points: Array<{ week: number; rank: number }>;
}
export interface BumpData {
  weeks: number[];
  /** number of teams (the deepest rank) */
  teams: number;
  /** ordered by the latest rank, best first */
  series: BumpSeries[];
}
