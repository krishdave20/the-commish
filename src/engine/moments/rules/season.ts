/* The season's arc: Tuesday's recap, the trade deadline, the race for the playoffs, the bracket and the toilet bowl. */
import { spanWords, startOfDay, HOUR } from '../time.ts';
import type { Moment } from '../types.ts';
import { pct, pts1 } from '../scope.ts';
import type { Scope } from '../scope.ts';

/** Tuesday: "week 6 recap: you won 112.3–98.0 · playoff odds 66% → 74%". The odds delta needs the stored snapshot of that week. */
export function weekRecap(s: Scope): Moment[] {
  const r = s.model?.lastResult;
  if (!s.inSeason || !r || s.dow !== 2) return [];
  const verdict = Math.abs(r.mine - r.theirs) < 0.005 ? 'tied' : r.mine > r.theirs ? 'won' : 'lost';
  const odds = s.model?.playoffPct ?? null;
  const prev = s.ctx.previous && s.ctx.previous.week === r.week ? s.ctx.previous.playoffPct : null;
  const rec = s.model!.record;
  let tail: string;
  if (odds !== null && prev !== null && pct(prev) !== pct(odds)) tail = `playoff odds ${pct(prev)} → ${pct(odds)}`;
  else if (odds !== null) tail = `playoff odds ${pct(odds)}`;
  else tail = `now ${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ''}`;
  const morning = s.now < startOfDay(s.now, s.tz) + 12 * HOUR;
  return [{
    id: 'week-recap', kind: 'week-recap', priority: morning ? 78 : 52,
    title: `week ${r.week} recap: you ${verdict} ${pts1(r.mine)}–${pts1(r.theirs)}`,
    detail: `against ${r.oppName} · ${tail}`,
    action: { label: 'see the playoff picture', to: '/race' },
    startsAt: startOfDay(s.now, s.tz), endsAt: startOfDay(s.now, s.tz, 1),
    pages: ['home', 'team'],
  }];
}

/** The deadline week and the week before it. Sleeper's `trade_deadline` is a week number; trades are treated as closing when that week starts (conservative). */
export function tradeDeadline(s: Scope): Moment[] {
  const td = s.ctx.settings.tradeDeadline;
  if (!s.inSeason || !td || td < 1 || s.week === null || (s.week !== td && s.week !== td - 1)) return [];
  const thisWeek = s.week === td;
  const next = s.ctx.schedule.nextGames.filter((g) => Number.isFinite(g.kickoff)).sort((a, b) => a.kickoff - b.kickoff)[0] ?? null;
  const when = thisWeek ? `week ${td} is the last week to trade` : next ? `week ${td} starts in ${spanWords(next.kickoff - s.now)}` : `week ${td} is next week`;
  const t = s.model?.trade ?? null;
  const deal = t ? `best handshake deal: send ${t.give} to ${t.partner} for ${t.get} (+${pts1(t.myGain)} you, +${pts1(t.theirGain)} them)` : null;
  return [{
    id: 'trade-deadline', kind: 'trade-deadline', priority: thisWeek ? 74 : 64,
    title: `trade deadline: week ${td}`, detail: deal ? `${when} · ${deal}` : when,
    action: { label: 'see handshake deals', to: '/trades' },
    ...(next && !thisWeek ? { countdownTo: next.kickoff, label: 'deadline' } : {}),
    pages: ['trades', 'home'],
  }];
}

/** The race for a spot: "win and you're in", "win out and you're in", then "you're in". */
export function clinchScenario(s: Scope): Moment[] {
  const m = s.model;
  const mg = m?.magic;
  if (s.ctx.phase !== 'in_season' || !m || !mg) return [];
  const odds = m.playoffPct !== null ? ` · you are at ${pct(m.playoffPct)} now` : '';
  if (mg.clinched) {
    return [{
      id: 'clinched', kind: 'clinched', priority: 40, title: 'you’re in: playoff spot clinched',
      detail: `${m.record.w}–${m.record.l}${m.record.t ? `–${m.record.t}` : ''} and a bracket spot is yours${m.titlePct !== null ? ` · ${pct(m.titlePct)} to win the title` : ''}`,
      action: { label: 'see the playoff picture', to: '/race' }, pages: ['home', 'team'],
    }];
  }
  if (mg.eliminated || mg.spot === null || mg.spot < 1 || mg.open < 1 || mg.open > 4) return [];
  const oneLeft = mg.open === 1;
  let title: string, detail: string;
  if (mg.spot === 1 && oneLeft) { title = 'win and you’re in'; detail = `a win this week clinches a playoff spot${odds}`; }
  else if (mg.spot === 1) { title = 'one more win and you’re in'; detail = `any 1 of your last ${mg.open} games clinches a spot${odds}`; }
  else if (mg.winOut || mg.spot === mg.open) { title = 'win out and you’re in'; detail = `win all ${mg.open} remaining games to clinch a spot${odds}`; }
  else return [];
  return [{
    id: 'clinch', kind: 'clinch', priority: oneLeft ? 78 : 68, title, detail,
    action: { label: 'see magic number', to: '/race' }, pages: ['home', 'team'],
  }];
}

/** Out of the playoff race (or never in it): the toilet bowl, or the consolation bracket, whichever the league plays. */
export function toiletBowl(s: Scope): Moment[] {
  const m = s.model;
  const l = m?.losers;
  if (!s.inSeason || !m || !l || l.pct === null) return [];
  const out = m.magic?.eliminated || (m.playoffPct !== null && m.playoffPct < 0.01 && (s.ctx.phase === 'postseason' || (l.inPct ?? 0) > 0.5));
  if (!out) return [];
  return [{
    id: 'toilet-bowl', kind: 'toilet-bowl', priority: 46,
    title: `${l.name}: you’re in it`, detail: `${pct(l.pct)} to be crowned ${l.champ}`,
    action: { label: 'see the bracket', to: '/race' }, pages: ['home'],
  }];
}

/** Playoff weeks with a spot in the bracket. */
export function playoffs(s: Scope): Moment[] {
  const m = s.model;
  if (s.ctx.phase !== 'postseason' || !m || m.playoffPct === null || m.playoffPct < 0.99) return [];
  const bits: string[] = [];
  if (m.matchup) bits.push(`week ${m.week}: ${pct(m.matchup.p)} to beat ${m.matchup.oppName}`);
  if (m.titlePct !== null) bits.push(`${pct(m.titlePct)} to win it all`);
  if (bits.length === 0) return [];
  const round = s.ctx.settings.playoffWeekStart ? m.week - s.ctx.settings.playoffWeekStart + 1 : null;
  return [{
    id: 'playoffs', kind: 'playoffs', priority: 82,
    title: round && round > 0 ? `playoffs, round ${round}: you’re in the bracket` : 'playoffs: you’re in the bracket', detail: bits.join(' · '),
    action: { label: 'see the bracket', to: '/race' }, pages: ['home', 'gameday'],
  }];
}
