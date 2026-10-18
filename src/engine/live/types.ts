/* Types for game day: one poll of the league's matchups plus the NFL games, and what is derived from it.
   Everything is plain data, so a snapshot can be diffed, replayed and kept in memory for the session. */
import type { Slot } from '../types.ts';

export type GameState = 'pre' | 'live' | 'final';

/** One NFL game this week. */
export interface NflGame {
  id: string;
  home: string;
  away: string;
  /** kickoff, epoch ms; null when the source has no time (the plain schedule only has a date) */
  kickoff: number | null;
  state: GameState;
  /** "", "1" to "4", "OT", "H" (half), "F" or "F/OT" */
  quarter: string;
  /** game clock of the quarter ("7:21"), "" when unknown */
  clock: string;
  homeScore: number | null;
  awayScore: number | null;
  /** share of regulation played, 0 to 1: 0 before kickoff, 1 when final, null when a live game's clock is unknown */
  elapsed: number | null;
}

/** One team's row of Sleeper's matchups endpoint, as the game day code reads it. */
export interface LiveRow {
  rid: number;
  matchupId: number | null;
  points: number;
  /** starters in slot order ('0' = empty slot) */
  starters: string[];
  startersPoints: number[];
  /** every rostered player */
  players: string[];
  playersPoints: Record<string, number>;
}

export interface LiveSnapshot {
  week: number;
  /** when the data was fetched (wall clock, epoch ms) */
  at: number;
  /** what the NFL clock reads: the wall clock for live data, the simulated time of day in a replay */
  clock: number;
  kind: 'live' | 'replay';
  rows: LiveRow[];
  games: NflGame[];
  /** false when neither the scores nor the schedule answered: game states are then guessed from the points */
  gamesKnown: boolean;
  /** a replay that has reached the end */
  complete?: boolean;
}

export interface PlayerMeta { pid: string; name: string; pos: string; nfl: string | null }

/** What the pure derivations need to know besides the snapshot. */
export interface LiveCtx {
  week: number;
  meRid: number;
  /** the league's weekly SD of a team score (model.meta.teamWeeklySd) */
  sd: number;
  /** starting slots in lineup order, aligned with each row's `starters` */
  slots: Slot[];
  teams: Record<number, { name: string; manager: string }>;
  /** pre-game expected points of each player for the whole game (projection, injury-adjusted) */
  mu: Record<string, number>;
  players: Record<string, PlayerMeta>;
}
