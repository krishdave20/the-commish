/* Draft rankings: season projections scored with the league's settings → value over replacement (VOR) from the
   league's starting slots → tiers by natural gaps → ADP and value vs ADP.

   REPLACEMENT LEVEL. Fixed slots first: the league starts `teams × slots` players at each single-position slot, so the
   top that many players at the position are "starters". Then flex slots are filled the way a league actually fills
   them: most restrictive slot first (REC_FLEX, WRRB_FLEX, FLEX, IDP_FLEX, then SUPER_FLEX), each taking the best
   remaining eligible players by projected points across all positions, `teams × count` of them. A position's number
   of starters N is its fixed count plus the flex players it won. Replacement level at a position is the N-th best
   projection there (the last starter, so he is worth 0 VOR). VOR = projected points − replacement. Positions with no
   starting slot (N = 0) are not ranked.

   TIERS (assignTiers). Within a position's list sorted by VOR (descending), let g[i] be the gap between player i and
   i+1. A new tier starts after player i when the gap is large relative to its neighbourhood:
        g[i] ≥ 1.5 × mean(g[j] for j in i−4..i+4, j ≠ i)   and   g[i] ≥ 3% of the list's full range (top − bottom).
   The second condition keeps noise in the long tail from creating tiers; lists of fewer than 3 players are one tier.
   Equal values never split. Tier numbers are per position, starting at 1.

   BLENDING. In startup and rookie dynasty drafts, when FantasyCalc values are supplied, the overall rank is the
   average of the VOR rank and the FantasyCalc rank among the same players (fcWeight 0.5); players without a
   FantasyCalc value keep their VOR rank. In redraft the overall rank is simply VOR order. */
import type { ProjectionRow, PlayersMap } from '../../data/types.ts';
import { makeScorer } from '../model.ts';
import { ELIG, POS_ORDER, startingSlots } from '../lineup.ts';
import type { Pos, Slot } from '../types.ts';
import { adpFieldFor, adpField, inferDraftMode, readAdp, type DraftMode, type LeagueLike } from './adp.ts';
import type { FcEntry } from './fantasycalc.ts';

export interface RankedPlayer {
  pid: string;
  name: string;
  pos: Pos;
  team: string | null;
  /** NFL years of experience (0 = rookie), null when unknown */
  yearsExp: number | null;
  rookie: boolean;
  /** projected season points with the league's scoring */
  points: number;
  /** points above the position's replacement level */
  vor: number;
  /** overall rank (1 = best) */
  rank: number;
  /** rank within the position, by projected points */
  posRank: number;
  /** tier within the position, 1 = top */
  tier: number;
  /** average draft position for this league format, null when Sleeper has none */
  adp: number | null;
  /** adp − rank: positive = our rank is earlier than the market's (a value), negative = the market likes him more */
  valueVsAdp: number | null;
  /** FantasyCalc trade value etc., when supplied */
  fc: FcEntry | null;
}

export interface Rankings {
  mode: DraftMode;
  adpField: string;
  teams: number;
  slots: Slot[];
  /** replacement-level projected points by position */
  replacement: Record<string, number>;
  /** league-wide starters by position (fixed slots + flex won) */
  starters: Record<string, number>;
  rows: RankedPlayer[];
  /** pid → row */
  byPid: Record<string, RankedPlayer>;
}

export interface RankingsInput {
  /** Sleeper season projections (`sleeper.seasonProjections(season)`) */
  projections: readonly ProjectionRow[];
  league: LeagueLike;
  /** default: inferred from the league */
  mode?: DraftMode;
  /** the /players/nfl map, for `years_exp` (otherwise the projection row's embedded player is used) */
  players?: PlayersMap | null;
  /** FantasyCalc entries by Sleeper id (see fantasycalc.ts) */
  fantasyCalc?: Readonly<Record<string, FcEntry>> | null;
  /** weight of FantasyCalc in the blended rank (default 0.5) */
  fcWeight?: number;
  /** number of teams (default league.total_rosters, else settings.num_teams, else 12) */
  teams?: number;
}

export const teamsOf = (league: LeagueLike, override?: number): number =>
  override ?? league.total_rosters ?? (league.settings?.num_teams as number | undefined) ?? 12;

