/* The live state reducer: both a real poll and a replay feed snapshots into it.

   It keeps the newest snapshot, a bounded history of snapshots (for the win-probability line) and the scoring feed:
   each poll is diffed against the one before, and every starter whose points changed becomes one change ("+6.4 · ja'marr chase").
   Names are not stored here; the page adds them from the model when it draws the feed. Kept in memory for the session. */
import type { LiveSnapshot } from './types.ts';

export const MAX_FRAMES = 600;
export const MAX_CHANGES = 300;
/** a change smaller than this is rounding noise */
export const MIN_DELTA = 0.005;

export interface RawChange {
  id: string;
  /** wall clock of the poll that saw it */
  at: number;
  /** the NFL clock at that poll */
  clock: number;
  rid: number;
  pid: string;
  matchupId: number | null;
  delta: number;
  total: number;
}

export interface LiveState {
  snapshot: LiveSnapshot | null;
  frames: LiveSnapshot[];
  /** newest first */
  changes: RawChange[];
  lastUpdate: number | null;
  failures: number;
  error: string | null;
  polls: number;
}

export const INITIAL_LIVE: LiveState = { snapshot: null, frames: [], changes: [], lastUpdate: null, failures: 0, error: null, polls: 0 };

export type LiveAction =
  | { type: 'polled'; snapshot: LiveSnapshot }
  | { type: 'failed'; message: string }
  | { type: 'reset' };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Starters whose points moved between two snapshots of the same week. */
export function diffSnapshots(prev: LiveSnapshot, next: LiveSnapshot): RawChange[] {
  if (prev.week !== next.week || prev.kind !== next.kind) return [];
  const before = new Map(prev.rows.map((r) => [r.rid, r]));
  const out: RawChange[] = [];
  for (const row of next.rows) {
    const old = before.get(row.rid);
    if (!old) continue;
    row.starters.forEach((pid, i) => {
      if (!pid || pid === '0') return;
      const now = row.startersPoints[i] ?? row.playersPoints[pid] ?? 0;
      const was = old.playersPoints[pid] ?? old.startersPoints[old.starters.indexOf(pid)] ?? 0;
      const delta = r2(now - was);
      if (Math.abs(delta) >= MIN_DELTA) {
        out.push({ id: `${next.at}-${row.rid}-${pid}`, at: next.at, clock: next.clock, rid: row.rid, pid, matchupId: row.matchupId, delta, total: now });
      }
    });
  }
  // biggest plays first within one poll
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'reset': return INITIAL_LIVE;
    case 'failed': return { ...state, failures: state.failures + 1, error: action.message };
    case 'polled': {
      const snap = action.snapshot;
      // a different week or source starts the history over
      const same = state.snapshot && state.snapshot.week === snap.week && state.snapshot.kind === snap.kind;
      const fresh = same ? diffSnapshots(state.snapshot!, snap) : [];
      const frames = (same ? [...state.frames, snap] : [snap]).slice(-MAX_FRAMES);
      return {
        snapshot: snap, frames,
        changes: (same ? [...fresh, ...state.changes] : fresh).slice(0, MAX_CHANGES),
        lastUpdate: snap.at, failures: 0, error: null, polls: state.polls + 1,
      };
    }
  }
}
