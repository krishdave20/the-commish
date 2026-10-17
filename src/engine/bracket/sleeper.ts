/* Sleeper's `winners_bracket` / `losers_bracket` rows into a Bracket.

   What Sleeper sends (checked on the fixture league and on a finished 8-team season; see docs/WEB_APP_NOTES.md):
   - rows `{ r, m, t1, t2, w, l, t1_from?, t2_from?, p? }`; `w`/`l` are null until a game is played
   - the winners bracket holds EVERY game of the playoff weeks, not just the title path: round 2 also has the round-1
     losers' games (5th place and below) and round 3 the placement games `p: 3 | 5 | 7`. `p: 1` is the championship.
   - before the playoffs Sleeper already fills round 1 from the current standings, with no results.
   - the league settings do not say whether the losers bracket is a toilet bowl or a consolation bracket; the shape does:
     the `p: 1` game of the losers bracket takes the winners of round 1 (`{ w }`) in a consolation bracket.
   Seeds are not in the rows; they are read off the standard layout (round-1 game order 1v8, 4v5, 3v6, 2v7) when it fits. */
import type { BracketRow } from '../../data/types.ts';
import { bracketOrder, roundWeeks } from './template.ts';
import type { Bracket, BracketMatch, PlayoffRules, RealGame, Source } from './types.ts';

const byRound = (a: BracketRow, b: BracketRow) => a.r - b.r || a.m - b.m;

/** The games that were actually played. */
export function realGamesOf(rows: readonly BracketRow[] | null | undefined): RealGame[] {
  return (rows ?? []).filter((r) => r.w !== null && r.l !== null && r.w !== undefined && r.l !== undefined).map((r) => ({ w: r.w!, l: r.l! }));
}

/** Does the league's own losers bracket crown the best team (consolation) or the worst (toilet bowl)? null when Sleeper has no such bracket yet. */
export function losersModeOf(rows: readonly BracketRow[] | null | undefined): 'toilet' | 'consolation' | null {
  if (!rows || !rows.length) return null;
  const last = [...rows].sort((a, b) => (a.p === 1 ? -1 : b.p === 1 ? 1 : b.r - a.r || a.m - b.m))[0]!;
  const links = [last.t1_from, last.t2_from].filter(Boolean) as Array<{ w?: number; l?: number }>;
  if (links.some((x) => x.l !== undefined)) return 'toilet';
  if (links.some((x) => x.w !== undefined)) return 'consolation';
  return null;
}

/** The games on the road to the championship, from the `p: 1` game back through the `{ w }` links. */
function titlePath(rows: readonly BracketRow[]): BracketRow[] {
  const byM = new Map(rows.map((r) => [r.m, r] as const));
  const final = rows.find((r) => r.p === 1) ?? [...rows].sort((a, b) => b.r - a.r || a.m - b.m)[0];
  if (!final) return [];
  const seen = new Set<number>();
  const walk = (r: BracketRow) => {
    if (seen.has(r.m)) return;
    seen.add(r.m);
    for (const f of [r.t1_from, r.t2_from]) if (f?.w !== undefined && byM.has(f.w)) walk(byM.get(f.w)!);
  };
  walk(final);
  const found = rows.filter((r) => seen.has(r.m));
  // no links at all (a reseeded bracket may omit them): take 2^(R-r) games per round, lowest match id first
  if (found.length === 1 && final.r > 1) {
    const out: BracketRow[] = [final];
    for (let r = final.r - 1; r >= 1; r--) out.push(...rows.filter((x) => x.r === r && x.p === undefined).sort((a, b) => a.m - b.m).slice(0, 2 ** (final.r - r)));
    return out;
  }
  return found;
}