/* ---------- replacement level ---------- */

export interface PoolPlayer { pid: string; pos: string; points: number }

export interface Replacement {
  replacement: Record<string, number>;
  starters: Record<string, number>;
}

/** Replacement levels for a pool and slot configuration (see the file header). */
export function replacementLevels(pool: readonly PoolPlayer[], slots: readonly Slot[], teams: number): Replacement {
  const byPos: Record<string, PoolPlayer[]> = {};
  for (const p of pool) (byPos[p.pos] = byPos[p.pos] || []).push(p);
  for (const list of Object.values(byPos)) list.sort((a, b) => b.points - a.points || (a.pid < b.pid ? -1 : 1));

  const starters: Record<string, number> = {};
  const taken = new Set<string>();
  // fixed single-position slots
  const fixed: Record<string, number> = {};
  for (const s of slots) if ((ELIG[s]?.length ?? 0) === 1) fixed[s] = (fixed[s] ?? 0) + 1;
  for (const [pos, n] of Object.entries(fixed)) {
    const k = teams * n;
    starters[pos] = k;
    for (const p of (byPos[pos] ?? []).slice(0, k)) taken.add(p.pid);
  }
  // flex slots, most restrictive first, best remaining eligible by points
  const flexCounts: Record<string, number> = {};
  for (const s of slots) if ((ELIG[s]?.length ?? 0) > 1) flexCounts[s] = (flexCounts[s] ?? 0) + 1;
  const flexOrder = Object.keys(flexCounts).sort((a, b) => ELIG[a]!.length - ELIG[b]!.length);
  const rest = pool.filter((p) => !taken.has(p.pid)).sort((a, b) => b.points - a.points || (a.pid < b.pid ? -1 : 1));
  for (const f of flexOrder) {
    const elig = ELIG[f]!;
    let need = teams * flexCounts[f]!;
    for (const p of rest) {
      if (need <= 0) break;
      if (taken.has(p.pid) || !elig.includes(p.pos)) continue;
      taken.add(p.pid);
      starters[p.pos] = (starters[p.pos] ?? 0) + 1;
      need--;
    }
  }
  const replacement: Record<string, number> = {};
  for (const [pos, n] of Object.entries(starters)) {
    const list = byPos[pos] ?? [];
    if (n > 0 && list.length) replacement[pos] = list[Math.min(n, list.length) - 1]!.points;
  }
  return { replacement, starters };
}

/* ---------- tiers ---------- */

export const TIER_WINDOW = 4;
export const TIER_GAP_FACTOR = 1.5;
export const TIER_MIN_RANGE_SHARE = 0.03;

/** Tier numbers (1-based) for values sorted descending, by the natural-gap rule in the file header. */
export function assignTiers(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const tiers = new Array<number>(n).fill(1);
  if (n < 3) return tiers;
  const gaps: number[] = [];
  for (let i = 0; i < n - 1; i++) gaps.push(Math.max(0, values[i]! - values[i + 1]!));
  const minGap = TIER_MIN_RANGE_SHARE * (values[0]! - values[n - 1]!);
  let tier = 1;
  for (let i = 0; i < n - 1; i++) {
    tiers[i] = tier;
    const lo = Math.max(0, i - TIER_WINDOW), hi = Math.min(gaps.length - 1, i + TIER_WINDOW);
    let sum = 0, cnt = 0;
    for (let j = lo; j <= hi; j++) if (j !== i) { sum += gaps[j]!; cnt++; }
    const local = cnt ? sum / cnt : 0;
    const g = gaps[i]!;
    if (g > 0 && g >= minGap && g >= TIER_GAP_FACTOR * local) tier++;
  }
  tiers[n - 1] = tier;
  return tiers;
}

/* ---------- rankings ---------- */

const POS_SET = new Set<string>(POS_ORDER);
const nameOf = (r: ProjectionRow): string => {
  const pl = r.player;
  if (pl?.position === 'DEF' || (!pl && /^[A-Z]{2,3}$/.test(r.player_id))) return `${r.player_id} D/ST`;
  return `${pl?.first_name ?? ''} ${pl?.last_name ?? ''}`.trim() || r.player_id;
};

