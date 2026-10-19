/* The weekly power score: pure functions over the model's history rows (and, for the current week only, the draft room's ROS strength).

   FORMULA. For the rankings "going into week W" (W = 2..current week), use the finished weeks before W:
     pfpg      points for per game
     allPlay   all-play win share (the best signal of true strength; engine/league.ts allPlay)
     form      the last 3 finished weeks' average points minus the league average of those same weeks
     ros       expected points over the remaining regular season (draft/ratings.ts rosPts), CURRENT WEEK ONLY
   Each part is min–max scaled 0..100 across the league (50 for all when everyone ties), then blended:
     with ros     all-play 35 · points for 25 · form 15 · ros 25
     without ros  the other three at their share of the 75: all-play 46.7 · points for 33.3 · form 20
   Past weeks skip ros because the model holds no past projections; their index is therefore a results-only index, and the step from the
   last past week to this one includes the roster-strength part. Ties in the index break on points for per game, then roster id. */
import { allPlay as allPlayOf, luck as luckOf } from '../league.ts';
import type { HistoryRow, Model } from '../types.ts';
import type { PowerParts } from './types.ts';

export const POWER_WEIGHTS = { allPlay: 0.35, pf: 0.25, form: 0.15, ros: 0.25 } as const;
/** how many of the latest finished weeks make up recent form */
export const FORM_WEEKS = 3;

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

export const scale100 = (xs: readonly number[]): number[] => {
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return xs.map((x) => (hi - lo > 1e-9 ? (100 * (x - lo)) / (hi - lo) : 50));
};

/** rank 1 = highest value; ties by the second key (higher first), then by roster id */
export function rankBy(rids: readonly number[], v: readonly number[], tie: readonly number[] = []): number[] {
  const order = rids.map((rid, i) => ({ rid, v: v[i]!, t: tie[i] ?? 0, i })).sort((a, b) => b.v - a.v || b.t - a.t || a.rid - b.rid);
  const out = new Array<number>(rids.length).fill(0);
  order.forEach((o, k) => { out[o.i] = k + 1; });
  return out;
}

/** The weights actually applied: ros present or not (the rest renormalised to 1). */
export function weightsFor(hasRos: boolean) {
  const { allPlay, pf, form, ros } = POWER_WEIGHTS;
  const total = hasRos ? allPlay + pf + form + ros : allPlay + pf + form;
  return { allPlay: allPlay / total, pf: pf / total, form: form / total, ros: hasRos ? ros / total : 0 };
}

/** The 0..100 power index from scaled parts. `ros` null leaves that part out and renormalises. */
export function blend(scaled: { pfpg: number; allPlay: number; form: number; ros: number | null }): number {
  const w = weightsFor(scaled.ros !== null);
  return w.allPlay * scaled.allPlay + w.pf * scaled.pfpg + w.form * scaled.form + w.ros * (scaled.ros ?? 0);
}

/** The finished regular-season weeks in the history, oldest first (a week is finished when every row of it is). */
export function finishedWeeks(history: readonly HistoryRow[], lastRegularWeek: number): number[] {
  const open = new Set<number>(), seen = new Set<number>();
  for (const h of history) {
    if (h.week > lastRegularWeek) continue;
    seen.add(h.week);
    if (!h.final) open.add(h.week);
  }
  return [...seen].filter((w) => !open.has(w)).sort((a, b) => a - b);
}

export interface TeamSeasonToDate {
  rid: number;
  games: number;
  pf: number;
  record: { w: number; l: number; t: number };
  allPlayRecord: { w: number; l: number };
  allPlayPct: number;
  luck: number;
  form: number;
  streak: { dir: 'over' | 'under'; weeks: number } | null;
  lastPts: number | null;
  lastVsAvg: number | null;
  leagueAvg: number | null;
}

/** Everything the results alone say about each team through the given weeks (all finished). */
export function seasonToDate(history: readonly HistoryRow[], rids: readonly number[], weeks: readonly number[]): TeamSeasonToDate[] {
  const wk = new Set(weeks);
  const rows = history.filter((h) => wk.has(h.week) && h.final);
  const ap = allPlayOf(rows, rids.map((rid) => ({ rid })));
  const avgOf = new Map<number, number>();
  for (const w of weeks) {
    const r = rows.filter((h) => h.week === w);
    avgOf.set(w, r.length ? sum(r.map((h) => h.pts)) / r.length : 0);
  }
  const recent = [...weeks].sort((a, b) => a - b).slice(-FORM_WEEKS);
  return rids.map((rid) => {
    const mine = rows.filter((h) => h.rid === rid).sort((a, b) => a.week - b.week);
    const record = { w: 0, l: 0, t: 0 };
    for (const h of mine) { if (h.pts > h.oppPts) record.w++; else if (h.pts < h.oppPts) record.l++; else record.t++; }
    const pf = sum(mine.map((h) => h.pts));
    const a = ap[rid] ?? { w: 0, l: 0, pct: 0 };
    const recentRows = mine.filter((h) => recent.includes(h.week));
    const form = recentRows.length ? sum(recentRows.map((h) => h.pts - (avgOf.get(h.week) ?? 0))) / recentRows.length : 0;
    let streak = null as TeamSeasonToDate['streak'];
    for (let i = mine.length - 1; i >= 0; i--) {
      const d = mine[i]!.pts - (avgOf.get(mine[i]!.week) ?? 0);
      const dir = d > 0 ? 'over' : d < 0 ? 'under' : null;
      if (!dir || (streak && streak.dir !== dir)) break;
      streak = { dir, weeks: (streak?.weeks ?? 0) + 1 };
    }
    const last = mine[mine.length - 1];
    return {
      rid, games: mine.length, pf, record, allPlayRecord: { w: a.w, l: a.l }, allPlayPct: a.pct,
      luck: luckOf({ wins: record.w, losses: record.l, ties: record.t }, { pct: a.pct }),
      form, streak, lastPts: last ? last.pts : null, lastVsAvg: last ? last.pts - (avgOf.get(last.week) ?? 0) : null,
      leagueAvg: last ? (avgOf.get(last.week) ?? null) : null,
    };
  });
}

/** Raw parts for every team: results through the finished weeks, plus roster strength when given (`ros`: rid → expected points). */
export function powerParts(s: readonly TeamSeasonToDate[], ros: Readonly<Record<number, number>> | null): PowerParts[] {
  return s.map((t) => ({ pfpg: t.games ? t.pf / t.games : 0, allPlay: t.allPlayPct, form: t.form, ros: ros ? (ros[t.rid] ?? 0) : null }));
}

/** Scaled parts and the index for every team, in the order of `parts`. */
export function scoreTeams(parts: readonly PowerParts[]) {
  const pf = scale100(parts.map((p) => p.pfpg)), ap = scale100(parts.map((p) => p.allPlay)), fo = scale100(parts.map((p) => p.form));
  const hasRos = parts.length > 0 && parts.every((p) => p.ros !== null);
  const ro = hasRos ? scale100(parts.map((p) => p.ros!)) : null;
  return parts.map((_, i) => {
    const scaled = { pfpg: pf[i]!, allPlay: ap[i]!, form: fo[i]!, ros: ro ? ro[i]! : null };
    return { scaled, index: blend(scaled) };
  });
}

/** Remaining regular-season weeks, as the draft room counts them: the current week through the last. */
export const rosWeeks = (model: Pick<Model, 'meta'>): number[] => {
  const out: number[] = [];
  for (let w = model.meta.currentWeek; w <= model.meta.lastRegularWeek; w++) out.push(w);
  return out;
};
