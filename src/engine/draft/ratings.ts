/* Team ratings from the rosters as they are right now. Pure: reads the engine model (and, for dynasty leagues, team values).

   REST-OF-SEASON STRENGTH. For each team, the sum over the remaining regular-season weeks (current week through the last regular
   week) of its best lineup's expected points: the model's own teamMeans (`scenario.teamMeans`, what the playoff odds use).
   PLAYOFF-WEEKS STRENGTH is the same sum over the playoff weeks.

   POSITION GROUPS (QB, RB, WR, TE, and FLEX when the league has flex slots). For each remaining week the team's best lineup is
   picked; every starter's expected points go to the group of the *slot* he fills (a WR in a flex slot counts for FLEX). Bench depth
   at QB / RB / WR / TE is the best unstarted player at that position that week ("next man up"). Then
        group score = starters' ROS points + DEPTH_WEIGHT × depth ROS points         (FLEX: starters only; its depth is the bench RB/WR/TE)
   Groups are ranked across the league, and the tier comes from the percentile (teams − rank) ÷ (teams − 1):
        elite ≥ 0.75 · strong ≥ 0.50 · average ≥ 0.25 · thin below.
   Biggest need = the group where the team's score is furthest below the league's (lowest z-score).
   Biggest surplus = the position (not FLEX) where its bench depth is furthest above the league's, if above at all: where depth could be traded.

   POWER RATING (0 to 100) = POWER_WEIGHTS.ros × scaled(ROS strength) + POWER_WEIGHTS.pf × scaled(points scored so far),
   scaled(x) = 100 × (x − league min) ÷ (league max − league min) (50 for everyone when all tie), blend 70 / 30.
   ROS DELTA = standings rank − power rank: positive means the roster is better than the record ("roster says 3rd, record says 9th").
   The standings rank is wins (ties half), then points for, unless the caller passes the page's own ranks.

   DYNASTY leagues add each team's total FantasyCalc value and its youth share when the caller passes them. */
import { ELIG, optimizeLineup } from '../lineup.ts';
import { teamMeans } from '../scenario.ts';
import type { Model, ModelPlayer, Slot } from '../types.ts';

export type GroupKey = 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX';
export const GROUPS: readonly GroupKey[] = ['QB', 'RB', 'WR', 'TE', 'FLEX'];
/** the groups that have a bench depth (a flex slot is filled from the same bench) */
const DEPTH_GROUPS: readonly GroupKey[] = ['QB', 'RB', 'WR', 'TE'];

export type Tier = 'elite' | 'strong' | 'average' | 'thin';

export const POWER_WEIGHTS = { ros: 0.7, pf: 0.3 } as const;
export const DEPTH_WEIGHT = 0.25;
export const TIER_CUTS: ReadonlyArray<[number, Tier]> = [[0.75, 'elite'], [0.5, 'strong'], [0.25, 'average']];

export const groupTier = (percentile: number): Tier => {
  for (const [c, t] of TIER_CUTS) if (percentile >= c) return t;
  return 'thin';
};

export interface GroupRating {
  key: GroupKey;
  /** how many of the league's starting slots feed this group */
  slots: number;
  /** ROS points from the starters in this group's slots */
  starters: number;
  /** ROS points from the best bench player at the position each week (0 for FLEX) */
  depth: number;
  score: number;
  /** 1 = best in the league */
  rank: number;
  percentile: number;
  tier: Tier;
  /** score vs the league mean, in SDs */
  z: number;
  depthZ: number;
}

export interface DynastyFacts { value: number; youthShare: number | null }

export interface TeamRating {
  rid: number;
  team: string;
  manager: string;
  isMe: boolean;
  /** expected points over the remaining regular season */
  rosPts: number;
  rosRank: number;
  /** expected points over the playoff weeks */
  playoffPts: number;
  playoffRank: number;
  wins: number;
  losses: number;
  ties: number;
  /** points scored so far */
  pf: number;
  pfRank: number;
  /** 0 to 100 */
  power: number;
  powerRank: number;
  recordRank: number;
  /** recordRank − powerRank: positive = the roster is better than the record */
  delta: number;
  /** the league's position groups, in GROUPS order (only the groups the league starts) */
  groups: GroupRating[];
  need: GroupKey | null;
  surplus: GroupKey | null;
  dynasty: (DynastyFacts & { valueRank: number; youthRank: number | null }) | null;
}

