/* Live draft assistant helpers. Pure: give them the rankings and the current Sleeper picks list; polling is the UI's job.

   - bestAvailable: players not yet picked, best VOR first, with tier;
   - positionalRuns: the last N picks by position against the rate the pool would predict;
   - myNeeds: starting slots my picks have not filled yet (via the lineup optimizer);
   - pickValues: for each pick made, pick number − ADP (positive = went later than the market expected = a value);
   - picksUntilMyTurn + likelyGone: how far away my next pick is, and who ADP says will be gone by then. */
import type { DraftPick } from '../../data/types.ts';
import { ELIG, optimizeLineup } from '../lineup.ts';
import type { Slot } from '../types.ts';
import { adpSd } from './adp.ts';
import type { PickSlot } from './order.ts';
import type { RankedPlayer, Rankings } from './rankings.ts';

type PickLike = Pick<DraftPick, 'pick_no' | 'player_id' | 'roster_id'>;

export const pickedIds = (picks: readonly Pick<DraftPick, 'player_id'>[]): Set<string> => new Set(picks.map((p) => p.player_id));

/** Highest pick number made so far (picks may arrive out of order). */
export const lastPickNo = (picks: readonly Pick<DraftPick, 'pick_no'>[]): number => picks.reduce((m, p) => Math.max(m, p.pick_no), 0);

export interface BestAvailableOpts { limit?: number; pos?: string }

