/* The weekly rhythm: waivers on Tuesday night and Wednesday, the game-day nudge, the Friday and Saturday injury report, the Sunday
   morning final check. Each rule returns zero or one moment and fires only when the data it quotes is there. */
import { dayName, formatClock, startOfDay, weekdayOf, whenWords, HOUR, DAY } from '../time.ts';
import type { Moment } from '../types.ts';
import { gamesOnDay, nameList, pts1, startersIn } from '../scope.ts';
import type { Scope } from '../scope.ts';

const BEFORE_RUN = 30 * HOUR;
/** inside this many hours of the run, "tonight" is close enough to be the loudest thing on the huddle */
const URGENT = 9 * HOUR;
/** Sleeper (the NFL) announces inactives about 90 minutes before kickoff */
export const INACTIVES_LEAD = 90 * 60_000;

/** Tuesday → the night waivers run: "waivers process tonight at 2:00 am: your top add is …, bid $76". */
export function waiversTonight(s: Scope): Moment[] {
  if (!s.inSeason) return [];
  const run = s.nextRun;
  if (run - s.now > BEFORE_RUN || run <= s.now) return [];
  const w = s.model?.waiver ?? null;
  const top = w?.top ?? null;
  const urgent = run - s.now <= URGENT;
  let detail: string;
  if (top) detail = `your top add is ${top.name} (+${pts1(top.gain)} lineup lift)${w!.faab ? `, bid $${top.bid}` : ''}`;
  else if (w) detail = 'nobody on the wire beats your bench right now';
  else detail = 'set your claims before then';
  return [{
    id: 'waivers-tonight', kind: 'waivers-tonight', priority: top ? (urgent ? 86 : 62) : (urgent ? 56 : 40),
    title: `waivers process ${whenWords(s.now, run, s.tz)}`, detail,
    action: { label: top ? 'open the waiver wire' : 'see the wire', to: '/waivers' },
    startsAt: startOfDay(run, s.tz, -1), endsAt: run, countdownTo: run, ongoingFrom: run - 12 * HOUR, label: 'waivers',
    pages: ['waivers', 'home', 'team'],
  }];
}

/** Wednesday after the run: "waivers cleared. see who you got, and re-check your lineup for week 7". */
export function waiversCleared(s: Scope): Moment[] {
  if (!s.inSeason || s.week === null) return [];
  const run = s.lastRun;
  if (s.now < run || s.now >= run + DAY) return [];
  const best = s.model?.lineup?.best;
  return [{
    id: 'waivers-cleared', kind: 'waivers-cleared', priority: 74,
    title: 'waivers cleared',
    detail: `see who you got, and re-check your lineup for week ${s.week}${best !== undefined ? `: your best lineup projects ${pts1(best)}` : ''}`,
    action: { label: 'check your lineup', to: '/team' },
    startsAt: run, endsAt: run + DAY, label: 'waivers',
    pages: ['team', 'waivers', 'home'],
  }];
}

/** How the lineup stands, as a clause: "your lineup is optimal" or "swap x in for +4.2". Null when the model has no lineup. */
function lineupClause(s: Scope): string | null {
  const l = s.model?.lineup;
  if (!l) return null;
  const top = l.swaps[0];
  return top ? `swap ${top.inName} in${top.outName ? ` for ${top.outName}` : ''} for +${pts1(top.gain)}` : 'your lineup is optimal';
}

/** A week whose first game is not on Sunday: "game day starts tonight 7:15 pm: 3 of your starters play thursday". */
export function gameDay(s: Scope): Moment[] {
  const first = s.firstKick;
  if (!s.inSeason || !first || first.state !== 'pre' || s.now >= first.kickoff) return [];
  const kickDow = weekdayOf(first.kickoff, s.tz);
  if (kickDow === 7) return []; // a Sunday opener is the final check's job
  const dayStart = startOfDay(first.kickoff, s.tz);
  if (s.now < dayStart) return [];
  const day = dayName(kickDow);
  const starters = s.model?.starters ?? [];
  const n = startersIn(s, gamesOnDay(s, first.kickoff));
  let detail: string;
  if (!s.model) detail = 'set your lineup before kickoff';
  else if (n === 0) detail = `none of your ${starters.length} starters play ${day}: your lineup can wait`;
  else detail = `${n} of your ${starters.length} starters play ${day}`;
  const clause = lineupClause(s);
  if (clause && n > 0) detail += ` · ${clause}`;
  return [{
    id: 'game-day', kind: 'game-day', priority: s.model && n === 0 ? 50 : 88,
    title: `game day starts ${whenWords(s.now, first.kickoff, s.tz)}`, detail,
    action: { label: 'check your lineup', to: '/team' },
    startsAt: dayStart, endsAt: first.kickoff, countdownTo: first.kickoff, ongoingFrom: first.kickoff - 6 * HOUR, label: 'kickoff', precise: true,
    pages: ['team', 'home', 'gameday'],
  }];
}