export interface Ratings {
  /** best power rating first */
  teams: TeamRating[];
  groups: GroupKey[];
  /** remaining regular-season weeks and playoff weeks the sums run over */
  weeks: number[];
  playoffWeeks: number[];
  dynasty: boolean;
}

export interface RatingsInput {
  model: Model;
  /** roster id → total FantasyCalc value and youth share; pass it only for a dynasty league */
  dynasty?: Readonly<Record<number, DynastyFacts>> | null;
  /** roster id → rank in the standings, when the page has its own (default: wins, then points for) */
  recordRank?: Readonly<Record<number, number>> | null;
}

/* ---------- small helpers ---------- */

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
function zOf(xs: readonly number[]): number[] {
  const m = mean(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
  return xs.map((x) => (sd > 1e-9 ? (x - m) / sd : 0));
}
const scale100 = (xs: readonly number[]): number[] => {
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return xs.map((x) => (hi - lo > 1e-9 ? (100 * (x - lo)) / (hi - lo) : 50));
};
/** rank 1 = highest value, ties by roster id */
function ranks(rows: ReadonlyArray<{ rid: number }>, v: (r: { rid: number }, i: number) => number): number[] {
  const order = rows.map((r, i) => ({ rid: r.rid, v: v(r, i), i })).sort((a, b) => b.v - a.v || a.rid - b.rid);
  const out = new Array<number>(rows.length).fill(0);
  order.forEach((o, k) => { out[o.i] = k + 1; });
  return out;
}

const groupOfSlot = (s: Slot): GroupKey | null => {
  if (s === 'QB' || s === 'RB' || s === 'WR' || s === 'TE') return s;
  const el = ELIG[s];
  // a flex slot of any kind that holds offensive players (IDP flex and K / DEF are not rated)
  return el && el.length > 1 && el.every((p) => p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE') ? 'FLEX' : null;
};

interface GroupSums { starters: Record<GroupKey, number>; depth: Record<GroupKey, number> }

/** A team's starters' and bench depth ROS points by group, week by week, with the model's IR rule. */
function groupSums(model: Model, rid: number, weeks: readonly number[]): GroupSums {
  const cur = model.meta.currentWeek;
  const starters = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0 } as Record<GroupKey, number>;
  const depth = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0 } as Record<GroupKey, number>;
  const mine = model.players.filter((p) => p.ownerRid === rid);
  for (const w of weeks) {
    const avail: ModelPlayer[] = mine.filter((p) => !p.onIr || w >= cur + 4);
    const L = optimizeLineup(avail, model.meta.slots, { value: (p) => p.mu[w] || 0 });
    for (const s of L.slots) {
      const g = groupOfSlot(s.slot);
      if (g && s.p) starters[g] += s.p.mu[w] || 0;
    }
    for (const g of DEPTH_GROUPS) {
      const next = L.bench.find((p) => p.pos === g);
      if (next) depth[g] += next.mu[w] || 0;
    }
  }
  return { starters, depth };
}

/* ---------- the ratings ---------- */

