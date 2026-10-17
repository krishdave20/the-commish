import type { PlayerWeek } from '../../data/nflverseTypes';

/* Usage risers: free agents whose snap share or target share over the last two weeks is above their own average
   before that. Pure functions of the nflverse weekly rows. */

/** The recent window, in weeks. */
export const RISER_WINDOW = 2;
/** A riser needs at least this many offensive snaps in the recent window … */
export const MIN_RISER_SNAPS = 20;
/** … and at least this many targets for a target-share riser. */
export const MIN_RISER_TARGETS = 6;

export type RiserMetric = 'snap' | 'target';

export interface Riser {
  pid: string;
  team: string;
  recent: number;
  prior: number;
  /** recent minus prior, in share points (0.12 is 12 points) */
  change: number;
  /** weeks behind the recent and prior averages */
  recentWeeks: number;
  priorWeeks: number;
  recentSnaps: number;
  recentTargets: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Risers among `pids`, biggest rise first. `through` is the latest week with data (the recent window is its last two weeks). */
export function usageRisers(rows: readonly PlayerWeek[], pids: ReadonlySet<string>, through: number, metric: RiserMetric): Riser[] {
  const byPid = new Map<string, PlayerWeek[]>();
  for (const r of rows) {
    if (!pids.has(r.pid) || r.week > through) continue;
    const a = byPid.get(r.pid);
    if (a) a.push(r); else byPid.set(r.pid, [r]);
  }
  const from = through - RISER_WINDOW + 1;
  const get = (w: PlayerWeek) => (metric === 'snap' ? w.snap_pct : w.tgt_share);
  const out: Riser[] = [];
  for (const [pid, ws] of byPid) {
    const recentRows = ws.filter((w) => w.week >= from);
    const priorRows = ws.filter((w) => w.week < from);
    const recentSnaps = recentRows.reduce((s, w) => s + w.off_snaps, 0);
    const recentTargets = recentRows.reduce((s, w) => s + w.tgt, 0);
    if (recentSnaps < MIN_RISER_SNAPS) continue;
    if (metric === 'target' && recentTargets < MIN_RISER_TARGETS) continue;
    const recent = mean(recentRows.map(get).filter((x): x is number => x !== null));
    const prior = mean(priorRows.map(get).filter((x): x is number => x !== null));
    if (recent === null || prior === null) continue;
    out.push({
      pid, team: recentRows[recentRows.length - 1]?.team ?? ws[ws.length - 1]!.team, recent, prior, change: recent - prior,
      recentWeeks: recentRows.length, priorWeeks: priorRows.length, recentSnaps, recentTargets,
    });
  }
  return out.filter((r) => r.change > 0).sort((a, b) => b.change - a.change);
}
