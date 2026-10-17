/* Work out who plays whom, and who has advanced, from a bracket plus picks and real results.

   Everything that walks a bracket (the interactive view, the exact odds, the season simulation) goes through
   `compile` and `roundPairs`, so they all agree on pairings, byes and reseeding. */
import type { Bracket, BracketPicks, RealGame, ResolvedMatch, Source } from './types.ts';

/** Source encoded as a number: a roster id (> 0), the match index of the game it is the winner of (as -(index + 1)), or 0 for unknown. */
export interface Compiled {
  bracket: Bracket;
  n: number;
  ids: string[];
  round: number[];
  a: number[];
  b: number[];
  /** first match index of each round (1-based round); length rounds + 2 */
  start: number[];
  seedOf: (rid: number) => number;
}

const cache = new WeakMap<Bracket, Compiled>();

const enc = (s: Source, idx: Map<string, number>): number =>
  s.kind === 'team' ? s.rid : s.kind === 'win' ? -((idx.get(s.match) ?? -1) + 1) : 0;

export function compile(bk: Bracket): Compiled {
  const hit = cache.get(bk);
  if (hit) return hit;
  const idx = new Map(bk.matches.map((m, i) => [m.id, i] as const));
  const start: number[] = new Array(bk.rounds + 2).fill(bk.matches.length);
  for (let i = bk.matches.length - 1; i >= 0; i--) start[bk.matches[i]!.round] = i;
  for (let r = bk.rounds; r >= 1; r--) if (start[r]! > start[r + 1]!) start[r] = start[r + 1]!;
  const c: Compiled = {
    bracket: bk, n: bk.matches.length, ids: bk.matches.map((m) => m.id), round: bk.matches.map((m) => m.round),
    a: bk.matches.map((m) => enc(m.a, idx)), b: bk.matches.map((m) => enc(m.b, idx)), start,
    seedOf: (rid) => bk.seeds[rid] ?? 999,
  };
  cache.set(bk, c);
  return c;
}

const sourceRid = (code: number, adv: ReadonlyArray<number | null>): number | null =>
  code > 0 ? code : code < 0 ? (adv[-code - 1] ?? null) : null;

/** The two teams of every game in `round`, given the advancers decided so far (`adv[i]` for match index i, null when open). */
export function roundPairs(c: Compiled, round: number, adv: ReadonlyArray<number | null>): Array<[number | null, number | null]> {
  const from = c.start[round]!, to = c.start[round + 1]!;
  const out: Array<[number | null, number | null]> = [];
  if (c.bracket.reseed && round > 1) {
    // survivors: teams that skipped the last round plus last round's advancers; best seed meets worst
    const entering: Array<number | null> = [];
    for (let i = from; i < to; i++) {
      for (const code of [c.a[i]!, c.b[i]!]) if (code > 0) entering.push(code);
    }
    const prev: Array<number | null> = [];
    for (let i = c.start[round - 1]!; i < from; i++) prev.push(adv[i] ?? null);
    const all = [...entering, ...prev];
    if (all.every((x) => x !== null) && all.length === 2 * (to - from)) {
      const s = (all as number[]).sort((x, y) => c.seedOf(x) - c.seedOf(y) || x - y);
      for (let k = 0; k < to - from; k++) out.push([s[k]!, s[s.length - 1 - k]!]);
      return out;
    }
  }
  for (let i = from; i < to; i++) out.push([sourceRid(c.a[i]!, adv), sourceRid(c.b[i]!, adv)]);
  return out;
}

/** The real game between two teams, if one was played: `w` beat `l`. */
export function realBetween(bk: Bracket, id: string, x: number | null, y: number | null): RealGame | null {
  const byId = bk.results[id];
  if (byId) return byId;
  if (x === null || y === null) return null;
  return bk.real.find((g) => (g.w === x && g.l === y) || (g.w === y && g.l === x)) ?? null;
}

/** The team that moves on from a game in this bracket: the winner, or in a toilet bowl the loser. */
export const advancerOf = (kind: Bracket['kind'], g: RealGame): number => (kind === 'toilet' ? g.l : g.w);
export const outOf = (kind: Bracket['kind'], g: RealGame): number => (kind === 'toilet' ? g.w : g.l);

/** Every game with its teams, advancer and state. `picks` map a game to the team that advances; a pick naming a team
    that is not in the game is ignored. Real results win over picks. */
export function resolveBracket(bk: Bracket, picks: BracketPicks = {}): ResolvedMatch[] {
  const c = compile(bk);
  const adv: Array<number | null> = new Array(c.n).fill(null);
  const out: ResolvedMatch[] = new Array(c.n);
  const seen = (rid: number | null) => (rid === null ? null : bk.seeds[rid] ?? null);
  for (let r = 1; r <= bk.rounds; r++) {
    const pairs = roundPairs(c, r, adv);
    pairs.forEach(([x, y], k) => {
      const i = c.start[r]! + k;
      const m = bk.matches[i]!;
      const g = realBetween(bk, m.id, x, y);
      let advancer: number | null = null, locked = false, picked = false;
      if (g) {
        advancer = advancerOf(bk.kind, g);
        locked = true;
      } else if (x !== null && y !== null && picks[m.id] !== undefined && (picks[m.id] === x || picks[m.id] === y)) {
        advancer = picks[m.id]!;
        picked = true;
      }
      adv[i] = advancer;
      const byes = bk.origin === 'built' && r > 1;
      out[i] = {
        id: m.id, round: r, index: m.index, a: { rid: x, seed: seen(x) }, b: { rid: y, seed: seen(y) },
        advancer, out: advancer === null ? null : advancer === x ? y : x, locked, picked,
        ready: x !== null && y !== null, aBye: byes && c.a[i]! > 0, bBye: byes && c.b[i]! > 0,
        weeks: bk.roundWeeks[r - 1] ?? [],
      };
    });
  }
  return out;
}

/** Keep only picks that still make sense (the team is in the game and every earlier game it needs is decided). */
export function prunePicks(bk: Bracket, picks: BracketPicks): BracketPicks {
  const resolved = resolveBracket(bk, picks);
  const kept: BracketPicks = {};
  for (const m of resolved) if (m.picked && m.advancer !== null) kept[m.id] = m.advancer;
  return kept;
}

/** The last team standing, or null while the last game is open. */
export function championOf(resolved: readonly ResolvedMatch[]): number | null {
  const last = resolved[resolved.length - 1];
  return last?.advancer ?? null;
}
