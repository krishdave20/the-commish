/* Model types for the fantasy engine.
   Everything here is plain, serializable data (no Sets, Maps or class instances), so a Model can be
   cached, posted to a worker, or snapshotted in tests. Per-week values are `Record<week, value>`. */
import type { NflState, SleeperLeague, SleeperRoster, LeagueUser } from '../data/contract.ts';
import type { Matchup, ProjectionRow, ScheduleGame, TrendingRow, WeekStats } from '../data/types.ts';
import type { PullPlan } from '../data/plan.ts';
import type { PlayoffRules } from './bracket/types.ts';

/** Sleeper position codes the engine models. */
export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | 'DL' | 'LB' | 'DB';

/** Starting-slot codes (roster_positions entries that are not BN / IR / TAXI). */
export type Slot =
  | Pos
  | 'FLEX' | 'SUPER_FLEX' | 'REC_FLEX' | 'WRRB_FLEX' | 'IDP_FLEX';

/** week -> value */
export type ByWeek<T> = Record<number, T>;

/* ---------- raw pull (output of load.ts) ---------- */

/** Everything the reference's load() fetched, untouched. `buildModel` turns it into a Model. */
export interface LeaguePull {
  leagueId: string;
  userId: string;
  state: NflState;
  league: SleeperLeague;
  /** week ranges used for this pull (calibration, projection, matchup and stats weeks) */
  plan: PullPlan;
  rosters: SleeperRoster[];
  users: LeagueUser[];
  schedule: ScheduleGame[];
  /** trending adds, 72 h lookback (empty when the endpoint failed) */
  trending: TrendingRow[];
  matchups: ByWeek<Matchup[]>;
  stats: ByWeek<WeekStats>;
  /** raw projection rows per week (calibration weeks and cur..last playoff week) */
  projections: ByWeek<ProjectionRow[]>;
  /** epoch ms of the OLDEST piece in this pull */
  asOf: number;
  /** true when any piece fell back to a stale cache copy */
  stale: boolean;
  /** messages from pieces that fell back to the cache */
  errors: string[];
}

/* ---------- model ---------- */

export interface ModelPlayer {
  pid: string;
  name: string;
  pos: Pos;
  /** NFL team code, null when unknown */
  nfl: string | null;
  /** roster id that owns him; 0 = free agent */
  ownerRid: number;
  onIr: boolean;
  /** Sleeper injury status ('' when healthy) */
  injury: string;
  body: string;
  /** average over weeks 1..cur-1 he played, null when none */
  seasonAvg: number | null;
  /** trending adds over the last 72 h */
  adds72h: number;
  /** his game this week already kicked off (mu[cur] is then his actual points) */
  playedThisWeek: boolean;
  /** actual points by week 1..cur (null = did not play) */
  pts: ByWeek<number | null>;
  /** expected points by week cur..maxWeek */
  mu: ByWeek<number>;
  /** floor (calibrated 20th percentile) by week */
  lo: ByWeek<number>;
  /** ceiling (calibrated 80th percentile) by week */
  hi: ByWeek<number>;
  /** NFL opponent by week, 'BYE' when none */
  opp: ByWeek<string>;
  /** matchup grade by week (points allowed vs league average, ≥1.15 soft, ≤0.87 tough), null when unknown */
  dvp: ByWeek<number | null>;
}

export interface ModelTeam {
  rid: number;
  /** team name (falls back to "Team <display name>") */
  team: string;
  manager: string;
  /** Sleeper user id of the owner, null when unowned */
  ownerId: string | null;
  division: string;
  /** division id; equals rid when the league has no divisions (each team is its own "division") */
  divId: number;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  faabLeft: number;
  /** this is the signed-in user's team (falls back to the first team when the user has none) */
  isMe: boolean;
  /** starters for the current week (Sleeper ids, '0' = empty slot) */
  starters: string[];
  livePts: number;
  /** expected lineup points by week cur..maxWeek (current week = sum of actual starters) */
  exp: ByWeek<number>;
  /* initial simulation results (20,000 runs, default seed) */
  playoffPct: number;
  divWinPct: number;
  expWins: number;
  winsP10: number;
  winsP90: number;
  /** chance of finishing at each seed 1..playoffTeams */
  seedPct: number[];
  /* playoff results from the same simulation (optional: models built before the bracket work, and hand-built ones, have none) */
  /** chance of winning the championship */
  titlePct?: number;
  /** chance of reaching the championship game */
  finalsPct?: number;
  /** expected finish (1 = champion) when the team makes the playoffs */
  expFinish?: number;
  /** chance of being crowned toilet bowl champion (the worst team of the non-playoff field) */
  flushPct?: number;
  /** chance of winning the consolation bracket (the best team of the non-playoff field) */
  consolationPct?: number;
  /** chance of being in the non-playoff field */
  inToiletBowlPct?: number;
  status: 'Alive';
}

