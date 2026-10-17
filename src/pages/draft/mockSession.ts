/* A mock draft as data: a seed, a slot and the log of every pick made. The engine's mock is deterministic, so the log
   rebuilds the exact same draft (that is how a saved mock is restored and how undo works). */
import { createMock, optimizeLineup, SLOT_LABEL } from '../../engine';
import type { DraftMode, Mock, PickSlot, RankedPlayer, Rankings } from '../../engine';

/** [player id, 1 when the user picked, 0 when the bots did] */
export type LogEntry = [string, 0 | 1];

export interface MockSetup {
  rankings: Rankings;
  order: PickSlot[];
  userRosterId: number;
  seed: number;
}

/** Rebuild a mock from its log. Throws when the log does not fit (a player gone from the pool, a pick that is not yours). */
export function replayLog(setup: MockSetup, log: readonly LogEntry[]): Mock {
  const mock = createMock({ rankings: setup.rankings, order: setup.order, userRosterId: setup.userRosterId, seed: setup.seed });
  for (const [pid, byUser] of log) {
    if (byUser) {
      mock.pick(pid);
    } else {
      const made = mock.autoPick();
      if (made.pid !== pid) throw new Error('the saved mock no longer matches the rankings');
    }
  }
  return mock;
}

/** The log up to (not including) the user's last pick, or null when the user has not picked yet. */
export function logBeforeLastUserPick(log: readonly LogEntry[], order: readonly PickSlot[], userRosterId: number): LogEntry[] | null {
  for (let i = log.length - 1; i >= 0; i--) if (order[i]?.rosterId === userRosterId) return log.slice(0, i);
  return null;
}

/* ---------- saved in localStorage ---------- */

export const mockKey = (leagueId: string) => `wr.mock.${leagueId}`;

export interface SavedMock {
  v: 1;
  mode: DraftMode;
  slot: number;
  seed: number;
  teams: number;
  rounds: number;
  log: LogEntry[];
  at: number;
}

export function readSavedMock(leagueId: string): SavedMock | null {
  try {
    const raw = window.localStorage.getItem(mockKey(leagueId));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedMock> | null;
    if (!v || v.v !== 1 || typeof v.slot !== 'number' || typeof v.seed !== 'number' || !Array.isArray(v.log)) return null;
    const log = v.log.filter((e): e is LogEntry => Array.isArray(e) && typeof e[0] === 'string' && (e[1] === 0 || e[1] === 1));
    if (log.length !== v.log.length) return null;
    return { v: 1, mode: v.mode as DraftMode, slot: v.slot, seed: v.seed, teams: Number(v.teams), rounds: Number(v.rounds), log, at: Number(v.at) || 0 };
  } catch {
    return null;
  }
}

export function writeSavedMock(leagueId: string, saved: SavedMock): void {
  try { window.localStorage.setItem(mockKey(leagueId), JSON.stringify(saved)); } catch { /* storage unavailable: the mock lives until the page closes */ }
}

export function clearSavedMock(leagueId: string): void {
  try { window.localStorage.removeItem(mockKey(leagueId)); } catch { /* storage unavailable */ }
}

/* ---------- the grade card's numbers ---------- */

export interface PositionLine {
  /** QB, RB, WR, TE, FLEX, K, DEF ... (slots of the same kind add up) */
  label: string;
  mine: number;
  median: number;
}

const medianOf = (xs: number[]): number => {
  if (!xs.length) return 0;
  const a = xs.slice().sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/** Each team's starting lineup (by projected points) summed per slot kind: mine against the league median. */
export function lineupVsMedian(rosters: Record<number, readonly RankedPlayer[]>, rankings: Rankings, myRosterId: number): PositionLine[] {
  const labels: string[] = [];
  const perTeam: Array<{ rid: number; by: Record<string, number> }> = [];
  for (const [rid, ps] of Object.entries(rosters)) {
    const lineup = optimizeLineup(ps, rankings.slots, { value: (p) => p.points });
    const by: Record<string, number> = {};
    for (const s of lineup.slots) {
      const label = SLOT_LABEL[s.slot] ?? s.slot;
      if (!labels.includes(label)) labels.push(label);
      by[label] = (by[label] ?? 0) + (s.p?.points ?? 0);
    }
    perTeam.push({ rid: Number(rid), by });
  }
  const me = perTeam.find((t) => t.rid === myRosterId);
  return labels.map((label) => ({ label, mine: me?.by[label] ?? 0, median: medianOf(perTeam.map((t) => t.by[label] ?? 0)) }));
}