export function buildRankings(input: RankingsInput): Rankings {
  const { league } = input;
  const mode = input.mode ?? inferDraftMode(league);
  const teams = teamsOf(league, input.teams);
  const slots = startingSlots(league.roster_positions);
  const score = makeScorer(league.scoring_settings ?? {});
  const field = adpField(league, mode);
  const fcWeight = input.fcWeight ?? 0.5;

  interface Base { row: ProjectionRow; pos: Pos; points: number }
  const seen = new Set<string>();
  const base: Base[] = [];
  for (const r of input.projections) {
    if (seen.has(r.player_id)) continue;
    const pos = (r.player?.position ?? (/^[A-Z]{2,3}$/.test(r.player_id) ? 'DEF' : null)) as Pos | null;
    if (!pos || !POS_SET.has(pos)) continue;
    const points = score(r.stats);
    if (!(points > 0)) continue;
    seen.add(r.player_id);
    base.push({ row: r, pos, points });
  }

  const { replacement, starters } = replacementLevels(base.map((b) => ({ pid: b.row.player_id, pos: b.pos, points: b.points })), slots, teams);
  const adpOf = (b: Base) => readAdp(b.row.stats, adpFieldFor(b.pos, league, mode));

  let rows: Omit<RankedPlayer, 'rank' | 'posRank' | 'tier' | 'valueVsAdp'>[] = base
    .filter((b) => replacement[b.pos] != null)
    .map((b) => {
      const pid = b.row.player_id;
      const yearsExp = (input.players?.[pid]?.years_exp as number | undefined) ?? (b.row.player?.years_exp as number | undefined) ?? null;
      const adp = adpOf(b);
      const rookie = yearsExp === 0 || readAdp(b.row.stats, 'adp_rookie') != null;
      return {
        pid, name: nameOf(b.row), pos: b.pos, team: b.row.player?.team ?? b.row.team ?? null, yearsExp, rookie,
        points: b.points, vor: b.points - replacement[b.pos]!, adp, fc: input.fantasyCalc?.[pid] ?? null,
      };
    });
  if (mode === 'rookie') rows = rows.filter((r) => r.rookie);

  // overall order: VOR, or the VOR/FantasyCalc blend for dynasty drafts
  const byVor = rows.slice().sort((a, b) => b.vor - a.vor || b.points - a.points || (a.pid < b.pid ? -1 : 1));
  const vorRank = new Map(byVor.map((r, i) => [r.pid, i + 1]));
  let ordered = byVor;
  if (mode !== 'redraft' && input.fantasyCalc) {
    const withFc = rows.filter((r) => r.fc).sort((a, b) => b.fc!.value - a.fc!.value || (a.pid < b.pid ? -1 : 1));
    const fcRank = new Map(withFc.map((r, i) => [r.pid, i + 1]));
    const key = (r: (typeof rows)[number]) => (fcRank.has(r.pid) ? (1 - fcWeight) * vorRank.get(r.pid)! + fcWeight * fcRank.get(r.pid)! : vorRank.get(r.pid)!);
    ordered = rows.slice().sort((a, b) => key(a) - key(b) || vorRank.get(a.pid)! - vorRank.get(b.pid)!);
  }

  // per-position rank and tier (by VOR within the position)
  const posRank = new Map<string, number>(), tier = new Map<string, number>();
  const posLists: Record<string, typeof byVor> = {};
  for (const r of byVor) (posLists[r.pos] = posLists[r.pos] || []).push(r);
  for (const list of Object.values(posLists)) {
    const t = assignTiers(list.map((r) => r.vor));
    list.forEach((r, i) => { posRank.set(r.pid, i + 1); tier.set(r.pid, t[i]!); });
  }
  const out: RankedPlayer[] = ordered.map((r, i) => ({
    ...r, rank: i + 1, posRank: posRank.get(r.pid)!, tier: tier.get(r.pid)!, valueVsAdp: r.adp == null ? null : r.adp - (i + 1),
  }));
  const byPid: Record<string, RankedPlayer> = {};
  for (const r of out) byPid[r.pid] = r;
  return { mode, adpField: field, teams, slots, replacement, starters, rows: out, byPid };
}
