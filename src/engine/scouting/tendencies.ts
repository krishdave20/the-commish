/* Tendencies across the season: how a team behaves, from the weeks already played.

   - lineup habit: the average points left on the bench per week (the best lineup of the roster, by actual points, minus the lineup started),
     and in how many weeks the lineup was already the best one (left under OPTIMAL_WITHIN);
   - over / underperformer: the average of (points scored - projected points of the starters) per week. Beyond ±PROJECTION_BAND (2.0)
     a week is an overperformer or underperformer, within it the team scores what it is projected for. The projection is the sum of the starters'
     Sleeper projections, scored with the league's rules, as they stood before that week;
   - boom or bust: a week is a boom when the team scored at least BOOM_X (1.2) times the league's average team score that week and a bust at
     BUST_X (0.8) times or less. The team is "boom or bust" when the spread of its weekly scores is at least VOLATILE_CV (20%) of its average,
     "steady" at STEADY_CV (10%) or less;
   - close games: results decided by CLOSE_MARGIN (10) points or fewer.
   Only finished weeks before `week` count, and a figure needs data: no past week with a projection means no over / underperformer line. */
import type { HistoryRow } from '../types.ts';
import { OPTIMAL_WITHIN } from './lineup.ts';
import { plural, pts1, r1 } from './format.ts';

export const PROJECTION_BAND = 2;
export const BOOM_X = 1.2;
export const BUST_X = 0.8;
export const VOLATILE_CV = 0.2;
export const STEADY_CV = 0.1;
export const CLOSE_MARGIN = 10;

/** One finished week of one team, from the matchups and that week's projections. */
export interface PastWeek {
  week: number;
  /** points scored */
  actual: number;
  /** the starters' projected points before the week; null when the week's projections could not be read */
  projection: number | null;
  /** points left on the bench: the best lineup of the roster minus the lineup started */
  left: number;
}

export interface Tendencies {
  /** finished weeks the team has played before this one */
  weeks: number;
  sideline: { weeks: number; avgLeft: number; optimalWeeks: number } | null;
  vsProjection: { weeks: number; avgDiff: number; label: 'overperformer' | 'underperformer' | 'on projection' } | null;
  scoring: {
    weeks: number; avg: number; sd: number;
    high: { week: number; pts: number }; low: { week: number; pts: number };
    booms: number; busts: number; style: 'boom or bust' | 'steady' | 'in between';
  } | null;
  close: { games: number; wins: number; losses: number; ties: number } | null;
  /** one sentence each, in the order above */
  lines: string[];
}

export function tendencies(input: { rid: number; week: number; past: readonly PastWeek[]; history: readonly HistoryRow[] }): Tendencies {
  const { rid, week } = input;
  const past = input.past.filter((p) => p.week < week);
  const games = input.history.filter((h) => h.final && h.week < week);
  const mine = games.filter((h) => h.rid === rid).sort((a, b) => a.week - b.week);
  const lines: string[] = [];

  let sideline: Tendencies['sideline'] = null;
  if (past.length) {
    const avgLeft = past.reduce((s, p) => s + p.left, 0) / past.length;
    const optimalWeeks = past.filter((p) => p.left < OPTIMAL_WITHIN).length;
    sideline = { weeks: past.length, avgLeft: r1(avgLeft), optimalWeeks };
    lines.push(avgLeft < 0.5
      ? `sets a near-perfect lineup: ${pts1(avgLeft)} left on the bench a week, best lineup in ${optimalWeeks} of ${past.length} weeks`
      : `leaves ${pts1(avgLeft)} points on the bench a week, best lineup in ${optimalWeeks} of ${past.length} ${plural(past.length, 'week')}`);
  }

  let vsProjection: Tendencies['vsProjection'] = null;
  const projected = past.filter((p): p is PastWeek & { projection: number } => p.projection !== null);
  if (projected.length) {
    const avgDiff = projected.reduce((s, p) => s + (p.actual - p.projection), 0) / projected.length;
    const label = avgDiff >= PROJECTION_BAND ? 'overperformer' : avgDiff <= -PROJECTION_BAND ? 'underperformer' : 'on projection';
    vsProjection = { weeks: projected.length, avgDiff: r1(avgDiff), label };
    lines.push(label === 'on projection'
      ? `scores about what the projection says (${avgDiff >= 0 ? '+' : '−'}${pts1(Math.abs(avgDiff))} a week over ${projected.length} ${plural(projected.length, 'week')})`
      : `${label}: ${pts1(Math.abs(avgDiff))} points ${avgDiff > 0 ? 'above' : 'below'} projection a week over ${projected.length} ${plural(projected.length, 'week')}`);
  }

  let scoring: Tendencies['scoring'] = null;
  if (mine.length) {
    const leagueAvg = new Map<number, number>();
    for (const w of new Set(games.map((g) => g.week))) {
      const rows = games.filter((g) => g.week === w);
      leagueAvg.set(w, rows.reduce((s, g) => s + g.pts, 0) / rows.length);
    }
    const scores = mine.map((g) => g.pts);
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((s, x) => s + (x - avg) ** 2, 0) / scores.length);
    const booms = mine.filter((g) => g.pts >= BOOM_X * (leagueAvg.get(g.week) ?? Infinity)).length;
    const busts = mine.filter((g) => g.pts <= BUST_X * (leagueAvg.get(g.week) ?? -Infinity)).length;
    const hi = mine.reduce((a, g) => (g.pts > a.pts ? g : a), mine[0]!);
    const lo = mine.reduce((a, g) => (g.pts < a.pts ? g : a), mine[0]!);
    const cv = avg > 0 ? sd / avg : 0;
    const style = mine.length >= 3 && cv >= VOLATILE_CV ? 'boom or bust' : mine.length >= 3 && cv <= STEADY_CV ? 'steady' : 'in between';
    scoring = {
      weeks: mine.length, avg: r1(avg), sd: r1(sd), high: { week: hi.week, pts: hi.pts }, low: { week: lo.week, pts: lo.pts }, booms, busts, style,
    };
    lines.push(`averages ${pts1(avg)}, from ${pts1(lo.pts)} (week ${lo.week}) to ${pts1(hi.pts)} (week ${hi.week}): ${style}, ${booms} boom and ${busts} bust ${plural(mine.length, 'week')} of ${mine.length}`);
  }

  let close: Tendencies['close'] = null;
  const decided = mine.filter((g) => Math.abs(g.pts - g.oppPts) <= CLOSE_MARGIN);
  if (mine.length) {
    const wins = decided.filter((g) => g.pts > g.oppPts).length, losses = decided.filter((g) => g.pts < g.oppPts).length;
    close = { games: decided.length, wins, losses, ties: decided.length - wins - losses };
    lines.push(decided.length
      ? `${wins}–${losses}${close.ties ? `–${close.ties}` : ''} in games decided by ${CLOSE_MARGIN} or fewer`
      : `no game decided by ${CLOSE_MARGIN} or fewer yet`);
  }

  return { weeks: mine.length || past.length, sideline, vsProjection, scoring, close, lines };
}
