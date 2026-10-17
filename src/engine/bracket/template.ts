/* Build a bracket from a seed list. Standard single-elimination pairings (1v8, 4v5, 3v6, 2v7), byes for the top
   seeds when the team count is not a power of two (6 teams: seeds 1-2 skip round 1; 12 teams: seeds 1-4 do). */
import type { Bracket, BracketKind, BracketMatch, PlayoffRules, RealGame, Source } from './types.ts';

/** Seeds in bracket order for a full bracket of size `size` (a power of two): neighbours meet in round 1.
    For 8 this is [1,8,4,5,3,6,2,7], the layout Sleeper uses (checked against a finished league). */
export function bracketOrder(size: number): number[] {
  let order = [1];
  for (let n = 1; n < size; n *= 2) {
    const pairs = order.map((s) => [s, 2 * n + 1 - s] as const);
    const half = pairs.length / 2;
    // the lower half of the bracket is mirrored, so seed 3 sits above seed 2
    const arranged = pairs.length > 2 ? [...pairs.slice(0, half), ...pairs.slice(half).reverse()] : pairs;
    order = arranged.flatMap(([x, y]) => [x, y]);
  }
  return order;
}

/** Rounds in a single-elimination bracket of `n` teams. */
export const roundsFor = (n: number): number => (n < 2 ? 0 : Math.ceil(Math.log2(n)));

/** The NFL weeks of each round. Two-week rounds list both weeks (their means add, their variances add). Weeks past 18 do not exist. */
export function roundWeeks(rounds: number, rules: Pick<PlayoffRules, 'weekStart' | 'roundType'>): number[][] {
  const out: number[][] = [];
  let w = rules.weekStart;
  for (let r = 1; r <= rounds; r++) {
    const two = rules.roundType === 2 || (rules.roundType === 1 && r === rounds);
    const weeks = two ? [w, w + 1] : [w];
    w += weeks.length;
    const ok = weeks.filter((x) => x >= 1 && x <= 18);
    out.push(ok.length ? ok : [Math.min(18, Math.max(1, weeks[0]!))]);
  }
  return out;
}

export interface BuildOpts {
  kind: BracketKind;
  /** roster ids in seed order: index 0 is seed 1 */
  seedOrder: readonly number[];
  rules: Pick<PlayoffRules, 'weekStart' | 'roundType' | 'seedType'>;
  /** games already played, matched to a game by the pair of teams */
  real?: RealGame[];
}

/** A bracket for the teams in `seedOrder`. Fewer than two teams give a bracket with no games. */
export function buildBracket(o: BuildOpts): Bracket {
  const n = o.seedOrder.length;
  const rounds = roundsFor(n);
  const seeds: Record<number, number> = {};
  o.seedOrder.forEach((rid, i) => { seeds[rid] = i + 1; });
  const team = (seed: number): Source => ({ kind: 'team', rid: o.seedOrder[seed - 1]!, seed });
  const matches: BracketMatch[] = [];
  if (rounds > 0) {
    const size = 2 ** rounds;
    const order = bracketOrder(size);
    // entries of the current level: a team that is waiting (a bye) or the winner of a round-1 game
    let level: Source[] = [];
    const count: Record<number, number> = {};
    const add = (round: number, a: Source, b: Source): Source => {
      const index = count[round] ?? 0;
      count[round] = index + 1;
      const id = `r${round}m${index + 1}`;
      matches.push({ id, round, index, a, b });
      return { kind: 'win', match: id };
    };
    for (let i = 0; i < size; i += 2) {
      const x = order[i]!, y = order[i + 1]!;
      if (y > n) level.push(team(x));
      else if (x > n) level.push(team(y));
      else level.push(add(1, team(x), team(y)));
    }
    for (let r = 2; r <= rounds; r++) {
      const next: Source[] = [];
      for (let i = 0; i < level.length; i += 2) next.push(add(r, level[i]!, level[i + 1]!));
      level = next;
    }
  }
  return {
    kind: o.kind, rounds, matches, reseed: o.rules.seedType === 1, roundWeeks: roundWeeks(rounds, o.rules),
    seeds, results: {}, real: o.real ?? [], origin: 'built',
  };
}
