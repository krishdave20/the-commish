/* Replacement level: what a "typical free agent" scores at a position in a week.

   Definition (documented in the app's "?" and docs/WEB_APP_NOTES.md): among the free agents at the position who have a game that week and
   have not already played it, take the TOP_N best by the model's expected points for the week, and use the MEDIAN of those. The median of
   the top N (not the best one) is what a manager could realistically pick up: the best free agent is a waiver-wire fight, the 12th is
   barely a starter, the middle of the top dozen is the typical pickup.
   The pool is the model's capped free-agent pool (`POOL_CAP`), so a thin position (say kickers) simply has fewer than N; the median
   is taken over whoever there is, and a position with no free agent left replaces to 0. */
import type { Model, Pos } from '../types.ts';

export const REPLACEMENT_TOP_N = 12;

/** Median of a list; 0 when empty. */
function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Replacement level by position for `week`. Positions the league does not use are still returned (0 when no free agent). */
export function replacementLevels(model: Model, week: number = model.meta.currentWeek, topN: number = REPLACEMENT_TOP_N): Record<string, number> {
  const cur = model.meta.currentWeek;
  const byPos = new Map<Pos, number[]>();
  for (const p of model.players) {
    if (p.ownerRid !== 0 || p.onIr) continue;
    const opp = p.opp[week];
    if (!opp || opp === 'BYE') continue;
    // this week's number for a player who already played is his actual score: he cannot be picked up for a game that is over
    if (week === cur && p.playedThisWeek) continue;
    const mu = p.mu[week];
    if (mu === undefined) continue;
    const list = byPos.get(p.pos);
    if (list) list.push(mu); else byPos.set(p.pos, [mu]);
  }
  const out: Record<string, number> = {};
  for (const [pos, list] of byPos) out[pos] = median(list.sort((a, b) => b - a).slice(0, topN));
  return out;
}

export { median as medianOf };
