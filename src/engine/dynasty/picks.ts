/* Future draft picks as trade assets: who owns what, which early/mid/late slot each pick is likely to land in, and what
   FantasyCalc says it is worth.

   FantasyCalc's dynasty response lists picks as rows with position 'PICK' and ids of two shapes:
     FP_<season>_<early|mid|late>_<round - 1>   e.g. FP_2027_mid_0 = the 2027 1st if it lands mid-round (next draft only)
     FP_<season>_<round>                        e.g. FP_2028_1     = a 2028 1st, slot unknown (every later season)
   so the next draft is priced by slot and later drafts by round alone.

   Mapping used here (documented in the UI's footnote too):
   1. A pick's slot bucket comes from its ORIGINAL owner's projected finish: teams are sorted by expected final wins
      (the simulation's expWins; current win percentage while the simulation is still running), worst first, and cut
      into thirds: the worst third is 'early', the best third 'late', the rest 'mid'. Only the next draft gets a bucket.
      Every later season is 'mid'.
   2. 'mid' in a season with no bucketed rows is FantasyCalc's own plain row, which is exact, not an estimate.
   3. Anything else that has no row is the nearest row, and the valuation is flagged `estimated`:
        a. wanted bucket missing: nearest bucket (early: mid, plain, late; mid: plain, early, late; late: mid, plain, early);
        b. season missing: nearest season FantasyCalc lists (ties go to the earlier one);
        c. round deeper than FantasyCalc lists: its deepest round, times 0.85 for every round beyond it. */
import type { TradedPick } from '../../data/contract.ts';
import type { FcEntry } from '../draft/fantasycalc.ts';
import { futurePicksByRoster, type OwnedPick } from '../draft/picks.ts';

export type PickBucket = 'early' | 'mid' | 'late';

/** How many drafts ahead are shown. */
export const PICK_SEASONS = 3;
/** Rounds used when the league does not say (settings.draft_rounds); FantasyCalc lists four. */
export const DEFAULT_PICK_ROUNDS = 4;
/** Value kept per round a pick is deeper than anything FantasyCalc lists. */
export const EXTRA_ROUND_DECAY = 0.85;

/** Slot buckets to try, in order, when the wanted one has no row. */
const FALLBACK: Record<PickBucket, Array<PickBucket | 'plain'>> = {
  early: ['early', 'mid', 'plain', 'late'],
  mid: ['mid', 'plain', 'early', 'late'],
  late: ['late', 'mid', 'plain', 'early'],
};

export interface FcPickRow {
  id: string;
  season: number;
  round: number;
  /** null for the plain (slot unknown) rows */
  bucket: PickBucket | null;
  value: number;
}

export interface PickIndex {
  /** `${season}:${round}:${bucket | 'plain'}` → row */
  slots: Map<string, FcPickRow>;
  /** seasons FantasyCalc lists, ascending */
  seasons: number[];
  /** season → deepest round listed */
  maxRound: Map<number, number>;
}

const ID = /^FP_(\d{4})_(?:(early|mid|late)_(\d+)|(\d+))$/;

/** FantasyCalc pick id → season, round and bucket; null when it is not a pick id. */
export function parsePickId(id: string): { season: number; round: number; bucket: PickBucket | null } | null {
  const m = ID.exec(id);
  if (!m) return null;
  if (m[2]) return { season: Number(m[1]), round: Number(m[3]) + 1, bucket: m[2] as PickBucket };
  return { season: Number(m[1]), round: Number(m[4]), bucket: null };
}

/** Pick rows out of a joined FantasyCalc response (the 'PICK' entries). Null when there are none (redraft, or FantasyCalc is down). */
export function indexFcPicks(byId: Record<string, FcEntry> | null | undefined): PickIndex | null {
  if (!byId) return null;
  const slots = new Map<string, FcPickRow>();
  for (const e of Object.values(byId)) {
    if (e.position !== 'PICK') continue;
    const p = parsePickId(e.sleeperId);
    if (!p || !(e.value > 0)) continue;
    slots.set(`${p.season}:${p.round}:${p.bucket ?? 'plain'}`, { id: e.sleeperId, ...p, value: e.value });
  }
  if (!slots.size) return null;
  const maxRound = new Map<number, number>();
  for (const r of slots.values()) maxRound.set(r.season, Math.max(maxRound.get(r.season) ?? 0, r.round));
  return { slots, seasons: [...maxRound.keys()].sort((a, b) => a - b), maxRound };
}

export interface PickPrice {
  value: number;
  /** the FantasyCalc row used (its id) */
  fcId: string;
  /** a nearest-row stand-in, not FantasyCalc's own price for this pick */
  estimated: boolean;
}

