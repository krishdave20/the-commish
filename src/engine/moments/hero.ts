/* The huddle's sentence: where you stand, in words. "icemen leads killa k im gay 95.0 to 58.8." while the games are on, "icemen faces
   killa k im gay this week. 36% to win." before them, and a draft or offseason equivalent. Plain-language odds go with it:
   "you win 36 of every 100 simulations". Rules over the same context as the moments; nothing here is invented. */
import { spanWords } from './time.ts';
import { ordinal, pts1 } from './scope.ts';
import type { MomentCtx } from './types.ts';

export interface Hero {
  kind: 'live' | 'final' | 'pre' | 'draft' | 'offseason' | 'idle';
  sentence: string;
  /** "you win 36 of every 100 simulations", or null */
  odds: string | null;
}

const per100 = (p: number) => Math.max(0, Math.min(100, Math.round(p * 100)));

export function hero(ctx: MomentCtx): Hero | null {
  const now = ctx.now.getTime();
  const m = ctx.model;
  const live = ctx.live;
  const season = ctx.phase === 'in_season' || ctx.phase === 'postseason';

  if (season && live && live.started) {
    const { mine, theirs } = live;
    const gap = mine.pts - theirs.pts;
    if (live.final) {
      const verb = Math.abs(gap) < 0.005 ? 'tied' : gap > 0 ? 'beat' : 'lost to';
      return { kind: 'final', sentence: `${mine.name} ${verb} ${theirs.name} ${pts1(mine.pts)} to ${pts1(theirs.pts)}.`, odds: null };
    }
    const verb = Math.abs(gap) < 0.005 ? 'is tied with' : gap > 0 ? 'leads' : 'trails';
    return {
      kind: 'live', sentence: `${mine.name} ${verb} ${theirs.name} ${pts1(mine.pts)} to ${pts1(theirs.pts)}.`,
      odds: `you win ${per100(live.winP)} of every 100 simulations from here`,
    };
  }
  if (season && m) {
    // the week is over and the live layer has nothing (a reload on Tuesday): the finished matchup from the model
    const done = m.lastResult && m.lastResult.week === m.week ? m.lastResult : null;
    if (done) {
      const verb = Math.abs(done.mine - done.theirs) < 0.005 ? 'tied' : done.mine > done.theirs ? 'beat' : 'lost to';
      return { kind: 'final', sentence: `${m.teamName} ${verb} ${done.oppName} ${pts1(done.mine)} to ${pts1(done.theirs)}.`, odds: null };
    }
    if (m.matchup) {
      const p = per100(m.matchup.p);
      return {
        kind: 'pre', sentence: `${m.teamName} faces ${m.matchup.oppName} this week. ${p}% to win.`,
        odds: `you win ${p} of every 100 simulations`,
      };
    }
    return { kind: 'idle', sentence: `${m.teamName} has no game this week.`, odds: null };
  }
  const d = ctx.draft;
  if (ctx.phase === 'drafting' && d) {
    if (d.picksUntilMine === 0) return { kind: 'draft', sentence: 'you’re on the clock.', odds: null };
    if (d.picksUntilMine !== null) return { kind: 'draft', sentence: `the draft is live. you’re on the clock in ${d.picksUntilMine} ${d.picksUntilMine === 1 ? 'pick' : 'picks'}.`, odds: null };
    return { kind: 'draft', sentence: 'the draft is live.', odds: null };
  }
  if (ctx.phase === 'pre_draft' && d) {
    const slot = d.mySlot !== null ? ` you pick ${ordinal(d.mySlot)} of ${d.teams}.` : '';
    if (d.startTime !== null && d.startTime > now) return { kind: 'draft', sentence: `the draft starts in ${spanWords(d.startTime - now)}.${slot}`, odds: null };
    return { kind: 'draft', sentence: `the draft has not started.${slot}`, odds: null };
  }
  if (ctx.phase === 'offseason' && ctx.lastSeason) {
    const l = ctx.lastSeason;
    return {
      kind: 'offseason',
      sentence: `${l.teamName} finished ${l.w}–${l.l}${l.t ? `–${l.t}` : ''}, ${ordinal(l.rank)} of ${l.teams}.`,
      odds: null,
    };
  }
  return null;
}
