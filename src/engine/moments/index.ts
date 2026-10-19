/* Time-aware moments: rules over real data and the clock. `moments(ctx)` is pure and returns what matters right now, best first.
   See types.ts for the contract and docs/WEB_APP_NOTES.md ("Moments") for the rules. */
import { drafting, draftGrade, offseason, preDraft, topTake } from './rules/draft.ts';
import { finalWhistle, liveMatchup, mondayNight } from './rules/live.ts';
import { clinchScenario, playoffs, toiletBowl, tradeDeadline, weekRecap } from './rules/season.ts';
import { finalCheck, gameDay, injuryReport, lineupOk, lineupSwap, waiversCleared, waiversTonight } from './rules/week.ts';
import { buildScope } from './scope.ts';
import type { Scope } from './scope.ts';
import type { Moment, MomentCtx, MomentPage } from './types.ts';

export * from './types.ts';
export * from './time.ts';
export * from './waivers.ts';
export { hero } from './hero.ts';
export * from './snapshot.ts';
export * from './adapt.ts';
export { draftGradeFromPicks } from './grade.ts';
export * from './activity.ts';
export type { Hero } from './hero.ts';

type Rule = (s: Scope) => Moment[];

/** Every rule, in no particular order: the priorities sort them. */
export const RULES: readonly Rule[] = [
  preDraft, drafting, draftGrade,
  waiversTonight, waiversCleared, gameDay, lineupSwap, injuryReport, lineupOk, finalCheck,
  liveMatchup, mondayNight, finalWhistle, weekRecap,
  tradeDeadline, clinchScenario, toiletBowl, playoffs,
  offseason, topTake,
];

/** A moment is current from `startsAt` (inclusive) until `endsAt` (exclusive). */
export function isCurrent(m: Moment, now: number): boolean {
  return (m.startsAt === undefined || now >= m.startsAt) && (m.endsAt === undefined || now < m.endsAt);
}

export const byPriority = (a: Moment, b: Moment): number => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** What matters right now: every rule's moments that have started and not yet expired, highest priority first. A rule that throws is skipped. */
export function moments(ctx: MomentCtx): Moment[] {
  const scope = buildScope(ctx);
  const out: Moment[] = [];
  for (const rule of RULES) {
    let made: Moment[] = [];
    try { made = rule(scope); } catch { /* a rule with odd data must not take the others down */ }
    for (const m of made) if (isCurrent(m, scope.now)) out.push(m);
  }
  return out.sort(byPriority);
}

/** The default lead time of a countdown in the live activity. */
export const ACTIVITY_LEAD = 12 * 3_600_000;

/** Moments the live activity may show now: something live, a recap to glance at, or a countdown that is close enough. Best first. */
export function ongoing(list: readonly Moment[], now: number): Moment[] {
  return list.filter((m) => isCurrent(m, now) && (m.live || m.glance || (m.countdownTo !== undefined && m.countdownTo > now && now >= (m.ongoingFrom ?? m.countdownTo - ACTIVITY_LEAD)))).sort(byPriority);
}

/** The best moment for a page's banner, or null. */
export function momentFor(list: readonly Moment[], page: MomentPage): Moment | null {
  return list.filter((m) => m.pages.includes(page)).sort(byPriority)[0] ?? null;
}
