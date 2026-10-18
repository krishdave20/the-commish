/* Small text helpers shared by the two matchup tables. Lowercase, like the rest of the app. */
import { formatKickoff } from '../../../app/live/format';
import type { HingeStarter } from '../../../engine/hinges';

/** "vs pit", "@ pit" (his team is the visitor), "bye" when there is no game. */
export function opponentText(p: Pick<HingeStarter, 'opp' | 'home' | 'state'>): string {
  if (!p.opp) return p.state === 'idle' ? 'bye' : '—';
  return `${p.home === false ? '@' : 'vs'} ${p.opp.toLowerCase()}`;
}

/** Where his game stands: "final", "q3 4:12", "sun 1:00 pm", "no game". */
export function statusText(p: Pick<HingeStarter, 'state' | 'statusText' | 'kickoff'>): string {
  if (p.state === 'idle') return 'no game';
  if (p.state === 'final') return p.statusText && p.statusText !== 'final' ? p.statusText : 'final';
  if (p.state === 'live') return p.statusText || 'live';
  return p.kickoff ? formatKickoff(p.kickoff) : 'upcoming';
}
