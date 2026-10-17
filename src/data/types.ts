/* Shapes for Sleeper and FantasyCalc responses that the contract does not cover yet.
   Deliberately loose: only the fields later milestones are known to read, plus an index signature
   so a new field from Sleeper never breaks a type. */

export interface PlayerRecord {
  player_id: string;
  first_name?: string;
  last_name?: string;
  position?: string | null;
  team?: string | null;
  status?: string | null;
  injury_status?: string | null;
  age?: number | null;
  gsis_id?: string | null;
  espn_id?: string | number | null;
  [k: string]: unknown;
}
export type PlayersMap = Record<string, PlayerRecord>;

export type StatLine = Record<string, number>;
/** player_id → that week's stat line */
export type WeekStats = Record<string, StatLine>;

export interface ProjectionRow {
  player_id: string;
  week?: number;
  season?: string;
  team?: string | null;
  opponent?: string | null;
  stats: StatLine;
  player?: { first_name?: string; last_name?: string; position?: string; team?: string | null; injury_status?: string | null; [k: string]: unknown };
  [k: string]: unknown;
}

export interface ScheduleGame {
  week: number;
  home: string;
  away: string;
  game_id?: string;
  date?: string;
  status?: string;
  [k: string]: unknown;
}

export interface TrendingRow { player_id: string; count: number }

export interface Matchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  starters?: string[];
  players?: string[];
  [k: string]: unknown;
}

export interface Transaction {
  transaction_id: string;
  type: string;
  status: string;
  roster_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  [k: string]: unknown;
}

export interface DraftPick {
  round: number;
  pick_no: number;
  player_id: string;
  roster_id: number | null;
  [k: string]: unknown;
}

export interface FantasyCalcRow {
  player: { id?: number; name?: string; sleeperId?: string | null; position?: string; [k: string]: unknown };
  value: number;
  overallRank?: number;
  positionRank?: number;
  [k: string]: unknown;
}

export type SleeperSeasonType = 'regular' | 'post' | 'pre';
export type TrendingType = 'add' | 'drop';

/** One game of Sleeper's `winners_bracket` / `losers_bracket`. `t1`/`t2` are roster ids (null until known), `w`/`l` the
    winner and loser roster ids (null until played). `t1_from`/`t2_from` say which earlier game feeds a slot: `{ w: m }`
    is the winner of match `m`, `{ l: m }` its loser. `p` marks a placement game (`p: 1` is the final of that bracket). */
export interface BracketFrom { w?: number; l?: number }
export interface BracketRow {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
  t1_from?: BracketFrom | null;
  t2_from?: BracketFrom | null;
  p?: number;
  [k: string]: unknown;
}