/** Wednesday to Sunday: a better lineup exists. The nearer the games, the louder. */
export function lineupSwap(s: Scope): Moment[] {
  const l = s.model?.lineup;
  if (!s.inSeason || !l || l.swaps.length === 0 || s.now < s.lastRun) return [];
  if (s.lastKick && s.now >= s.lastKick.kickoff) return [];
  const total = l.swaps.reduce((t, x) => t + x.gain, 0);
  const one = l.swaps.length === 1 ? l.swaps[0]! : null;
  const priority = s.dow === 7 ? 84 : s.dow === 5 || s.dow === 6 ? 72 : s.dow === 4 ? 66 : 58;
  return [{
    id: 'lineup-swap', kind: 'lineup-swap', priority,
    title: one ? `swap ${one.inName} in${one.outName ? ` for ${one.outName}` : ''}` : `${l.swaps.length} lineup swaps are worth +${pts1(total)}`,
    detail: one
      ? `+${pts1(one.gain)} expected points · your best lineup projects ${pts1(l.best)}`
      : `${l.swaps.slice(0, 2).map((x) => `${x.inName}${x.outName ? ` for ${x.outName}` : ''} (+${pts1(x.gain)})`).join(', ')} · your best lineup projects ${pts1(l.best)}`,
    action: { label: 'fix your lineup', to: '/team' },
    startsAt: s.lastRun, endsAt: s.lastKick?.kickoff,
    pages: ['team', 'home'],
  }];
}

/** Friday and Saturday: the injury report on your starters, and what to start instead. */
export function injuryReport(s: Scope): Moment[] {
  const risks = s.model?.injuries ?? [];
  if (!s.inSeason || risks.length === 0 || (s.dow !== 5 && s.dow !== 6)) return [];
  const start = startOfDay(s.now, s.tz), end = startOfDay(s.now, s.tz, s.dow === 5 ? 2 : 1);
  const first = risks[0]!;
  const one = risks.length === 1;
  const fb = first.fallback;
  return [{
    id: 'injury-risk', kind: 'injury-risk', priority: risks.some((r) => r.status === 'out') ? 80 : 76,
    title: one ? `injury report: ${first.name} is ${first.status}` : `injury report: ${risks.length} starters are flagged`,
    detail: one
      ? (fb ? `set a fallback: ${fb.name} (${pts1(fb.points)} points) is your best ${first.pos.toLowerCase()} on the bench` : `you have no ${first.pos.toLowerCase()} on the bench to fall back on`)
      : risks.map((r) => `${r.name} is ${r.status}`).join(', '),
    action: { label: 'set a fallback', to: '/team' },
    startsAt: start, endsAt: end,
    pages: ['team', 'home'],
  }];
}

/** Friday and Saturday with nothing wrong: the quiet "all set". */
export function lineupOk(s: Scope): Moment[] {
  const l = s.model?.lineup;
  if (!s.inSeason || !l || l.swaps.length > 0 || (s.dow !== 5 && s.dow !== 6) || s.week === null) return [];
  return [{
    id: 'lineup-ok', kind: 'lineup-ok', priority: 30,
    title: 'your lineup is optimal', detail: `your best lineup projects ${pts1(l.best)} for week ${s.week}`,
    action: { label: 'see the lineup', to: '/team' },
    startsAt: startOfDay(s.now, s.tz), endsAt: startOfDay(s.now, s.tz, s.dow === 5 ? 2 : 1),
    pages: ['team'],
  }];
}

/** Sunday morning until the early kickoff: "final lineup check: inactives are announced ~90 minutes before kickoff". */
export function finalCheck(s: Scope): Moment[] {
  if (!s.inSeason || s.dow !== 7 || s.games.length === 0) return [];
  const day = gamesOnDay(s, s.now).filter((g) => g.state === 'pre');
  const early = day[0];
  if (!early || s.now >= early.kickoff) return [];
  const inactives = early.kickoff - INACTIVES_LEAD;
  const same = day.filter((g) => g.kickoff === early.kickoff);
  const n = startersIn(s, same);
  const risks = s.model?.injuries ?? [];
  const parts = [`inactives are announced ~90 minutes before the ${formatClock(early.kickoff, s.tz)} kickoff`];
  if (s.model) {
    if (n > 0) parts.push(`${n} of your starters ${n === 1 ? 'plays' : 'play'} then`);
    parts.push(risks.length ? `watch ${nameList(risks.map((r) => `${r.name} (${r.status})`), 3)}` : 'no starter is flagged');
  }
  return [{
    id: 'final-check', kind: 'final-check', priority: 90,
    title: 'final lineup check', detail: parts.join(' · '),
    action: { label: 'check your lineup', to: '/team' },
    startsAt: startOfDay(s.now, s.tz), endsAt: early.kickoff,
    countdownTo: s.now < inactives ? inactives : early.kickoff, ongoingFrom: early.kickoff - 4 * HOUR,
    label: s.now < inactives ? 'inactives' : 'kickoff', precise: true,
    pages: ['team', 'home', 'gameday'],
  }];
}
