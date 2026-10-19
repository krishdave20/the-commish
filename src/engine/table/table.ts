/* League-wide team strength for the "around the league" page (pure). Everything here reads numbers the model already has: the finished
   history rows, the remaining schedule, each team's expected lineup points by week (`Means`) and the engine's single-game win probability.

   STANDINGS ORDER. Wins (a tie counts half), then points for, then roster id: the same order as the sleeper standings the app shows elsewhere.
   AFTER THIS WEEK. Each team's current-week game resolves to its win probability: expected wins = wins + p (+ half the tie chance, which the
      normal model treats as zero). Points for adds the week's expected lineup points. The order is expected wins, then projected points for.
      Once a game has kicked off, the caller can pass its live win chance and live projection (engine/live), which replace the pre-game ones.
   SCHEDULE LEFT. The average expected points of the opponents still to play (current week through the last regular week), against the league
      average of the same weeks. Rank 1 is the hardest schedule.
   BENCH. Points left on the bench in a finished week: the best possible lineup of the players' actual points minus the lineup started
      (engine/live benchRow), summed over the weeks given. */
import type { Means } from '../scenario.ts';
import type { HistoryRow, Model, ModelTeam } from '../types.ts';

type Rec = Pick<ModelTeam, 'rid' | 'wins' | 'losses' | 'ties' | 'pf'>;

/** Rank 1 = first in standings order: wins (ties count half), then points for, then roster id. Returns rid → rank. */
export function standingsRank(teams: readonly Rec[]): Record<number, number> {
  const order = [...teams].sort((a, b) => b.wins + b.ties / 2 - (a.wins + a.ties / 2) || b.pf - a.pf || a.rid - b.rid);
  return Object.fromEntries(order.map((t, i) => [t.rid, i + 1]));
}

export interface Streak {
  kind: 'W' | 'L' | 'T';
  n: number;
}

/** The current run of results (finished regular-season weeks only), most recent first: 3 straight wins is { kind: 'W', n: 3 }. Null with no games. */
export function streakOf(history: readonly HistoryRow[], rid: number, lastRegularWeek = Infinity): Streak | null {
  const mine = history.filter((h) => h.rid === rid && h.final && h.week <= lastRegularWeek).sort((a, b) => b.week - a.week);
  let out = null as Streak | null;
  for (const h of mine) {
    const kind = h.pts > h.oppPts ? 'W' : h.pts < h.oppPts ? 'L' : 'T';
    if (out && out.kind !== kind) break;
    out = { kind, n: (out?.n ?? 0) + 1 };
  }
  return out;
}

export const streakLabel = (s: Streak | null): string => (s ? `${s.kind}${s.n}` : '—');

export interface WeekOutlook {
  rid: number;
  /** this week's opponent; null on a bye (or when the regular season is over) */
  opp: number | null;
  /** chance of winning this week's game; null without a game */
  winP: number | null;
  /** expected lineup points this week */
  mean: number;
  /** standings rank now */
  rank: number;
  /** expected wins once this week resolves */
  expWins: number;
  /** expected losses once this week resolves */
  expLosses: number;
  /** the record if the favourite wins (a coin flip goes to the team, p ≥ 0.5) */
  likely: { w: number; l: number; t: number };
  /** points for once this week's expected points are in */
  projPf: number;
  /** rank in the projected standings */
  projRank: number;
  /** places gained: rank − projRank (+2 is up two) */
  move: number;
}

/** A game under way: the team's live win chance and live projected points (engine/live MatchupLive.winA and TeamLive.projection). */
export interface InPlay { winP: number; points: number }

/** Projected standings once the current week's games resolve. `winProb(a, b)` is the engine's (volatility-scaled) win probability;
    `inPlay` (rid → live numbers) replaces it, and the expected points, for teams whose game has started. */