export function rateTeams(input: RatingsInput): Ratings {
  const { model } = input;
  const { currentWeek: cur, lastRegularWeek: last, playoffWeeks } = model.meta;
  const weeks: number[] = [];
  for (let w = cur; w <= last; w++) weeks.push(w);
  const means = teamMeans(model);
  const teams = model.teams;
  const sum = (rid: number, ws: readonly number[]) => ws.reduce((s, w) => s + (means[rid]?.[w] ?? 0), 0);

  const rosPts = teams.map((t) => sum(t.rid, weeks));
  const playoffPts = teams.map((t) => sum(t.rid, playoffWeeks));
  const pfs = teams.map((t) => t.pf);
  const rosScaled = scale100(rosPts), pfScaled = scale100(pfs);
  const power = teams.map((_, i) => POWER_WEIGHTS.ros * rosScaled[i]! + POWER_WEIGHTS.pf * pfScaled[i]!);
  const rosRank = ranks(teams, (_, i) => rosPts[i]!);
  const playoffRank = ranks(teams, (_, i) => playoffPts[i]!);
  const pfRank = ranks(teams, (_, i) => pfs[i]!);
  const powerRank = ranks(teams, (_, i) => power[i]!);
  const recordRankOwn = ranks(teams, (_, i) => teams[i]!.wins + 0.5 * teams[i]!.ties + teams[i]!.pf / 1e7);
  // wins first (ties half), points for only breaks ties: pf / 1e7 stays below the 0.5 step

  // position groups
  const present = GROUPS.filter((g) => model.meta.slots.some((s) => groupOfSlot(s) === g));
  const slotCount = (g: GroupKey) => model.meta.slots.filter((s) => groupOfSlot(s) === g).length;
  const sums = teams.map((t) => groupSums(model, t.rid, weeks));
  const byGroup = new Map<GroupKey, GroupRating[]>();
  for (const g of present) {
    const score = sums.map((s) => s.starters[g] + (g === 'FLEX' ? 0 : DEPTH_WEIGHT * s.depth[g]));
    const z = zOf(score), dz = zOf(sums.map((s) => s.depth[g]));
    const rk = ranks(teams, (_, i) => score[i]!);
    byGroup.set(g, teams.map((_, i) => {
      const percentile = teams.length > 1 ? (teams.length - rk[i]!) / (teams.length - 1) : 1;
      return {
        key: g, slots: slotCount(g), starters: sums[i]!.starters[g], depth: sums[i]!.depth[g], score: score[i]!, rank: rk[i]!, percentile,
        tier: groupTier(percentile), z: z[i]!, depthZ: dz[i]!,
      };
    }));
  }

  // dynasty
  const dyn = input.dynasty ?? null;
  const valueRank = dyn ? ranks(teams, (t) => dyn[t.rid]?.value ?? 0) : [];
  const youthVals = dyn ? teams.map((t) => dyn[t.rid]?.youthShare ?? null) : [];
  const youthOrder = dyn
    ? teams.map((t, i) => ({ rid: t.rid, i, v: youthVals[i] })).filter((x): x is { rid: number; i: number; v: number } => x.v !== null).sort((a, b) => b.v - a.v || a.rid - b.rid)
    : [];
  const youthRank = new Map(youthOrder.map((x, k) => [x.i, k + 1]));

  const rows: TeamRating[] = teams.map((t, i) => {
    const groups = present.map((g) => byGroup.get(g)![i]!);
    let need: GroupRating | null = null;
    for (const g of groups) if (!need || g.z < need.z - 1e-9) need = g;
    let surplus: GroupRating | null = null;
    for (const g of groups) {
      if (g.key === 'FLEX' || g.key === need?.key || g.depthZ <= 0 || g.depth <= 0) continue;
      if (!surplus || g.depthZ > surplus.depthZ) surplus = g;
    }
    const recordRank = input.recordRank?.[t.rid] ?? recordRankOwn[i]!;
    return {
      rid: t.rid, team: t.team, manager: t.manager, isMe: t.rid === model.meRid,
      rosPts: rosPts[i]!, rosRank: rosRank[i]!, playoffPts: playoffPts[i]!, playoffRank: playoffRank[i]!,
      wins: t.wins, losses: t.losses, ties: t.ties, pf: t.pf, pfRank: pfRank[i]!,
      power: power[i]!, powerRank: powerRank[i]!, recordRank, delta: recordRank - powerRank[i]!,
      groups, need: need?.key ?? null, surplus: surplus?.key ?? null,
      dynasty: dyn && dyn[t.rid] ? { ...dyn[t.rid]!, valueRank: valueRank[i]!, youthRank: youthRank.get(i) ?? null } : null,
    };
  });
  rows.sort((a, b) => a.powerRank - b.powerRank);
  return { teams: rows, groups: present, weeks, playoffWeeks: [...playoffWeeks], dynasty: !!dyn };
}
