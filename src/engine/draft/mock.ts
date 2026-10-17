/* Mock draft: a stepwise, fully deterministic state machine.

     const mock = createMock({ rankings, order, userRosterId, seed });
     mock.autoUntilUser();            // bots draft until it is your turn
     mock.pick(pid);                  // you pick (only on your own pick)
     mock.state                       // picks so far, who is on the clock, rosters, grade when complete

   The order comes from order.ts, so the user picks at the real slot (including traded picks). Bots draft by ADP plus
   seeded noise (SD = 3 + 0.08 × ADP) plus roster need:
     - a player without ADP is priced at 200 + his overall rank;
     - a position already filled to its starter count (fixed slots + flex slots that can hold it) is penalised
       (+30, then +60 for each further player), and K / DEF beyond the number of K / DEF slots are never taken;
     - K and DEF are not taken before the last 3 rounds;
     - when a team has as many picks left as empty starting slots, it may only take players that fill one, so every
       team ends with a full starting lineup.
   The end grade compares each team's projected starting lineup (optimizeLineup on season points). */
import { mulberry32 } from '../sim.ts';
import { ELIG, optimizeLineup } from '../lineup.ts';
import type { Slot } from '../types.ts';
import { adpSd } from './adp.ts';
import type { PickSlot } from './order.ts';
import type { RankedPlayer, Rankings } from './rankings.ts';

export interface MockConfig {
  rankings: Rankings;
  /** pick order, from buildDraftOrder / draftOrderFor */
  order: PickSlot[];
  /** the roster the human drafts for */
  userRosterId: number;
  /** PRNG seed (default 20261016) */
  seed?: number;
  /** extra noise multiplier for bots (default 1; 0 = pure ADP order) */
  noise?: number;
}

export interface MockPick extends PickSlot {
  pid: string;
  byUser: boolean;
}

export interface MockGrade {
  rosterId: number;
  /** projected season points of the best starting lineup */
  total: number;
  /** 1 = best lineup in the league */
  rank: number;
  teams: number;
  /** points above (+) or below (−) the median team's lineup */
  vsMedian: number;
  /** letter grade from the rank percentile */
  letter: string;
  /** (teams − rank) / (teams − 1) */
  percentile: number;
  /** every team's lineup total, best first */
  table: Array<{ rosterId: number; total: number; rank: number }>;
}

export interface MockState {
  picks: MockPick[];
  /** the pick on the clock, null when complete */
  next: PickSlot | null;
  /** it is the user's turn */
  userOnClock: boolean;
  complete: boolean;
  userRosterId: number;
  /** roster id → picked player ids in order */
  rosters: Record<number, string[]>;
  /** grade of the user's draft, only when complete */
  grade: MockGrade | null;
}

export interface Mock {
  readonly state: MockState;
  /** Users picks `pid` on their own pick. Throws if it is not their turn or the player is unavailable. */
  pick(pid: string): MockPick;
  /** Bots pick for the team on the clock (even the user's; handy for sim-to-end). */
  autoPick(): MockPick;
  /** Bots draft until it is the user's turn (or the draft ends). Returns the picks made. */
  autoUntilUser(): MockPick[];
  /** Everyone, including the user, drafts by the bot logic until the end. */
  autoAll(): MockPick[];
  /** players still available, best overall rank first */
  available(): RankedPlayer[];
  /** a team's players so far */
  roster(rosterId: number): RankedPlayer[];
  /** grade for any roster at any time (final once complete) */
  grade(rosterId?: number): MockGrade;
}

export const LATE_ROUNDS = 3;

export function letterGrade(percentile: number): string {
  const cuts: Array<[number, string]> = [[0.9, 'A'], [0.8, 'A-'], [0.7, 'B+'], [0.6, 'B'], [0.5, 'B-'], [0.4, 'C+'], [0.3, 'C'], [0.2, 'C-'], [0.1, 'D']];
  for (const [c, l] of cuts) if (percentile >= c) return l;
  return 'F';
}