export function projectWeek(model: Model, means: Means, winProb: (a: number, b: number) => number, inPlay: Readonly<Record<number, InPlay>> = {}): WeekOutlook[] {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const live = cur <= last;
  const games = live ? model.games.filter((g) => g.week === cur) : [];
  const oppOf = new Map<number, number>();
  for (const g of games) { oppOf.set(g.teamA, g.teamB); oppOf.set(g.teamB, g.teamA); }
  const rank = standingsRank(model.teams);
  const mean = (rid: number) => (live ? inPlay[rid]?.points ?? means[rid]?.[cur] ?? 0 : 0);

  const rows = model.teams.map((t) => {
    const opp = oppOf.get(t.rid) ?? null;
    const winP = opp === null ? null : inPlay[t.rid]?.winP ?? winProb(mean(t.rid), mean(opp));
    const p = winP ?? 0;
    const games = opp === null ? 0 : 1;
    return {
      rid: t.rid, opp, winP, mean: mean(t.rid), rank: rank[t.rid]!,
      expWins: t.wins + t.ties / 2 + p, expLosses: t.losses + t.ties / 2 + (games - p),
      likely: { w: t.wins + (opp !== null && p >= 0.5 ? 1 : 0), l: t.losses + (opp !== null && p < 0.5 ? 1 : 0), t: t.ties },
      projPf: t.pf + (opp === null ? 0 : mean(t.rid)), projRank: 0, move: 0,
    };
  });
  [...rows].sort((a, b) => b.expWins - a.expWins || b.projPf - a.projPf || a.rid - b.rid).forEach((r, i) => {
    r.projRank = i + 1;
    r.move = r.rank - r.projRank;
  });
  return rows;
}

export interface ScheduleLeft {
  rid: number;
  /** remaining regular-season games, this week included */
  games: number;
  /** the opponents' average expected points in those games; null with none left */
  oppAvg: number | null;
  /** oppAvg minus the league's average expected points over the same weeks (+ is a harder schedule) */
  vsLeague: number | null;
  /** 1 = hardest; null with none left */
  rank: number | null;
}

/** Strength of the schedule still to play, from the expected points of each remaining opponent in the week they meet. */
export function scheduleLeft(model: Model, means: Means): ScheduleLeft[] {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const games = model.games.filter((g) => g.week >= cur && g.week <= last);
  const weeks = [...new Set(games.map((g) => g.week))];
  const leagueAvg = new Map(weeks.map((w) => [w, avg(model.teams.map((t) => means[t.rid]?.[w] ?? 0))]));
  const rows = model.teams.map((t): ScheduleLeft => {
    const mine = games.filter((g) => g.teamA === t.rid || g.teamB === t.rid);
    if (!mine.length) return { rid: t.rid, games: 0, oppAvg: null, vsLeague: null, rank: null };
    const opp = mine.map((g) => means[g.teamA === t.rid ? g.teamB : g.teamA]?.[g.week] ?? 0);
    const base = mine.map((g) => leagueAvg.get(g.week) ?? 0);
    return { rid: t.rid, games: mine.length, oppAvg: avg(opp), vsLeague: avg(opp) - avg(base), rank: null };
  });
  rows.filter((r) => r.oppAvg !== null).sort((a, b) => b.oppAvg! - a.oppAvg! || a.rid - b.rid).forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Expected lineup points over the remaining regular season (current week through the last), total and per week. */
export function restOfSeason(model: Model, means: Means): Record<number, { total: number; perWeek: number; weeks: number }> {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const out: Record<number, { total: number; perWeek: number; weeks: number }> = {};
  for (const t of model.teams) {
    let total = 0, weeks = 0;
    for (let w = cur; w <= last; w++) { total += means[t.rid]?.[w] ?? 0; weeks++; }
    out[t.rid] = { total, perWeek: weeks ? total / weeks : 0, weeks };
  }
  return out;
}

export interface BenchTotal {
  /** points left on the bench over the weeks read */
  total: number;
  weeks: number;
  perWeek: number;
}

/** Points left on the bench per team, summed over finished weeks (each week's `bench` rows from the engine's week view). */
export function benchLeft(weeks: ReadonlyArray<{ bench: ReadonlyArray<{ rid: number; left: number }> }>): Record<number, BenchTotal> {
  const out: Record<number, BenchTotal> = {};
  for (const w of weeks) {
    for (const b of w.bench) {
      const t = (out[b.rid] ??= { total: 0, weeks: 0, perWeek: 0 });
      t.total += b.left;
      t.weeks++;
    }
  }
  for (const t of Object.values(out)) t.perWeek = t.weeks ? t.total / t.weeks : 0;
  return out;
}

function avg(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}
