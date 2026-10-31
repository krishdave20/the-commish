/* The top live activity as the iPhone app's Live Activity reads it (ios/Shared/CommishActivity.swift decodes this exact shape).
   Pure: an `Activity` (src/engine/moments/activity.ts) plus the live view in, plain JSON out. The lock screen and the Dynamic Island show what the
   web pill shows, in the same words (compactText, activityTitle, actionLabel); countdowns carry their end time so iOS ticks them itself.
   Kept small: ActivityKit caps a content state at 4 KB. */
import { activityTitle, compactText, pts1, shortName, urgency } from '../../engine/moments';
import type { Activity, ActivityKind } from '../../engine/moments';
import type { LiveView } from '../../engine/live';
import { actionLabel, actionTo } from '../../components/live-activity/labels';

export interface NativeSide { name: string; score: number; projected: number }

/** What the app needs to refresh the score in the background from Sleeper's matchups endpoint, and to redo the win chance with it. */
export interface NativeRefresh {
  leagueId: string;
  week: number;
  rid: number;
  oppRid: number;
  /** the league's weekly team score SD (the win chance's model, src/engine/live/winprob.ts) */
  sd: number;
  /** each side's share of starter-minutes left, 0 to 1 */
  remMe: number;
  remOpp: number;
}

export interface NativeMatchup {
  week: number;
  me: NativeSide;
  opp: NativeSide;
  winP: number;
  progress: number;
  final: boolean;
  /** "chase · on offense · 2nd & 7 at pit 34 · q3 8:12", up to three */
  nowPlaying: string[];
  /** "+6.4 · chase" */
  lastPlay: string | null;
  refresh: NativeRefresh | null;
}

export interface NativeActivity {
  kind: ActivityKind;
  /** "live matchup", "kickoff": the card's header */
  title: string;
  /** the pill's line: "icemen 95.0 · 58.8 · 80%" */
  compact: string;
  urgency: 'urgent' | 'soon' | 'calm';
  live: boolean;
  /** the in-app path a tap opens ("/gameday") and its label */
  to: string;
  action: string;
  /** a countdown's label and end (epoch ms): iOS draws it with a self-updating timer */
  countdown: { label: string; at: number } | null;
  matchup: NativeMatchup | null;
  /** the big line of a non-matchup card: "W 112.3–98.0", "pick in 4" */
  headline: string;
  /** up to three detail lines under it */
  lines: string[];
  updatedAt: number;
}

const MAX_LINES = 3;

function detailLines(a: Activity): string[] {
  switch (a.kind) {
    case 'kickoff': {
      const d = a.data;
      if (!d) return [a.moment.detail];
      const out: string[] = [];
      if (d.game) out.push(`first up: ${d.game}`);
      if (d.startersTotal) out.push(`${d.playing.length} of ${d.startersTotal} starters in the first window`);
      for (const f of d.flags) out.push(`${f.name.toLowerCase()}: ${f.status}`);
      return out;
    }
    case 'waivers': {
      const d = a.data;
      const out = d.adds.map((w) => `${w.name.toLowerCase()} · +${pts1(w.gain)} pts${d.faab ? ` · bid $${w.bid}` : ''}`);
      if (d.faab && d.faabLeft !== null) out.push(`$${d.faabLeft} faab left`);
      return out.length ? out : [a.moment.detail];
    }
    case 'draft': {
      const info = a.data.info;
      if (!info) return [a.moment.detail];
      const out = info.best.map((p) => `${p.name.toLowerCase()} · ${p.pos.toLowerCase()} · tier ${p.tier}`);
      if (info.needs.length) out.push(`needs ${info.needs.join(', ')}`);
      return out;
    }
    case 'recap': {
      const d = a.data;
      if (!d) return [a.moment.detail];
      const out = [`vs ${d.oppName.toLowerCase()}`];
      if (d.top) out.push(`top scorer: ${shortName(d.top.name)} ${pts1(d.top.pts)}`);
      if (d.odds) out.push(`playoff odds ${Math.round(d.odds.from)}% → ${Math.round(d.odds.to)}%`);
      return out;
    }
    default: return a.moment.detail ? [a.moment.detail] : [];
  }
}

function headline(a: Activity, now: number): string {
  if (a.kind === 'recap' && a.data) return `${a.data.verdict} ${pts1(a.data.mine)}–${pts1(a.data.theirs)}`;
  if (a.kind === 'generic') return a.moment.title;
  return compactText(a, now);
}

function matchupOf(a: Activity, view: LiveView | null, leagueId: string | null, sd: number | null): NativeMatchup | null {
  if (a.kind !== 'matchup' || !a.data) return null;
  const d = a.data;
  const m = view?.mine;
  const meFirst = m ? m.a.isMe || !m.b.isMe : true;
  const me = m ? (meFirst ? m.a : m.b) : null, opp = m ? (meFirst ? m.b : m.a) : null;
  return {
    week: d.week,
    me: { name: d.me.name, score: d.me.score, projected: d.me.projected },
    opp: { name: d.opp.name, score: d.opp.score, projected: d.opp.projected },
    winP: d.winP,
    progress: d.progress,
    final: d.final,
    nowPlaying: d.nowPlaying.map((p) => p.line),
    lastPlay: d.lastPlay ? `+${pts1(d.lastPlay.delta)} · ${shortName(d.lastPlay.name)}` : null,
    refresh: me && opp && leagueId && sd !== null
      ? { leagueId, week: d.week, rid: me.rid, oppRid: opp.rid, sd, remMe: me.remaining, remOpp: opp.remaining }
      : null,
  };
}

export interface PayloadInputs { view: LiveView | null; leagueId: string | null; sd: number | null }

/** The Live Activity for the top activity (what the web pill shows by default). */
export function nativeActivity(a: Activity, now: number, inputs: PayloadInputs): NativeActivity {
  const m = a.moment;
  return {
    kind: a.kind,
    title: activityTitle(a),
    compact: compactText(a, now),
    urgency: urgency(m, now),
    live: !!m.live,
    to: actionTo(a),
    action: actionLabel(a),
    countdown: m.countdownTo !== undefined && m.countdownTo > now ? { label: m.label ?? a.kind, at: m.countdownTo } : null,
    matchup: matchupOf(a, inputs.view, inputs.leagueId, inputs.sd),
    headline: headline(a, now),
    lines: detailLines(a).filter(Boolean).slice(0, MAX_LINES),
    updatedAt: now,
  };
}

/** Whether two payloads would look the same on the lock screen: `updatedAt` aside, and a countdown's own text aside (iOS ticks it). Saves
    the app an update every second while a precise countdown runs. */
export function samePayload(a: NativeActivity | null, b: NativeActivity | null): boolean {
  if (a === null || b === null) return a === b;
  const strip = (p: NativeActivity) => JSON.stringify({ ...p, updatedAt: 0, compact: p.countdown ? '' : p.compact, headline: p.countdown ? '' : p.headline });
  return strip(a) === strip(b);
}
