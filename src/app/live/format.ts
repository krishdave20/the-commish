/* Small text helpers for game day: kickoff times and game lines. All lowercase, like the rest of the app. */
import type { NflGame } from '../../engine/live';
import { gameStatusText } from '../../engine/live';

/** "sun 12:00 pm" in the viewer's time zone. */
export function formatKickoff(ms: number): string {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(ms);
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(ms);
  return `${day} ${time}`.replace(/[  ]/g, ' ').toLowerCase();
}

/** "12:00 pm" only. */
export function formatClockTime(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(ms).replace(/[  ]/g, ' ').toLowerCase();
}

export const sameLocalDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** "cin 21 · pit 17 · q3 4:12", "final", or "sun 1:00 pm". */
export function nflLine(g: NflGame): string {
  const status = g.state === 'pre' ? (g.kickoff !== null ? formatKickoff(g.kickoff) : 'upcoming') : gameStatusText(g);
  if (g.state === 'pre' || g.awayScore === null || g.homeScore === null) return `${g.away} at ${g.home} · ${status}`;
  return `${g.away} ${g.awayScore} · ${g.home} ${g.homeScore} · ${status}`.toLowerCase();
}

/** How a team's match reads in words: "ahead by 4.2", "behind by 11", "tied". */
export function leadText(margin: number): string {
  const m = Math.abs(margin);
  return m < 0.005 ? 'tied' : `${margin > 0 ? 'ahead' : 'behind'} by ${m.toFixed(1)}`;
}
