/* The playoff part of the season simulation.

   After every regular-season run has been drawn, the simulation walks the runs again, in order, and plays the
   playoffs of each one with the SAME random stream, continuing where the regular season left off. So the regular
   season's draws, and every regular-season number, are exactly what they were before this existed. Per run it plays,
   in this order:
     1. the championship bracket among the seeded playoff teams (higher score advances),
     2. the toilet bowl among the non-playoff teams, seeded worst-first (LOWER score advances; the last team standing is crowned the worst),
     3. the consolation bracket among the same teams, seeded best-first (higher score advances).
   Scores are normal around the team's expected lineup points for the round's week(s); two-week rounds add means and variances.
   The bracket templates use seed numbers as stand-in team ids, so one template serves every run. */
import { buildBracket } from './template.ts';
import { placeByRound, playRounds, type Scoring } from './odds.ts';
import { compile } from './resolve.ts';
import type { Bracket, PlayoffRules } from './types.ts';

export interface PlayoffTeamResult {
  /** chance of reaching the championship game */
  finalsPct: number;
  /** chance of winning the championship */
  titlePct: number;
  /** expected finishing place (1 = champion) in the runs where the team makes the playoffs; 0 when it never does */
  expFinish: number;
  /** chance of being in the non-playoff field */
  inToiletBowlPct: number;
  /** chance of being crowned toilet bowl champion (the worst team) */
  flushPct: number;
  /** chance of winning the consolation bracket */
  consolationPct: number;
}

export interface PlayoffPassInput {
  rules: Pick<PlayoffRules, 'weekStart' | 'roundType' | 'seedType'>;
  /** teams in the league */
  teams: number;
  /** playoff teams (already capped at the number of teams) */
  playoffTeams: number;
  /** expected points: team index -> week -> mean */
  mean: (team: number, week: number) => number;
  sd: number;
  currentWeek: number;
}

export interface PlayoffPass {
  /** play one run's playoffs. `order` holds team indices best-first (length = teams); draws come from `gauss`. */
  play(order: ArrayLike<number>, gauss: () => number): void;
  /** the totals over `runs` plays, by team index */
  result(runs: number): PlayoffTeamResult[];
}

const CURRENT_WEEK_SD = 0.85;

interface Field { bk: Bracket; sc: Scoring; toTeam: (seed: number, order: ArrayLike<number>) => number; places: number[] }

export function createPlayoffPass(input: PlayoffPassInput): PlayoffPass {
  const K = input.teams, NP = Math.min(input.playoffTeams, K), F = K - NP;
  const seedsList = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const champ = NP >= 2 ? buildBracket({ kind: 'championship', seedOrder: seedsList(NP), rules: input.rules }) : null;
  const toilet = F >= 2 ? buildBracket({ kind: 'toilet', seedOrder: seedsList(F), rules: input.rules }) : null;
  const conso = F >= 2 ? buildBracket({ kind: 'consolation', seedOrder: seedsList(F), rules: input.rules }) : null;

  let cur: ArrayLike<number> = [];
  const fieldOf = (bk: Bracket, toTeam: Field['toTeam']): Field => {
    const c = compile(bk);
    const rounds = bk.rounds;
    const table: number[][] = Array.from({ length: K }, (_, t) =>
      Array.from({ length: rounds + 1 }, (_, r) => (r === 0 ? 0 : (bk.roundWeeks[r - 1] ?? []).reduce((s, w) => s + input.mean(t, w), 0))));
    const sds = Array.from({ length: rounds + 1 }, (_, r) =>
      (r === 0 ? 0 : Math.sqrt((bk.roundWeeks[r - 1] ?? []).reduce((s, w) => s + (input.sd * (w === input.currentWeek ? CURRENT_WEEK_SD : 1)) ** 2, 0))));
    const sc: Scoring = { mean: (seed, round) => table[toTeam(seed, cur)]![round]!, sd: (round) => sds[round]! };
    return { bk, sc, toTeam, places: placeByRound(c) };
  };
  const fChamp = champ && fieldOf(champ, (s, o) => o[s - 1]!);
  const fToilet = toilet && fieldOf(toilet, (s, o) => o[K - s]!);
  const fConso = conso && fieldOf(conso, (s, o) => o[NP + s - 1]!);

  const finals = new Float64Array(K), title = new Float64Array(K), placeSum = new Float64Array(K), made = new Float64Array(K);
  const inField = new Float64Array(K), flush = new Float64Array(K), consoWins = new Float64Array(K);

  function playField(f: Field, gauss: () => number, hit: { place?: (t: number, p: number) => void; finalist?: (t: number) => void; crowned: (t: number) => void }) {
    const c = compile(f.bk);
    const played = playRounds(f.bk, f.sc, gauss);
    const R = f.bk.rounds;
    if (hit.finalist) for (const x of played.pairs[R]![0]!) if (x !== null) hit.finalist(f.toTeam(x, cur));
    const top = played.adv[c.n - 1];
    if (top !== null && top !== undefined) { hit.crowned(f.toTeam(top, cur)); hit.place?.(f.toTeam(top, cur), 1); }
    if (!hit.place) return;
    for (let i = 0; i < c.n; i++) {
      const a = played.adv[i];
      if (a === null || a === undefined) continue;
      const r = c.round[i]!, pair = played.pairs[r]![i - c.start[r]!]!;
      const loser = pair[0] === a ? pair[1] : pair[0];
      if (loser !== null) hit.place(f.toTeam(loser, cur), f.places[r]!);
    }
  }

  return {
    play(order, gauss) {
      cur = order;
      if (fChamp) {
        for (let s = 0; s < NP; s++) made[order[s]!]! += 1;
        playField(fChamp, gauss, { place: (t, p) => { placeSum[t]! += p; }, finalist: (t) => { finals[t]! += 1; }, crowned: (t) => { title[t]! += 1; } });
      }
      for (let s = NP; s < K; s++) inField[order[s]!]! += 1;
      if (fToilet) playField(fToilet, gauss, { crowned: (t) => { flush[t]! += 1; } });
      if (fConso) playField(fConso, gauss, { crowned: (t) => { consoWins[t]! += 1; } });
    },
    result(runs) {
      const k = runs || 1;
      return Array.from({ length: K }, (_, t) => ({
        finalsPct: finals[t]! / k, titlePct: title[t]! / k, expFinish: made[t]! ? placeSum[t]! / made[t]! : 0,
        inToiletBowlPct: inField[t]! / k, flushPct: flush[t]! / k, consolationPct: consoWins[t]! / k,
      }));
    },
  };
}
