/* Local alerts: notifications the app raises itself while it is open (a tab in the background, or an installed app on the home screen).
   There is no server and no push: nothing can reach a closed app, by design (SPEC section 1: no backend, free only).

   The moments engine already knows what matters and when (src/engine/moments), so alerts are a thin filter over its list:
     - "waivers in 1 hour"          the waivers-tonight countdown, inside its last hour
     - "kickoff in 30 minutes"      game day's / the final check's kickoff countdown, inside its last half hour
     - "you're on the clock"        the draft clock reaching you (each time it does)
     - "final: W 112–98"            the final whistle of your matchup
     - "big moment: +6.4 · chase"   a poll in which your score jumped by 6 or more (src/engine/moments/activity.ts)
   Rules: each alert fires once (deduped by a key made from the moment's id and its time); at most one alert per ten minutes, except the draft
   clock, which always gets through; and what is already true when the app opens is not news (the owner is looking at it), except a countdown that
   is inside its window. Everything here is pure; notify.ts raises the notification and AlertsRunner.tsx feeds it. */
import { bigMomentText, pts1 } from '../../engine/moments';
import type { BigMoment, Moment } from '../../engine/moments';

export type AlertKind = 'waivers' | 'kickoff' | 'clock' | 'final' | 'big';

export interface AlertCandidate {
  /** the dedupe key: the moment's id plus the instant or text that makes this occurrence different from the last */
  key: string;
  kind: AlertKind;
  title: string;
  body: string;
  /** the page a tap opens, e.g. "/waivers" */
  to: string;
  /** the draft clock: skips the spacing rule */
  urgent: boolean;
  /** happened, rather than is coming: not sent when it was already true on the first look at the page */
  event: boolean;
  /** best first when several are ready at once */
  priority: number;
}

export const ALERT_GAP_MS = 10 * 60_000;
export const WAIVER_LEAD_MS = 60 * 60_000;
export const KICKOFF_LEAD_MS = 30 * 60_000;
/** how long a sent key is remembered */
const KEEP_MS = 7 * 24 * 3600_000;

/** "1 hour", "30 minutes", "1 minute": how long until a countdown ends, in words. */
export function leadWords(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min >= 55) return '1 hour';
  return `${min} ${min === 1 ? 'minute' : 'minutes'}`;
}

const ON_THE_CLOCK = 'you’re on the clock';

/** The alerts the current moments call for, best first. */
export function candidatesFrom(moments: readonly Moment[], now: number): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const m of moments) {
    const left = m.countdownTo === undefined ? null : m.countdownTo - now;
    if (m.id === 'waivers-tonight' && left !== null && left > 0 && left <= WAIVER_LEAD_MS) {
      out.push({ key: `waivers:${m.countdownTo}`, kind: 'waivers', title: `waivers in ${leadWords(left)}`, body: m.detail, to: m.action.to, urgent: false, event: false, priority: 2 });
    } else if ((m.id === 'game-day' || (m.id === 'final-check' && m.label === 'kickoff')) && left !== null && left > 0 && left <= KICKOFF_LEAD_MS) {
      out.push({ key: `kickoff:${m.countdownTo}`, kind: 'kickoff', title: `kickoff in ${leadWords(left)}`, body: m.detail, to: m.action.to, urgent: false, event: false, priority: 3 });
    } else if (m.id === 'draft-clock' && m.title === ON_THE_CLOCK) {
      // one clock moment for the whole draft: `decide` fires on the turn it appears, not on its id
      out.push({ key: 'draft-clock', kind: 'clock', title: ON_THE_CLOCK, body: m.detail, to: m.action.to, urgent: true, event: true, priority: 9 });
    } else if (m.id === 'final-whistle') {
      out.push({ key: `final-whistle:${m.action.to}:${m.title}`, kind: 'final', title: m.pill ? `final: ${m.pill.text}` : m.title, body: m.detail, to: m.action.to, urgent: false, event: true, priority: 5 });
    }
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** A big moment of my team's (from the live feed) as an alert. */
export function bigCandidate(b: BigMoment, name: string): AlertCandidate {
  return {
    key: `big:${b.at}`, kind: 'big', title: `big moment: ${bigMomentText(b, name)}`,
    body: `your score jumped ${pts1(b.delta)} points in one update`, to: '/gameday', urgent: false, event: false, priority: 4,
  };
}

/** What the scheduler remembers between looks (kept in localStorage so a reload does not repeat an alert). */
export interface AlertMemory {
  /** key → when it was sent */
  sent: Record<string, number>;
  /** when the last spaced alert went out */
  lastAt: number;
  /** the draft clock was on me at the last look */
  clockOn: boolean;
}

export const EMPTY_MEMORY: AlertMemory = { sent: {}, lastAt: 0, clockOn: false };

export interface Decision { fire: AlertCandidate | null; memory: AlertMemory }

/** One look at the candidates: which single alert to raise now (if any) and the memory afterwards.
    `first` is the first look since the page opened: events already true are recorded as seen and not sent. */
export function decide(memory: AlertMemory, candidates: readonly AlertCandidate[], now: number, first: boolean): Decision {
  const sent: Record<string, number> = {};
  for (const [k, at] of Object.entries(memory.sent)) if (now - at < KEEP_MS) sent[k] = at;
  let lastAt = memory.lastAt;
  const clockNow = candidates.some((c) => c.kind === 'clock');
  let fire: AlertCandidate | null = null;

  if (first) for (const c of candidates) if (c.event && c.kind !== 'clock' && !(c.key in sent)) sent[c.key] = now;

  const spaced = now - lastAt >= ALERT_GAP_MS;
  for (const c of candidates) {
    if (c.key in sent) continue;
    if (c.kind === 'clock') { if (memory.clockOn || first) continue; } // already on the clock at the last look, or on it when the page opened
    if (!c.urgent && !spaced) continue;
    fire = c;
    break; // one alert per look: the rest wait for the next one (and the spacing rule)
  }

  if (fire && fire.kind !== 'clock') sent[fire.key] = now;
  if (fire && !fire.urgent) lastAt = now;
  return { fire, memory: { sent, lastAt, clockOn: clockNow } };
}
