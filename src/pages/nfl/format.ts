import { formatKickoff } from '../../app/live/format';
import { gameStatusText } from '../../engine/live';
import { cityOf } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';

/** "q2 7:30", "halftime", "final", "final/ot", or the kickoff in the viewer's own time zone ("sun 1:00 pm"). */
export function statusText(g: NfGame): string {
  if (g.state === 'pre') return g.kickoff !== null ? formatKickoff(g.kickoff) : 'time to be set';
  return gameStatusText(g) || 'live';
}

/** The winner's side of a finished game, or null for a tie or an unfinished game. */
export function winnerOf(g: NfGame): 'home' | 'away' | null {
  if (g.state !== 'final' || g.homeScore === null || g.awayScore === null || g.homeScore === g.awayScore) return null;
  return g.homeScore > g.awayScore ? 'home' : 'away';
}

/** "Chicago at Atlanta" */
export const matchupName = (g: { home: string; away: string }) => `${cityOf(g.away)} at ${cityOf(g.home)}`;

/** One sentence for the screen reader: "Chicago 31, Atlanta 23, final" */
export function gameSentence(g: NfGame): string {
  const s = statusText(g);
  if (g.state === 'pre' || g.homeScore === null || g.awayScore === null) return `${matchupName(g)}, ${s}`;
  return `${cityOf(g.away)} ${g.awayScore}, ${cityOf(g.home)} ${g.homeScore}, ${s}`;
}

export const signedDiff = (n: number) => (n > 0 ? `+${n}` : String(n));
