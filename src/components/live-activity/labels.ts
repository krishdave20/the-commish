/* The small words of the live activity: how long ago, the big countdown line, and each activity's one action. */
import { clockWords, timeLeft, whenWords } from '../../engine/moments';
import type { Activity } from '../../engine/moments';

/** "2 min ago", "just now"; empty when the time is in the future or too old to mean anything (a preview clock, a stale feed). */
export function agoText(now: number, at: number): string {
  const d = now - at;
  if (d < -5000 || d > 6 * 3_600_000) return '';
  if (d < 45_000) return 'just now';
  const min = Math.round(d / 60_000);
  return min < 60 ? `${min} min ago` : `${Math.round(min / 60)} h ago`;
}

/** The big line of a countdown: "1:42:10" and what it is to. */
export function bigParts(a: Activity, now: number, tz: string): { clock: string; cap: string } | null {
  const m = a.moment;
  const left = timeLeft(m, now);
  if (left === null || m.countdownTo === undefined) return null;
  const label = m.label ?? 'go';
  return left <= 0 ? { clock: 'now', cap: label } : { clock: clockWords(left, !!m.precise), cap: `to ${label} · ${whenWords(now, m.countdownTo, tz)}` };
}

/** The one action of each activity. */
export function actionLabel(a: Activity): string {
  switch (a.kind) {
    case 'matchup': return 'open game day';
    case 'kickoff': return 'check lineup';
    case 'waivers': return 'open waiver wire';
    case 'draft': return a.data.mode === 'countdown' ? 'open the draft room' : 'open on the clock';
    case 'recap': return 'see the week';
    default: return a.moment.action.label;
  }
}

/** Where the action goes: the moment's own link, except the recap, which opens the week it is about. */
export function actionTo(a: Activity): string {
  return a.kind === 'recap' && a.data?.week != null ? `/gameday?week=${a.data.week}` : a.moment.action.to;
}