const median = (xs: number[]) => {
  const a = xs.slice().sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/** Grade every roster by its best projected starting lineup. */
export function gradeRosters(rosters: Record<number, readonly RankedPlayer[]>, slots: readonly Slot[], userRosterId: number): MockGrade {
  const totals = Object.entries(rosters).map(([rid, ps]) => ({ rosterId: Number(rid), total: optimizeLineup(ps, slots, { value: (p) => p.points }).total }));
  totals.sort((a, b) => b.total - a.total || a.rosterId - b.rosterId);
  const table = totals.map((t, i) => ({ ...t, rank: i + 1 }));
  const me = table.find((t) => t.rosterId === userRosterId) ?? { rosterId: userRosterId, total: 0, rank: table.length };
  const teams = table.length;
  const percentile = teams > 1 ? (teams - me.rank) / (teams - 1) : 1;
  return { rosterId: userRosterId, total: me.total, rank: me.rank, teams, vsMedian: me.total - median(table.map((t) => t.total)), letter: letterGrade(percentile), percentile, table };
}

export function createMock(cfg: MockConfig): Mock {
  const { rankings, order } = cfg;
  const slots = rankings.slots;
  const rng = mulberry32(cfg.seed ?? 20261016);
  let spare: number | null = null;
  const gauss = () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = rng();
    const v = rng(), m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  const noise = cfg.noise ?? 1;
  const rounds = order.length ? order[order.length - 1]!.round : 0;
  const rosterIds = [...new Set(order.map((o) => o.rosterId).concat(order.map((o) => o.originalRosterId)))];
  const picks: MockPick[] = [];
  const rosters: Record<number, RankedPlayer[]> = {};
  for (const rid of rosterIds) rosters[rid] = [];
  const taken = new Set<string>();
  const pool = rankings.rows.slice();

  // starters per position a team can hold (fixed slots + every flex slot that can hold it) and fixed K/DEF-style counts
  const fixedCount: Record<string, number> = {}, cap: Record<string, number> = {};
  for (const s of slots) {
    const el = ELIG[s]!;
    if (el.length === 1) fixedCount[s] = (fixedCount[s] ?? 0) + 1;
    for (const p of el) cap[p] = (cap[p] ?? 0) + 1;
  }

  const emptySlots = (ps: readonly RankedPlayer[]) => optimizeLineup(ps, slots, { value: () => 1 }).slots.filter((s) => !s.p).length;

  function choose(rosterId: number, round: number, picksLeft: number): RankedPlayer {
    const mine = rosters[rosterId]!;
    const count: Record<string, number> = {};
    for (const p of mine) count[p.pos] = (count[p.pos] ?? 0) + 1;
    const avail = pool.filter((p) => !taken.has(p.pid));
    const empty = emptySlots(mine);
    const mustFill = picksLeft <= empty;
    const late = round > rounds - LATE_ROUNDS;
    const priced = (p: RankedPlayer) => p.adp ?? 200 + p.rank;
    let cands = avail.slice().sort((a, b) => priced(a) - priced(b)).slice(0, 60);
    const allowed = (p: RankedPlayer) => {
      if ((cap[p.pos] ?? 0) === 0) return false;
      if ((p.pos === 'K' || p.pos === 'DEF') && ((count[p.pos] ?? 0) >= (fixedCount[p.pos] ?? 0) || (!late && !mustFill))) return false;
      return true;
    };
    cands = cands.filter(allowed);
    if (mustFill) {
      const filling = (p: RankedPlayer) => emptySlots([...mine, p]) < empty;
      let f = cands.filter(filling);
      if (!f.length) f = avail.filter(allowed).filter(filling);
      if (f.length) cands = f;
    }
    if (!cands.length) cands = avail.filter(allowed);
    if (!cands.length) cands = avail;
    let best = cands[0]!, bestScore = Infinity;
    for (const p of cands) {
      const adp = priced(p);
      let s = adp + noise * adpSd(adp) * gauss();
      const over = (count[p.pos] ?? 0) - (cap[p.pos] ?? 0) + 1;
      if (over > 0) s += 30 + 60 * (over - 1);
      if (s < bestScore) { bestScore = s; best = p; }
    }
    return best;
  }

  const state = (): MockState => {
    const next = order[picks.length] ?? null;
    const complete = picks.length >= order.length;
    const r: Record<number, string[]> = {};
    for (const [rid, ps] of Object.entries(rosters)) r[Number(rid)] = ps.map((p) => p.pid);
    return {
      picks: picks.slice(), next, userOnClock: !!next && next.rosterId === cfg.userRosterId, complete, userRosterId: cfg.userRosterId, rosters: r,
      grade: complete ? gradeRosters(rosters, slots, cfg.userRosterId) : null,
    };
  };

  function record(slot: PickSlot, p: RankedPlayer, byUser: boolean): MockPick {
    taken.add(p.pid);
    rosters[slot.rosterId]!.push(p);
    const mp: MockPick = { ...slot, pid: p.pid, byUser };
    picks.push(mp);
    return mp;
  }
  function autoPick(): MockPick {
    const slot = order[picks.length];
    if (!slot) throw new Error('The draft is complete');
    const picksLeft = order.filter((o) => o.pickNo >= slot.pickNo && o.rosterId === slot.rosterId).length;
    return record(slot, choose(slot.rosterId, slot.round, picksLeft), false);
  }

  return {
    get state() { return state(); },
    pick(pid) {
      const slot = order[picks.length];
      if (!slot) throw new Error('The draft is complete');
      if (slot.rosterId !== cfg.userRosterId) throw new Error(`It is not your turn (pick ${slot.pickNo} belongs to roster ${slot.rosterId})`);
      const p = rankings.byPid[pid];
      if (!p) throw new Error(`Unknown player ${pid}`);
      if (taken.has(pid)) throw new Error(`${p.name} has already been drafted`);
      return record(slot, p, true);
    },
    autoPick,
    autoUntilUser() {
      const made: MockPick[] = [];
      while (picks.length < order.length && order[picks.length]!.rosterId !== cfg.userRosterId) made.push(autoPick());
      return made;
    },
    autoAll() {
      const made: MockPick[] = [];
      while (picks.length < order.length) made.push(autoPick());
      return made;
    },
    available: () => pool.filter((p) => !taken.has(p.pid)),
    roster: (rid) => (rosters[rid] ?? []).slice(),
    grade: (rid = cfg.userRosterId) => gradeRosters(rosters, slots, rid),
  };
}

