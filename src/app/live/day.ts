/* What kind of day it is, for the game day page: one rule, from the games and the clock. */
import type { NflGame, WeekPhase } from '../../engine/live';
import { sameLocalDay } from './format';

/** live: a game is on. pre: nothing has kicked off but a game is today. between: some games are over and more are coming this week.
    final: every game of the week is over. off: no game today and none has started this week (show last week's finals). */
export type DayMode = 'live' | 'pre' | 'between' | 'final' | 'off';

export function dayMode(phase: WeekPhase, games: readonly NflGame[], now: number): DayMode {
  if (phase === 'live') return 'live';
  if (phase === 'final') return 'final';
  if (phase === 'between') return 'between';
  const today = games.some((g) => g.kickoff !== null && sameLocalDay(g.kickoff, now));
  // phase unknown (no games in the feed) or pre with nothing today
  return phase === 'pre' && today ? 'pre' : 'off';
}
