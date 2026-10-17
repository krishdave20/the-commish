/* One team's road through a bracket: its seed, its first game, who it most likely meets and its chance in it. Pure. */
import {
  advanceProb, compile, resolveBracket, scoringFor,
  type Bracket, type BracketCtx,
} from '../../engine';

export interface PathInfo {
  seed: number | null;
  /** the round of the team's first game */
  round: number;
  /** skipped round 1 */
  bye: boolean;
  weeks: number[];
  /** the opponent in that game: known, or the likelier of the two teams that feed the other side */
  opponent: { rid: number; seed: number | null; /** chance this is the opponent (1 when known) */ chance: number } | null;
  /** chance the team ADVANCES from that game against `opponent` (in a toilet bowl: chance of losing it) */
  advance: number | null;
}

/** The first game of `rid` in a bracket with nothing decided but the real results. Null when the team is not in the bracket. */
export function pathOf(bk: Bracket, ctx: BracketCtx, rid: number): PathInfo | null {
  const r = resolveBracket(bk, {});
  const mine = r.find((m) => m.a.rid === rid || m.b.rid === rid);
  if (!mine) return null;
  const c = compile(bk);
  const sc = scoringFor(bk, ctx);
  const iAmA = mine.a.rid === rid;
  const other = iAmA ? mine.b : mine.a;
  const seed = bk.seeds[rid] ?? null;
  const bye = iAmA ? mine.aBye : mine.bBye;
  let opponent: PathInfo['opponent'] = null;
  let advance: number | null = null;
  if (other.rid !== null) {
    opponent = { rid: other.rid, seed: other.seed, chance: 1 };
    advance = advanceProb(bk.kind, sc, rid, other.rid, mine.round);
  } else {
    // the other side is the winner of an earlier game: take the likelier of its two teams
    const idx = c.ids.indexOf(mine.id);
    const code = iAmA ? c.b[idx]! : c.a[idx]!;
    const feeder = code < 0 ? r[-code - 1] : undefined;
    if (feeder && feeder.a.rid !== null && feeder.b.rid !== null) {
      const pa = advanceProb(bk.kind, sc, feeder.a.rid, feeder.b.rid, feeder.round);
      const [likely, p] = pa >= 0.5 ? [feeder.a, pa] : [feeder.b, 1 - pa];
      opponent = { rid: likely.rid!, seed: likely.seed, chance: p };
      advance = advanceProb(bk.kind, sc, rid, likely.rid!, mine.round);
    }
  }
  return { seed, round: mine.round, bye, weeks: mine.weeks, opponent, advance };
}
