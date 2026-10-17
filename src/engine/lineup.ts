/* Lineup optimizer (port of lineup() in reference/ff_live.js).

   Greedy, in this order:
     1. locked starters (a current-week starter whose game kicked off stays in his slot),
     2. pinned players ("always start"), each into the first open slot he fits,
     3. fixed single-position slots, then flex slots from most to least restrictive,
        each taking the best remaining candidate by value.
   Benched players ("never start") are skipped in step 3. Filling fixed slots first means a flex-eligible
   player can never steal the only candidate a fixed slot has. */
import type { Pos, Slot } from './types.ts';

/** Which positions may fill each slot. */
export const ELIG: Record<string, readonly string[]> = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], K: ['K'], DEF: ['DEF'], DL: ['DL'], LB: ['LB'], DB: ['DB'],
  FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'], REC_FLEX: ['WR', 'TE'], WRRB_FLEX: ['RB', 'WR'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
};

export const OFFENSE_POS: Pos[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const IDP_POS: Pos[] = ['DL', 'LB', 'DB'];
export const POS_ORDER: Pos[] = [...OFFENSE_POS, ...IDP_POS];

/** Display labels the reference uses for the long flex names. */
export const SLOT_LABEL: Record<string, string> = { SUPER_FLEX: 'SFLEX', REC_FLEX: 'W/T', WRRB_FLEX: 'W/R', IDP_FLEX: 'IDP' };

export const isLineupSlot = (s: string): s is Slot => s in ELIG;
/** roster_positions → the starting slots the engine understands (drops BN, IR, TAXI, unknown) */
export const startingSlots = (rosterPositions: readonly string[] | null | undefined): Slot[] =>
  (rosterPositions ?? []).filter(isLineupSlot);

export const fits = (slot: string, pos: string): boolean => (ELIG[slot] ?? []).includes(pos);

/** Indexes into `slots` in fill order: fixed single-position slots, then flex slots most → least restrictive. */
export function fillOrder(slots: readonly string[]): number[] {
  const idx = slots.map((_, i) => i);
  const fixed = idx.filter((i) => (ELIG[slots[i]!]?.length ?? 0) === 1);
  const flex = idx.filter((i) => (ELIG[slots[i]!]?.length ?? 0) > 1).sort((a, b) => ELIG[slots[a]!]!.length - ELIG[slots[b]!]!.length);
  return fixed.concat(flex);
}

export interface LineupPlayerLike { pid: string; pos: string }

export interface LineupOptions<P extends LineupPlayerLike> {
  /** value of a player for this week */
  value: (p: P) => number;
  /** per-slot (aligned with `slots`) players whose game kicked off; they keep their slot */
  locked?: ReadonlyArray<P | null | undefined>;
  /** players who may not be chosen (the reference excludes this week's already-played players from the open pool) */
  unavailable?: (p: P) => boolean;
  /** "always start" (only used while value > 0) */
  pins?: ReadonlySet<string>;
  /** "never start" */
  benches?: ReadonlySet<string>;
}

export interface LineupSlot<P> { slot: Slot; p: P | null; locked: boolean }
export interface LineupResult<P> {
  total: number;
  slots: Array<LineupSlot<P>>;
  /** everyone not in a slot, best first */
  bench: P[];
}

export function optimizeLineup<P extends LineupPlayerLike>(players: readonly P[], slotNames: readonly Slot[], opt: LineupOptions<P>): LineupResult<P> {
  const v = opt.value;
  const slots: Array<LineupSlot<P>> = slotNames.map((slot) => ({ slot, p: null, locked: false }));
  const order = fillOrder(slotNames).map((i) => slots[i]!);
  const used = new Set<string>();
  if (opt.locked) {
    opt.locked.forEach((p, i) => {
      if (p && slots[i]) { slots[i].p = p; slots[i].locked = true; used.add(p.pid); }
    });
  }
  const unavailable = opt.unavailable;
  const avail = players.filter((p) => !used.has(p.pid) && !(unavailable && unavailable(p)));
  const pins = opt.pins, benches = opt.benches;
  const put = (p: P) => {
    const s = order.find((x) => !x.p && fits(x.slot, p.pos));
    if (s) { s.p = p; used.add(p.pid); }
  };
  if (pins && pins.size) avail.filter((p) => pins.has(p.pid) && v(p) > 0).sort((a, b) => v(b) - v(a)).forEach(put);
  const cand = avail.filter((p) => !used.has(p.pid) && !(benches && benches.has(p.pid))).sort((a, b) => v(b) - v(a));
  for (const s of order) {
    if (s.p) continue;
    const q = cand.find((p) => fits(s.slot, p.pos) && !used.has(p.pid));
    if (q) { s.p = q; used.add(q.pid); }
  }
  let total = 0;
  for (const s of slots) if (s.p) total += v(s.p);
  const bench = players.filter((p) => !used.has(p.pid)).sort((a, b) => v(b) - v(a));
  return { total, slots, bench };
}

/** Best total and the set of starters, with no locks/pins/benches (the model-build fast path, `bestSet` in sleeper_live.js). */
export function bestSet<P extends LineupPlayerLike>(players: readonly P[], slotNames: readonly Slot[], value: (p: P) => number): { total: number; used: Set<string> } {
  const used = new Set<string>();
  let total = 0;
  const cand = players.slice().sort((a, b) => value(b) - value(a));
  for (const i of fillOrder(slotNames)) {
    const s = slotNames[i]!;
    const p = cand.find((x) => !used.has(x.pid) && fits(s, x.pos));
    if (p) { used.add(p.pid); total += value(p); }
  }
  return { total, used };
}

export const bestTotal = <P extends LineupPlayerLike>(players: readonly P[], slotNames: readonly Slot[], value: (p: P) => number): number =>
  bestSet(players, slotNames, value).total;
