/* Live projection of one player, and of a team's remaining share of the week.

   - the game is final        -> his actual points
   - the game has not started -> his projected points for the whole game (`mu`, from the model's projection)
   - the game is in progress  -> actual + mu × the share of the game still to play
   The share comes from the game clock: remaining = 1 - elapsed, where elapsed = (minutes played) / 60.
   When the feed has no readable clock the share is assumed to be half (ASSUMED_REMAINING) and `assumed` is true. */
import type { NflGame } from './types.ts';

export const ASSUMED_REMAINING = 0.5;

export type PlayerState = 'pre' | 'live' | 'final' | 'idle';

export interface PlayerLive {
  /** pre: game not started; live: in progress; final: game over; idle: no game this week (bye) */
  state: PlayerState;
  actual: number;
  mu: number;
  projection: number;
  /** share of his game still to play: 1 pre, 0 final or idle */
  remaining: number;
  /** the clock was unreadable, so half the game is assumed left */
  assumed: boolean;
}

export function playerLive(actual: number, mu: number, game: NflGame | null | undefined): PlayerLive {
  if (!game) return { state: 'idle', actual, mu, projection: actual, remaining: 0, assumed: false };
  if (game.state === 'final') return { state: 'final', actual, mu, projection: actual, remaining: 0, assumed: false };
  if (game.state === 'pre') return { state: 'pre', actual, mu, projection: actual + mu, remaining: 1, assumed: false };
  const assumed = game.elapsed === null;
  const remaining = assumed ? ASSUMED_REMAINING : Math.max(0, Math.min(1, 1 - game.elapsed!));
  return { state: 'live', actual, mu, projection: actual + mu * remaining, remaining, assumed };
}
