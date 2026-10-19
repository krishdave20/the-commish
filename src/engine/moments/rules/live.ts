/* While games are on: the live score, and Monday night when the whole week comes down to it. */
import { weekdayOf, HOUR } from '../time.ts';
import type { Moment } from '../types.ts';
import { gamesOnDay, nameList, pts1 } from '../scope.ts';
import type { Scope } from '../scope.ts';

const lead = (a: number, b: number) => (Math.abs(a - b) < 0.005 ? 'ties' : a > b ? 'leads' : 'trails');

/** "icemen leads killa k im gay 95.0 to 58.8", with the live activity's pill "icemen 95.0 · 58.8 · 80%". */
export function liveMatchup(s: Scope): Moment[] {
  const m = s.ctx.live;
  if (!s.inSeason || !m || !m.started || m.final) return [];
  // only on a day with games still to come or on: a Thursday score is not news on Friday
  if (!gamesOnDay(s, s.now).some((g) => g.state !== 'final')) return [];
  const p = Math.round(m.winP * 100);
  const word = lead(m.mine.pts, m.theirs.pts);
  return [{
    id: 'live-matchup', kind: 'live-matchup', priority: 92, live: true,
    title: `${m.mine.name} ${word} ${m.theirs.name} ${pts1(m.mine.pts)} to ${pts1(m.theirs.pts)}`,
    detail: `${p}% to win · ${m.mine.left.length} of your starters left, ${m.theirs.left.length} of theirs`,
    action: { label: 'open game day', to: '/gameday' },
    pill: { text: `${m.mine.name} ${pts1(m.mine.pts)} · ${pts1(m.theirs.pts)} · ${p}%`, bar: m.winP },
    pages: ['gameday', 'home', 'team'],
  }];
}

/** Only Monday night games are left and your matchup is not settled: "you need 12.4 from X". */
export function mondayNight(s: Scope): Moment[] {
  const m = s.ctx.live;
  if (!s.inSeason || !m || !m.started || m.final || m.winP <= 0.03 || m.winP >= 0.97) return [];
  const open = s.games.filter((g) => g.state !== 'final');
  if (open.length === 0 || !open.every((g) => weekdayOf(g.kickoff, s.tz) === 1)) return [];
  const mine = m.mine.left.map((p) => p.name), theirs = m.theirs.left.map((p) => p.name);
  if (mine.length === 0 && theirs.length === 0) return [];
  const gap = m.theirs.pts - m.mine.pts; // positive: I trail
  const ahead = pts1(Math.abs(gap));
  let detail: string;
  if (mine.length > 0 && theirs.length === 0) {
    detail = gap > 0 ? `you need ${pts1(gap)} from ${nameList(mine)}` : `you lead by ${ahead} and only ${nameList(mine)} ${mine.length === 1 ? 'is' : 'are'} left to play`;
  } else if (mine.length === 0) {
    detail = gap < 0 ? `you lead by ${ahead}; ${m.theirs.name} needs ${pts1(-gap)} from ${nameList(theirs)}` : `${m.theirs.name} leads by ${ahead} with ${nameList(theirs)} left`;
  } else {
    detail = `you ${gap > 0 ? 'trail' : 'lead'} by ${ahead} · you have ${nameList(mine)}, they have ${nameList(theirs)}`;
  }
  return [{
    id: 'monday-night', kind: 'monday-night', priority: 94, live: true,
    title: 'it comes down to monday night', detail,
    action: { label: 'open game day', to: '/gameday' },
    pill: { text: `${m.mine.name} ${pts1(m.mine.pts)} · ${pts1(m.theirs.pts)} · ${Math.round(m.winP * 100)}%`, bar: m.winP },
    pages: ['gameday', 'home', 'team'],
  }];
}

/** How long the recap stays in the live activity after the matchup ends. */
export const RECAP_WINDOW = 12 * HOUR;
/** An NFL game lasts about three and a half hours: the last kickoff plus this is when the week's games are over. */
const GAME_LENGTH = 3.5 * HOUR;

/** After your matchup is settled: "final: you won 112.3–98.0", for 12 hours (Monday night into Tuesday's recap). Read from the live matchup (every starter on both sides is done), else
    from the model's result once every game of the week is over. */
export function finalWhistle(s: Scope): Moment[] {
  // Tuesday's week recap takes over from here (it says the same thing with the odds), so the two never stand side by side
  if (!s.inSeason || s.dow === 2) return [];
  const m = s.ctx.live;
  let mine: number, theirs: number, opp: string, week: number | null, top: { name: string; pts: number } | null, endsAt: number | undefined;
  if (m && m.started && m.final) {
    mine = m.mine.pts; theirs = m.theirs.pts; opp = m.theirs.name; week = m.week ?? s.week; top = m.mine.top ?? null;
    endsAt = m.finalAt != null ? m.finalAt + RECAP_WINDOW : undefined;
  } else {
    const r = s.model?.lastResult;
    if (!s.weekOver || !r || r.week !== s.week || !s.lastKick) return [];
    mine = r.mine; theirs = r.theirs; opp = r.oppName; week = r.week; top = null;
    endsAt = s.lastKick.kickoff + GAME_LENGTH + RECAP_WINDOW;
  }
  const tie = Math.abs(mine - theirs) < 0.005;
  const verb = tie ? 'tied' : mine > theirs ? 'won' : 'lost';
  const score = `${pts1(mine)}–${pts1(theirs)}`;
  return [{
    id: 'final-whistle', kind: 'final-whistle', priority: 91, glance: true,
    title: `final: you ${verb} ${score}`,
    detail: `against ${opp}${top ? ` · your top scorer: ${top.name} (${pts1(top.pts)})` : ''}`,
    action: { label: 'see the week', to: week !== null ? `/gameday?week=${week}` : '/gameday' },
    pill: { text: `${tie ? 'T' : verb === 'won' ? 'W' : 'L'} ${score}` },
    ...(endsAt !== undefined ? { endsAt } : {}),
    pages: ['gameday', 'home', 'team'],
  }];
}