export interface ModelGame {
  /** stable id, e.g. "w7-3-9" */
  id: string;
  week: number;
  teamA: number;
  teamB: number;
}

export interface HistoryRow {
  key: string;
  week: number;
  rid: number;
  opp: number;
  pts: number;
  oppPts: number;
  /** week is finished */
  final: boolean;
}

export interface TradeIdea {
  idea: number;
  givePid: string;
  give: string;
  getPid: string;
  get: string;
  partnerRid: number;
  partner: string;
  myGain: number;
  theirGain: number;
  startsForMe: number;
}

export interface ModelMeta {
  method: 'projection';
  leagueId: string;
  leagueName: string;
  season: string;
  /** display name of the signed-in user (from the league's users) */
  username: string;
  userId: string;
  /** mean absolute error of Sleeper's projection on calibration weeks (players projected > 0.5) */
  maeProjection: number | null;
  /** share of last-week outcomes inside the 20-80 band fitted on earlier weeks (target 0.6) */
  bandCoverage: number | null;
  /** the team weekly score SD every probability uses: the raw spread times `sdCalibration` (see calibration.ts) */
  teamWeeklySd: number;
  /** the spread measured from this league's projection misses, before calibration (absent on hand-built models) */
  teamWeeklySdRaw?: number;
  /** the factor applied to get `teamWeeklySd` (SD_CALIBRATION, or 1 in a reference-compatible build; absent on hand-built models) */
  sdCalibration?: number;
  /** the late-season blend of projection and season average: from which week it applies and whether it is on for this model's week */
  projectionBlend?: { startWeek: number; active: boolean };
  simRuns: number;
  currentWeek: number;
  lastRegularWeek: number;
  maxWeek: number;
  playoffWeeks: number[];
  /** the league's playoff settings (week start, round type, seeding type); absent on hand-built models, which assume one week per round */
  playoff?: PlayoffRules;
  playoffTeams: number;
  divisions: number;
  waiverBudget: number;
  slots: Slot[];
  /** league `rec` setting as a label, e.g. "1 per catch" */
  scoring: string;
  calibrationWeeks: number[];
  /** floor/ceiling ratios (actual ÷ projected) per position: [20th pct, 80th pct] */
  floorCeil: Record<string, [number, number]>;
  /** how many samples fed each position's ratio fit (below 25 → fallback constants) */
  ratioSamples: Record<string, number>;
  /** residual SD (actual − projected) per position */
  residualSd: Record<string, number>;
  /** positions the league projects (IDP only when the league starts IDP slots) */
  positions: Pos[];
  /** epoch ms of the oldest piece of source data */
  asOf: number;
  stale: boolean;
}

export interface Model {
  meta: ModelMeta;
  /** roster id of the signed-in user's team */
  meRid: number;
  teams: ModelTeam[];
  /** rostered players plus the capped free-agent pool */
  players: ModelPlayer[];
  /** remaining regular-season games, week cur..last */
  games: ModelGame[];
  /** finished and in-progress matchups from week 1..cur, two rows per game */
  history: HistoryRow[];
  /** win-win 1-for-1 ideas for the signed-in team, top 8 */
  ideas: TradeIdea[];
  /** the teams' odds fields (playoffPct, divWinPct, expWins, winsP10/P90, seedPct) have not been filled yet: built with
      `simulate: false`; call applyBaseSim. */
  oddsPending: boolean;
}