/** What FantasyCalc says a pick is worth, with the fallbacks above. Null when FantasyCalc lists no picks at all. */
export function pickPrice(index: PickIndex | null, season: string | number, round: number, bucket: PickBucket): PickPrice | null {
  if (!index) return null;
  const want = Number(season);
  let estimated = false;
  let s = want;
  if (!index.maxRound.has(want)) {
    const nearest = index.seasons.reduce((best, y) => (Math.abs(y - want) < Math.abs(best - want) ? y : best), index.seasons[0]!);
    s = nearest;
    estimated = true;
  }
  const deepest = index.maxRound.get(s)!;
  const r = Math.min(round, deepest);
  const beyond = round - r;
  if (beyond > 0) estimated = true;
  for (const b of FALLBACK[bucket]) {
    const row = index.slots.get(`${s}:${r}:${b}`);
    if (!row) continue;
    // 'mid' with only a plain row is FantasyCalc's own price for that pick, so it is exact; any other swap is an estimate
    const swap = b !== bucket && !(bucket === 'mid' && b === 'plain');
    return { value: row.value * EXTRA_ROUND_DECAY ** beyond, fcId: row.id, estimated: estimated || swap };
  }
  // a round with no row in any bucket (FantasyCalc skipped it): the next shallower round, flagged
  if (r > 1) {
    const shallower = pickPrice(index, s, r - 1, bucket);
    return shallower && { ...shallower, estimated: true };
  }
  return null;
}

/* ---------- which slot a pick lands in ---------- */

export interface FinishTeam {
  rid: number;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  /** expected final wins from the simulation */
  expWins: number;
}

/** Original owner → early / mid / late, from the projected finish: worst third early, best third late. */
export function projectedBuckets(teams: readonly FinishTeam[], oddsPending = false): Record<number, PickBucket> {
  const pct = (t: FinishTeam) => {
    const g = t.wins + t.losses + t.ties;
    return g ? (t.wins + t.ties / 2) / g : 0;
  };
  const score = (t: FinishTeam) => (oddsPending ? pct(t) : t.expWins);
  const order = [...teams].sort((a, b) => score(a) - score(b) || a.pf - b.pf || a.rid - b.rid); // worst first
  const n = order.length;
  const third = Math.round(n / 3);
  const out: Record<number, PickBucket> = {};
  order.forEach((t, i) => { out[t.rid] = i < third ? 'early' : i >= n - third ? 'late' : 'mid'; });
  return out;
}

/** The first draft still to come: this season's rookie draft until it has happened, otherwise next season's. */
export function firstPickSeason(league: { season: string; status?: string }): string {
  const s = Number(league.season);
  return league.status === 'pre_draft' || league.status === 'drafting' ? String(s) : String(s + 1);
}

/** The next `n` draft seasons as strings. */
export function pickSeasons(league: { season: string; status?: string }, n = PICK_SEASONS): string[] {
  const first = Number(firstPickSeason(league));
  return Array.from({ length: n }, (_, i) => String(first + i));
}

/* ---------- ownership + value ---------- */

const SUFFIX = ['th', 'st', 'nd', 'rd'];
/** 1 → "1st", 12 → "12th" */
export function roundLabel(round: number): string {
  const v = round % 100;
  return `${round}${SUFFIX[(v - 20) % 10] ?? SUFFIX[v] ?? SUFFIX[0]}`;
}

export interface PickValuation {
  /** stable id of the pick: `pick:<season>:<round>:<original roster id>` */
  key: string;
  season: string;
  round: number;
  /** whose draft slot the pick is */
  originalRosterId: number;
  /** who holds it now */
  ownerRosterId: number;
  /** held by someone other than its original owner */
  acquired: boolean;
  bucket: PickBucket;
  /** FantasyCalc value; null when FantasyCalc has no picks */
  value: number | null;
  /** nearest-row stand-in (see the mapping above) */
  estimated: boolean;
  fcId: string | null;
  /** "2027 1st" */
  label: string;
}

export const pickKey = (season: string, round: number, originalRosterId: number) => `pick:${season}:${round}:${originalRosterId}`;

export interface PickInput {
  tradedPicks: readonly Pick<TradedPick, 'season' | 'round' | 'roster_id' | 'owner_id'>[];
  rosterIds: readonly number[];
  seasons: readonly string[];
  rounds: number;
  /** original owner → bucket for the first season */
  buckets: Record<number, PickBucket>;
  /** the season that gets slot buckets (default: the first of `seasons`) */
  bucketSeason?: string;
  fc: PickIndex | null;
}

/** Every team's owned future picks, with their slot bucket and FantasyCalc value. */
export function valuePicks(i: PickInput): Record<number, PickValuation[]> {
  const owned = futurePicksByRoster(i.tradedPicks, i.rosterIds, i.seasons, i.rounds);
  const bucketSeason = i.bucketSeason ?? i.seasons[0];
  const out: Record<number, PickValuation[]> = {};
  for (const [rid, picks] of Object.entries(owned) as unknown as Array<[number, OwnedPick[]]>) {
    out[Number(rid)] = picks.map((p) => {
      const bucket: PickBucket = p.season === bucketSeason ? (i.buckets[p.originalRosterId] ?? 'mid') : 'mid';
      const price = pickPrice(i.fc, p.season, p.round, bucket);
      return {
        key: pickKey(p.season, p.round, p.originalRosterId), season: p.season, round: p.round, originalRosterId: p.originalRosterId,
        ownerRosterId: Number(rid), acquired: p.acquired, bucket, value: price ? Math.round(price.value) : null,
        estimated: price?.estimated ?? false, fcId: price?.fcId ?? null, label: `${p.season} ${roundLabel(p.round)}`,
      };
    });
  }
  return out;
}
