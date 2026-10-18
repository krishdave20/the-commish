/* Where the NFL week stands, and when to poll.

   Polling is only worth it while games are on (or about to start): every 30 s then; before that the poller sleeps until five
   minutes before the next kickoff (never longer than 30 minutes at a time, so a laptop that slept catches up); once every game
   is final it stops. A game that kicked off over 5 hours ago and is still not marked final counts as final (a feed that lags
   must not keep the poller running all night). */
import type { NflGame } from './types.ts';

export const LIVE_INTERVAL_MS = 30_000;
export const LEAD_MS = 5 * 60_000;
export const MAX_SLEEP_MS = 30 * 60_000;
export const STALE_AFTER_MS = 5 * 3_600_000;
/** the longest the poller sleeps once every game is final (it then looks at the NFL calendar again) */
export const MAX_REST_MS = 3 * 3_600_000;

export type WeekPhase = 'unknown' | 'pre' | 'live' | 'between' | 'final';

function effectiveState(g: NflGame, now: number): NflGame['state'] {
  return g.state !== 'final' && g.kickoff !== null && now - g.kickoff > STALE_AFTER_MS ? 'final' : g.state;
}

/** live: a game is on; pre: nothing has started; between: some final and some still to come; final: every game is over. */
export function weekPhase(games: readonly NflGame[], now: number): WeekPhase {
  if (games.length === 0) return 'unknown';
  const states = games.map((g) => effectiveState(g, now));
  if (states.includes('live')) return 'live';
  if (states.every((s) => s === 'final')) return 'final';
  if (states.every((s) => s === 'pre')) return 'pre';
  return 'between';
}

/** The next game that has not kicked off, soonest first. */
export function nextKickoff(games: readonly NflGame[], now: number): NflGame | null {
  const pending = games.filter((g) => effectiveState(g, now) === 'pre' && g.kickoff !== null && g.kickoff > now - 60_000);
  pending.sort((a, b) => a.kickoff! - b.kickoff!);
  return pending[0] ?? null;
}

export interface PollPlan {
  /** poll: keep fetching on the live interval; wait: sleep, then check again; stop: nothing is left to watch */
  mode: 'poll' | 'wait' | 'stop';
  delay: number;
}

export function pollPlan(games: readonly NflGame[], now: number, base = LIVE_INTERVAL_MS): PollPlan {
  if (games.length === 0) return { mode: 'wait', delay: MAX_SLEEP_MS };
  const open = games.filter((g) => effectiveState(g, now) !== 'final');
  if (open.length === 0) return { mode: 'stop', delay: 0 };
  const soon = open.some((g) => effectiveState(g, now) === 'live' || (g.kickoff !== null && g.kickoff - now <= LEAD_MS));
  if (soon) return { mode: 'poll', delay: base };
  const next = nextKickoff(games, now);
  // games with no kickoff time (the plain schedule): look again in 10 minutes
  if (!next) return { mode: 'wait', delay: 10 * 60_000 };
  return { mode: 'wait', delay: Math.max(60_000, Math.min(MAX_SLEEP_MS, next.kickoff! - LEAD_MS - now)) };
}

/** The sleep after the last game of the week: until five minutes before the next kickoff (next week's first game), at least a minute and
    at most MAX_REST_MS. With no known kickoff it sleeps the maximum. Each wake-up re-reads the NFL calendar, so a tab left open from
    Sunday night to Thursday rolls over to the new week by itself. */
export function restDelay(nextKickoff: number | null, now: number): number {
  if (nextKickoff === null) return MAX_REST_MS;
  return Math.max(60_000, Math.min(MAX_REST_MS, nextKickoff - LEAD_MS - now));
}