/** Seeds read off the layout: round-1 games in match order follow the standard bracket order, byes wait in round 2. Empty when it does not fit. */
function inferSeeds(matches: BracketMatch[], rounds: number): Record<number, number> {
  const out: Record<number, number> = {};
  const teamsIn = (m: BracketMatch) => [m.a, m.b].filter((s): s is Extract<Source, { kind: 'team' }> => s.kind === 'team');
  const leaves = matches.flatMap((m) => teamsIn(m));
  const n = leaves.length;
  if (n < 2 || rounds < 1 || n > 2 ** rounds || n <= 2 ** (rounds - 1)) return out;
  const order = bracketOrder(2 ** rounds);
  // level-1 entries in bracket order: a game, or a bye team
  const entries: Array<'game' | 'bye'> = [];
  for (let i = 0; i < order.length; i += 2) entries.push(order[i + 1]! > n || order[i]! > n ? 'bye' : 'game');
  const r1 = matches.filter((m) => m.round === 1);
  const r2byes = matches.filter((m) => m.round > 1).flatMap((m) => teamsIn(m));
  if (r1.length !== entries.filter((e) => e === 'game').length || r2byes.length !== entries.filter((e) => e === 'bye').length) return out;
  let gi = 0, bi = 0;
  entries.forEach((e, k) => {
    const x = order[2 * k]!, y = order[2 * k + 1]!;
    if (e === 'game') {
      const m = r1[gi++]!;
      if (m.a.kind === 'team') out[m.a.rid] = x;
      if (m.b.kind === 'team') out[m.b.rid] = y;
    } else {
      const t = r2byes[bi++]!;
      out[t.rid] = Math.min(x, y);
    }
  });
  return out;
}

export interface FromSleeperOpts {
  rules: Pick<PlayoffRules, 'weekStart' | 'roundType' | 'seedType'>;
  /** seeds to use for teams the layout cannot place (roster id -> seed) */
  seeds?: Record<number, number>;
}

/** The championship bracket as Sleeper has it, with real results locked. Null when Sleeper has no bracket yet. */
export function bracketFromSleeper(rows: readonly BracketRow[] | null | undefined, o: FromSleeperOpts): Bracket | null {
  if (!rows || !rows.length) return null;
  const path = titlePath(rows).sort(byRound);
  if (!path.length) return null;
  const inPath = new Map(path.map((r) => [r.m, r] as const));
  const reseed = o.rules.seedType === 1;
  const rounds = Math.max(...path.map((r) => r.r));
  const ids = new Map<number, string>();
  const perRound: Record<number, number> = {};
  for (const r of path) {
    perRound[r.r] = (perRound[r.r] ?? 0) + 1;
    ids.set(r.m, `r${r.r}m${perRound[r.r]}`);
  }
  const results: Bracket['results'] = {};
  const matches: BracketMatch[] = path.map((r) => {
    const side = (t: number | null, from: BracketRow['t1_from']): Source => {
      if (!(reseed && r.r > 1) && from?.w !== undefined && inPath.has(from.w)) return { kind: 'win', match: ids.get(from.w)! };
      return t !== null && t !== undefined ? { kind: 'team', rid: t, seed: null } : { kind: 'tbd' };
    };
    const id = ids.get(r.m)!;
    if (r.w !== null && r.l !== null && r.w !== undefined && r.l !== undefined) results[id] = { w: r.w, l: r.l };
    return { id, round: r.r, index: 0, a: side(r.t1, r.t1_from), b: side(r.t2, r.t2_from), sleeperM: r.m };
  });
  // index = position inside the round, 0-based, in match-id order
  const seen: Record<number, number> = {};
  for (const m of matches) { m.index = seen[m.round] ?? 0; seen[m.round] = m.index + 1; }
  const inferred = inferSeeds(matches, rounds);
  const seeds: Record<number, number> = { ...(o.seeds ?? {}), ...inferred };
  for (const m of matches) for (const s of [m.a, m.b]) if (s.kind === 'team') s.seed = seeds[s.rid] ?? null;
  return {
    kind: 'championship', rounds, matches, reseed: false, roundWeeks: roundWeeks(rounds, o.rules), seeds, results,
    real: [], origin: 'sleeper',
  };
}
