/* What the live activity says for a moment: the pill's line, the lines of the expanded card and the urgency colour. */
import { clockWords, formatClock } from '../../engine/moments';
import type { Moment } from '../../engine/moments';

/** "waivers in 3h 12m", "kickoff in 1:42:10", "icemen 95.0 · 58.8 · 80%", or the title. */
export function pillText(m: Moment, now: number): string {
  if (m.pill) return m.pill.text;
  if (m.countdownTo !== undefined) {
    const left = m.countdownTo - now;
    const when = left <= 0 ? 'now' : `in ${clockWords(left, !!m.precise)}`;
    return m.label ? `${m.label} ${when}` : `${m.title} ${when}`;
  }
  return m.title;
}

/** 'urgent' under five minutes, 'soon' under half an hour, else 'calm'. */
export function urgency(m: Moment, now: number): 'urgent' | 'soon' | 'calm' {
  if (m.countdownTo === undefined) return 'calm';
  const left = m.countdownTo - now;
  return left <= 5 * 60_000 ? 'urgent' : left <= 30 * 60_000 ? 'soon' : 'calm';
}

/** The big line of the expanded card for a countdown: "1:42:10 to kickoff, 7:15 pm". */
export function countdownLine(m: Moment, now: number, tz: string): string | null {
  if (m.countdownTo === undefined) return null;
  const left = m.countdownTo - now;
  return left <= 0 ? `${m.label ?? 'it'} is now` : `${clockWords(left, !!m.precise)} to ${m.label ?? 'go'} · ${formatClock(m.countdownTo, tz)}`;
}
