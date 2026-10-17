/* Playoff bracket types. Everything is plain, structured-clone-safe data (no Maps, no classes), like the rest of the engine.

   Vocabulary
   - A bracket is a single-elimination tree. `kind` says who moves on from a game:
       championship  the winner (higher score) advances; the last team standing is the league champion
       consolation   the winner advances; for the non-playoff teams, the last team standing is the consolation champion
       toilet        the LOSER advances; for the non-playoff teams, the team that loses every round is crowned the worst team
   - A "pick" is always the team that ADVANCES from a game, so one data model serves all three kinds
     (in the toilet bowl you pick who gets flushed, and that team moves on).
   - A "real game" is a game that was actually played: `w` won it, `l` lost it. Real games lock a match. */

export type BracketKind = 'championship' | 'consolation' | 'toilet';

/** Sleeper's playoff settings that shape the bracket. */
export interface PlayoffRules {
  /** playoff_teams */
  teams: number;
  /** playoff_week_start: the NFL week round 1 is played */
  weekStart: number;
  /** playoff_round_type: 0 one week per round, 1 two-week championship, 2 two weeks every round */
  roundType: number;
  /** playoff_seed_type: 0 fixed bracket, 1 reseed each round */
  seedType: number;
  /** playoff_type (0 in every league checked; not used) */
  type?: number;
}

/** Where a team in a game's slot comes from. */
export type Source =
  | { kind: 'team'; rid: number; seed: number | null }
  | { kind: 'win'; match: string }
  | { kind: 'tbd' };

export interface BracketMatch {
  /** "r2m1": round 2, game 1 (both 1-based) */
  id: string;
  round: number;
  /** 0-based position inside the round */
  index: number;
  a: Source;
  b: Source;
  /** Sleeper's match id `m`, when the bracket came from Sleeper */
  sleeperM?: number;
}

/** A game that was played. */
export interface RealGame { w: number; l: number }

export interface Bracket {
  kind: BracketKind;
  rounds: number;
  /** ordered by round, then index */
  matches: BracketMatch[];
  /** later rounds re-pair the survivors (best seed vs worst) instead of following the fixed tree */
  reseed: boolean;
  /** the NFL weeks each round is played (index = round - 1); a two-week round lists two */
  roundWeeks: number[][];
  /** roster id -> seed (1 = best, or worst-first in a toilet bowl: seed 1 is the team seeded first in that bracket) */
  seeds: Record<number, number>;
  /** actual results locked by match id */
  results: Record<string, RealGame>;
  /** actual results locked by the pair of teams that played (any match they meet in) */
  real: RealGame[];
  origin: 'built' | 'sleeper';
}

/** match id -> the team that advances from it */
export type BracketPicks = Record<string, number>;

export interface ResolvedSlot { rid: number | null; seed: number | null }

export interface ResolvedMatch {
  id: string;
  round: number;
  index: number;
  a: ResolvedSlot;
  b: ResolvedSlot;
  /** the team that moves on, null while undecided */
  advancer: number | null;
  /** the other team */
  out: number | null;
  /** decided by a game that was really played */
  locked: boolean;
  /** decided by a pick */
  picked: boolean;
  /** both teams are known, so the game can be picked or simulated */
  ready: boolean;
  /** that side is a team that skipped the previous round (a bye) */
  aBye: boolean;
  bBye: boolean;
  weeks: number[];
}

/** What the bracket math needs to score a game: expected points by week and the weekly spread. */
export interface BracketCtx {
  /** roster id -> week -> expected lineup points */
  means: Record<number, Record<number, number>>;
  /** team weekly score SD, already multiplied by any volatility */
  sd: number;
  /** the week the model treats as "now" (its SD is ×0.85) */
  currentWeek: number;
}

/** Odds for one team in one bracket. */
export interface BracketOdds {
  /** chance of being the last team standing */
  crowned: number;
  /** chance of reaching the last game */
  final: number;
  /** reach[k] = chance of playing in round k + 1 (a team with a bye plays in round 2 and skips round 1) */
  reach: number[];
  /** expected finishing place among the bracket's teams (1 = last team standing), counting only runs in which the team is in it */
  place: number;
}