/** Unpicked players by VOR (ties: projected points), each with its tier and ADP. */
export function bestAvailable(rankings: Rankings, picks: readonly Pick<DraftPick, 'player_id'>[], opts: BestAvailableOpts = {}): RankedPlayer[] {
  const gone = pickedIds(picks);
  const rows = rankings.rows.filter((r) => !gone.has(r.pid) && (!opts.pos || r.pos === opts.pos));
  rows.sort((a, b) => b.vor - a.vor || b.points - a.points || (a.pid < b.pid ? -1 : 1));
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export interface PositionRun {
  pos: string;
  /** picks of this position among the last `window` picks */
  observed: number;
  /** picks the pool predicts for the window (the position's share of the draftable players × window) */
  expected: number;
  /** observed is at least 3 and at least 1.75× expected */
  isRun: boolean;
}

/** Share of each position among the `draftable` best players (by overall rank): what a window of picks should look like. */
export function expectedShares(rankings: Rankings, draftable: number): Record<string, number> {
  const top = rankings.rows.slice(0, Math.max(1, draftable));
  const out: Record<string, number> = {};
  for (const r of top) out[r.pos] = (out[r.pos] ?? 0) + 1 / top.length;
  return out;
}

/** The last `window` picks by position vs the expected rate (draftable = teams × starting slots by default). */
export function positionalRuns(rankings: Rankings, picks: readonly PickLike[], opts: { window?: number; draftable?: number } = {}): PositionRun[] {
  const window = opts.window ?? 8;
  const shares = expectedShares(rankings, opts.draftable ?? rankings.teams * rankings.slots.length * 2);
  const recent = picks.slice().sort((a, b) => a.pick_no - b.pick_no).slice(-window);
  const count: Record<string, number> = {};
  for (const p of recent) { const pos = rankings.byPid[p.player_id]?.pos; if (pos) count[pos] = (count[pos] ?? 0) + 1; }
  return Object.keys(shares).map((pos) => {
    const observed = count[pos] ?? 0, expected = shares[pos]! * recent.length;
    return { pos, observed, expected, isRun: observed >= 3 && observed >= 1.75 * expected };
  }).sort((a, b) => b.observed - a.observed || (a.pos < b.pos ? -1 : 1));
}

export interface Needs {
  /** starting slots no drafted player fills yet (e.g. ['TE', 'FLEX']) */
  openSlots: Slot[];
  /** my picks so far */
  roster: RankedPlayer[];
  /** open slots counted by the positions that could fill them: pos → number of open slots it can fill */
  byPosition: Record<string, number>;
}

/** Starting slots still unfilled by the players this roster has drafted. */
export function myNeeds(rankings: Rankings, picks: readonly PickLike[], rosterId: number): Needs {
  const roster = picks.filter((p) => p.roster_id === rosterId).sort((a, b) => a.pick_no - b.pick_no)
    .map((p) => rankings.byPid[p.player_id]).filter((r): r is RankedPlayer => !!r);
  const L = optimizeLineup(roster, rankings.slots, { value: (p) => p.points });
  const openSlots = L.slots.filter((s) => !s.p).map((s) => s.slot);
  const byPosition: Record<string, number> = {};
  for (const s of openSlots) for (const pos of slotPositions(s)) byPosition[pos] = (byPosition[pos] ?? 0) + 1;
  return { openSlots, roster, byPosition };
}

const slotPositions = (s: string): readonly string[] => ELIG[s] ?? [];

export interface PickValue {
  pickNo: number;
  round: number;
  rosterId: number;
  pid: string;
  name: string;
  pos: string;
  adp: number | null;
  /** pick number − ADP: positive = taken later than the market expected (a value), negative = a reach. null without ADP. */
  value: number | null;
}

/** Value vs ADP for every pick made. Players not in the rankings are listed with their id and no ADP. */
export function pickValues(rankings: Rankings, picks: readonly (PickLike & { round?: number })[]): PickValue[] {
  return picks.slice().sort((a, b) => a.pick_no - b.pick_no).map((p) => {
    const r = rankings.byPid[p.player_id];
    return {
      pickNo: p.pick_no, round: p.round ?? 0, rosterId: p.roster_id ?? 0, pid: p.player_id, name: r?.name ?? p.player_id, pos: r?.pos ?? '',
      adp: r?.adp ?? null, value: r?.adp == null ? null : p.pick_no - r.adp,
    };
  });
}

export interface Turn {
  /** the pick on the clock now (last pick made + 1), null when the draft is over */
  currentPickNo: number | null;
  /** my next pick number, null when I have none left */
  nextPickNo: number | null;
  /** picks made by others before my next one (0 = I am on the clock), null when I have none left */
  picksBetween: number | null;
  /** my remaining pick numbers */
  myPicks: number[];
}

/** Where I am in the order, given the picks made so far. */
export function picksUntilMyTurn(order: readonly PickSlot[], picks: readonly Pick<DraftPick, 'pick_no'>[], rosterId: number): Turn {
  const made = lastPickNo(picks);
  const current = order.find((o) => o.pickNo > made)?.pickNo ?? null;
  const myPicks = order.filter((o) => o.rosterId === rosterId && o.pickNo > made).map((o) => o.pickNo);
  const next = myPicks[0] ?? null;
  return { currentPickNo: current, nextPickNo: next, picksBetween: next == null || current == null ? null : next - current, myPicks };
}

export interface LikelyGone {
  player: RankedPlayer;
  /** chance he is picked before my turn: Φ((my pick − 0.5 − ADP) / sd), sd = 3 + 0.08 × ADP */
  probGone: number;
  /** probGone ≥ 0.5 */
  likely: boolean;
}

const erf = (x: number): number => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
};
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Available players that ADP says are probably gone before pick `nextPickNo`, most likely gone first. Players without ADP are skipped. */
export function likelyGone(rankings: Rankings, picks: readonly Pick<DraftPick, 'player_id'>[], nextPickNo: number, opts: { minProb?: number } = {}): LikelyGone[] {
  const minProb = opts.minProb ?? 0.5;
  const gone = pickedIds(picks);
  const out: LikelyGone[] = [];
  for (const r of rankings.rows) {
    if (gone.has(r.pid) || r.adp == null) continue;
    const probGone = phi((nextPickNo - 0.5 - r.adp) / adpSd(r.adp));
    if (probGone >= minProb) out.push({ player: r, probGone, likely: probGone >= 0.5 });
  }
  return out.sort((a, b) => b.probGone - a.probGone || a.player.rank - b.player.rank);
}

export interface LiveSnapshot {
  pickCount: number;
  best: RankedPlayer[];
  runs: PositionRun[];
  needs: Needs;
  values: PickValue[];
  turn: Turn;
  gone: LikelyGone[];
}

/** Everything the live assistant shows, in one call. */
export function liveSnapshot(args: { rankings: Rankings; order: readonly PickSlot[]; picks: readonly (PickLike & { round?: number })[]; rosterId: number; limit?: number; window?: number }): LiveSnapshot {
  const { rankings, order, picks, rosterId } = args;
  const turn = picksUntilMyTurn(order, picks, rosterId);
  return {
    pickCount: picks.length,
    best: bestAvailable(rankings, picks, { limit: args.limit ?? 10 }),
    runs: positionalRuns(rankings, picks, { window: args.window }),
    needs: myNeeds(rankings, picks, rosterId),
    values: pickValues(rankings, picks),
    turn,
    gone: turn.nextPickNo == null ? [] : likelyGone(rankings, picks, turn.nextPickNo),
  };
}
