/* Draft season and the offseason: the countdown, prep nudges, the clock, the grade, dynasty movers and the rookie class. */
import { spanWords, whenWords, HOUR } from '../time.ts';
import type { Moment } from '../types.ts';
import { ordinal } from '../scope.ts';
import type { Scope } from '../scope.ts';

/** Before the draft: "the draft starts in 3d 4h", "run a mock draft at your real slot (9th)", "study rb tier 2", "your queue is empty". */
export function preDraft(s: Scope): Moment[] {
  const d = s.ctx.draft;
  if (s.ctx.phase !== 'pre_draft' || !d || d.status !== 'pre_draft') return [];
  const out: Moment[] = [];
  const prep = s.ctx.prep;
  if (d.startTime !== null && d.startTime > s.now) {
    const left = d.startTime - s.now;
    out.push({
      id: 'draft-countdown', kind: 'draft-countdown', priority: left <= 24 * HOUR ? 85 : 70,
      title: `the draft starts in ${spanWords(left)}`,
      detail: `${whenWords(s.now, d.startTime, s.tz)} · ${d.mySlot !== null ? `you pick ${ordinal(d.mySlot)} of ${d.teams}` : 'the draft order is not set yet'}`,
      action: { label: 'open the draft room', to: '/draft' },
      countdownTo: d.startTime, ongoingFrom: d.startTime - 72 * HOUR, label: 'draft', pages: ['draft', 'home'],
    });
  }
  if (prep && !prep.mock) {
    out.push({
      id: 'draft-mock', kind: 'draft-mock', priority: 56,
      title: d.mySlot !== null ? `run a mock draft at your real slot (${ordinal(d.mySlot)})` : 'run a mock draft',
      detail: d.mySlot !== null ? `a quick auto-draft from pick ${d.mySlot} of ${d.teams} shows your likely team and grade` : 'your slot is not set yet, so the mock assumes one',
      action: { label: 'run a mock', to: '/draft?tab=mock' }, pages: ['draft', 'home'],
    });
  }
  if (prep && !prep.tiers && d.tierPos) {
    out.push({
      id: 'draft-tiers', kind: 'draft-tiers', priority: 48,
      title: `study ${d.tierPos} tier 2`, detail: `${d.tierPos} tier 1 and 2 are where the value gaps are`,
      action: { label: 'see the rankings', to: '/draft?tab=rankings' }, pages: ['draft', 'home'],
    });
  }
  if (prep && !prep.queue) {
    out.push({
      id: 'draft-queue', kind: 'draft-queue', priority: 44,
      title: 'your queue is empty', detail: 'line up the players you want before the clock starts',
      action: { label: 'open the draft room', to: '/draft' }, pages: ['draft', 'home'],
    });
  }
  return out;
}

/** Draft day: "you're on the clock in 4 picks", then "you're on the clock". */
export function drafting(s: Scope): Moment[] {
  const d = s.ctx.draft;
  if (s.ctx.phase !== 'drafting' || !d || (d.status !== 'drafting' && d.status !== 'paused')) return [];
  const paused = d.status === 'paused';
  const to = '/draft?tab=clock';
  if (d.picksUntilMine === 0) {
    return [{
      id: 'draft-clock', kind: 'draft-clock', priority: 99, live: true,
      title: 'you’re on the clock', detail: paused ? 'the draft is paused' : 'your pick is up',
      action: { label: 'make your pick', to }, label: 'on the clock', pill: { text: 'you’re on the clock' }, pages: ['draft', 'home'],
    }];
  }
  if (d.picksUntilMine !== null) {
    const n = d.picksUntilMine;
    return [{
      id: 'draft-clock', kind: 'draft-clock', priority: n <= 3 ? 95 : 80, live: true,
      title: `you’re on the clock in ${n} ${n === 1 ? 'pick' : 'picks'}`, detail: paused ? 'the draft is paused' : 'the draft is live: watch the board and check who is likely to fall',
      action: { label: 'open on the clock', to }, label: 'on the clock', pill: { text: `on the clock in ${n} ${n === 1 ? 'pick' : 'picks'}` }, pages: ['draft', 'home'],
    }];
  }
  return [{
    id: 'draft-clock', kind: 'draft-clock', priority: 60, live: true,
    title: paused ? 'the draft is paused' : 'the draft is live', detail: d.mySlot !== null ? `you pick from slot ${d.mySlot}` : 'follow the board',
    action: { label: 'open on the clock', to }, label: 'draft', pill: { text: paused ? 'the draft is paused' : 'the draft is live' }, pages: ['draft', 'home'],
  }];
}

/** After the draft: "your draft grade: B". */
export function draftGrade(s: Scope): Moment[] {
  const g = s.ctx.draft?.grade;
  if (!g || s.ctx.draft?.status !== 'complete') return [];
  return [{
    id: 'draft-grade', kind: 'draft-grade', priority: 50,
    title: `your draft grade: ${g.letter}`, detail: `your lineup ranks ${ordinal(g.rank)} of ${g.teams}`,
    action: { label: 'see the grade', to: '/draft?tab=mock' }, pages: ['draft', 'home'],
  }];
}

/** The offseason: dynasty value movers on my roster, and the incoming rookie class. */
export function offseason(s: Scope): Moment[] {
  const o = s.ctx.offseason;
  if (s.ctx.phase !== 'offseason' || !o) return [];
  const out: Moment[] = [];
  const movers = o.movers.filter((m) => m.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = movers[0];
  if (top) {
    const sign = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
    out.push({
      id: 'dynasty-movers', kind: 'dynasty-movers', priority: 40,
      title: `dynasty movers: ${top.name} ${sign(top.delta)} in 30 days`,
      detail: movers.slice(1, 3).length ? movers.slice(1, 3).map((m) => `${m.name} ${sign(m.delta)}`).join(' · ') : 'your biggest value move this month',
      action: { label: 'see value movers', to: '/?tab=movers' }, pages: ['home'],
    });
  }
  if (o.rookies.length > 0) {
    const names = o.rookies.slice(0, 3);
    out.push({
      id: 'rookie-prep', kind: 'rookie-prep', priority: 36,
      title: `rookie draft prep: ${names[0]!.name} leads the class`,
      detail: `the top ${names.length}: ${names.map((r) => `${r.name} (${r.pos.toLowerCase()})`).join(', ')}`,
      action: { label: 'see the rankings', to: '/draft?tab=rankings' }, pages: ['draft', 'home'],
    });
  }
  return out;
}

/** The best hot take on one of my players, as a quiet extra for the plan. */
export function topTake(s: Scope): Moment[] {
  const t = s.ctx.takes[0];
  if (!s.inSeason || !t) return [];
  return [{
    id: 'take', kind: 'take', priority: 34,
    title: t.headline, detail: t.statLine,
    action: { label: 'see hot takes', to: '/takes' }, pages: ['home'],
  }];
}
