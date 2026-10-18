/* What every rule reads, worked out once from the context: the clock in the viewer's zone, this week's games in order, and whether the
   league is in a season at all. */
import { startOfDay, weekdayOf, HOUR } from './time.ts';
import type { Kickoff, MomentCtx, MomentModel } from './types.ts';
import { lastWaiverRun, nextWaiverRun, waiverSchedule } from './waivers.ts';
import type { WaiverSchedule } from './waivers.ts';

export interface Scope {
  ctx: MomentCtx;
  now: number;
  tz: string;
  /** ISO weekday of now in the viewer's zone */
  dow: number;
  model: MomentModel | null;
  /** the league has games to play: a regular season or the playoffs */
  inSeason: boolean;
  /** this week's NFL week number: the model's, else the NFL state's */
  week: number | null;
  games: Kickoff[];
  firstKick: Kickoff | null;
  lastKick: Kickoff | null;
  /** every game of the week is over (and there were games) */
  weekOver: boolean;
  waiver: WaiverSchedule;
  nextRun: number;
  lastRun: number;
}

export function buildScope(ctx: MomentCtx): Scope {
  const now = ctx.now.getTime();
  const tz = ctx.tz;
  const games = ctx.schedule.games.filter((g) => Number.isFinite(g.kickoff)).sort((a, b) => a.kickoff - b.kickoff);
  const waiver = waiverSchedule(ctx.settings);
  return {
    ctx, now, tz, dow: weekdayOf(now, tz), model: ctx.model,
    inSeason: ctx.phase === 'in_season' || ctx.phase === 'postseason',
    week: ctx.model?.week ?? ctx.nflState?.week ?? null,
    games, firstKick: games[0] ?? null, lastKick: games[games.length - 1] ?? null,
    weekOver: games.length > 0 && games.every((g) => g.state === 'final'),
    waiver, nextRun: nextWaiverRun(now, waiver), lastRun: lastWaiverRun(now, waiver),
  };
}

/** Games kicking off on the same local day as `ms`. */
export const gamesOnDay = (s: Scope, ms: number): Kickoff[] => {
  const a = startOfDay(ms, s.tz), b = startOfDay(ms, s.tz, 1);
  return s.games.filter((g) => g.kickoff >= a && g.kickoff < b);
};

/** The starters whose NFL team plays in any of `games`. */
export function startersIn(s: Scope, games: readonly Kickoff[]): number {
  const teams = new Set<string>();
  for (const g of games) { teams.add(g.home); teams.add(g.away); }
  return (s.model?.starters ?? []).filter((p) => p.nfl !== null && teams.has(p.nfl)).length;
}

export const HOURS = (n: number) => n * HOUR;

/** Percent as the app writes odds: "74%", ">99%", "<1%". */
export function pct(x: number): string {
  if (x > 0.995 && x < 1) return '>99%';
  if (x < 0.005 && x > 0) return '<1%';
  return `${Math.round(x * 100)}%`;
}

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** "x", "x and y", "x, y and 2 more". */
export function nameList(names: readonly string[], max = 2): string {
  if (names.length <= max) return names.length === 2 ? `${names[0]} and ${names[1]}` : names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

export const pts1 = (n: number): string => n.toFixed(1);
