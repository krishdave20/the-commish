/* League-level stats: all-play record, luck, and single-game win probability. */
import type { HistoryRow, Model, ModelTeam } from './types.ts';

export interface AllPlay {
  rid: number;
  /** all-play wins / losses over every finished week (a tie in points counts as a loss, as in the reference) */
  w: number;
  l: number;
  /** "W–L" */
  record: string;
  pct: number;
}

/** Each team's record if it had played every other team in every finished week. */
export function allPlay(history: readonly HistoryRow[], teams: ReadonlyArray<Pick<ModelTeam, 'rid'>>): Record<number, AllPlay> {
  const finals = history.filter((h) => h.final);
  const byWeek = new Map<number, HistoryRow[]>();
  for (const h of finals) { const a = byWeek.get(h.week); if (a) a.push(h); else byWeek.set(h.week, [h]); }
  const out: Record<number, AllPlay> = {};
  for (const t of teams) {
    let w = 0, l = 0;
    for (const h of finals) {
      if (h.rid !== t.rid) continue;
      for (const o of byWeek.get(h.week) ?? []) {
        if (o.rid === t.rid) continue;
        if (h.pts > o.pts) w++; else l++;
      }
    }
    out[t.rid] = { rid: t.rid, w, l, record: `${w}–${l}`, pct: w / Math.max(1, w + l) };
  }
  return out;
}

export const allPlayFor = (model: Model): Record<number, AllPlay> => allPlay(model.history, model.teams);

/** Actual wins minus all-play expected wins (all-play pct × games played). Positive = lucky. */
export function luck(team: Pick<ModelTeam, 'wins' | 'losses' | 'ties'>, ap: Pick<AllPlay, 'pct'>): number {
  return team.wins - ap.pct * (team.wins + team.losses + team.ties);
}

/** erf approximation (Abramowitz–Stegun 7.1.26), as in the reference */
export function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/** Chance that a team averaging `a` beats one averaging `b` when each score has SD `sd` (pass sd × volatility). */
export function winProb(a: number, b: number, sd: number): number {
  const z = (a - b) / (Math.SQRT2 * sd);
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
