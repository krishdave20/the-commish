/* Head-to-head chances and title odds for one bracket.

   A game is scored like a regular-season game: each team's round score is normal around its expected lineup points
   for the round's week(s). A two-week round adds the two weeks' means and adds their variances (SD × √2). The higher
   score wins; in a toilet bowl the LOWER score advances. The SD is the model's team weekly SD (×0.85 for the week
   in progress), the same one the season simulation uses.

   `oddsFor` is exact: it walks every possible set of results (2^open games, at most 2^16 and fine for a league's
   bracket), so title odds add to exactly 1 and do not wobble when you change a pick. A bracket with more than 16
   open games is sampled instead (`runs`, default 5,000). */
import { winProb } from '../league.ts';
import { mulberry32, normal } from './prng.ts';
import { advancerOf, compile, realBetween, roundPairs, type Compiled } from './resolve.ts';
import type { Bracket, BracketCtx, BracketKind, BracketOdds, BracketPicks } from './types.ts';

const CURRENT_WEEK_SD = 0.85;

/** Expected lineup points of `rid` in `week`. A week the model has no mean for borrows the team's average over the weeks it has. */
export function weekMean(ctx: BracketCtx, rid: number, week: number): number {
  const row = ctx.means[rid];
  if (!row) return 0;
  const v = row[week];
  if (v !== undefined) return v;
  const vals = Object.values(row).filter((x) => x > 0);
  return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
}

/** Expected points over a round (a two-week round adds both weeks). */
export const roundMean = (ctx: BracketCtx, rid: number, weeks: readonly number[]): number =>
  weeks.reduce((s, w) => s + weekMean(ctx, rid, w), 0);

/** SD of one team's round score: weekly variances add. */
export const roundSd = (ctx: BracketCtx, weeks: readonly number[]): number =>
  Math.sqrt(weeks.reduce((s, w) => s + (ctx.sd * (w === ctx.currentWeek ? CURRENT_WEEK_SD : 1)) ** 2, 0));

/** What it takes to score a game: a team's expected round score and the round's SD. */
export interface Scoring { mean(rid: number, round: number): number; sd(round: number): number }

export function scoringFor(bk: Bracket, ctx: BracketCtx): Scoring {
  return {
    mean: (rid, round) => roundMean(ctx, rid, bk.roundWeeks[round - 1] ?? []),
    sd: (round) => roundSd(ctx, bk.roundWeeks[round - 1] ?? []),
  };
}

/** Chance that x outscores y in a round. */
export const outscoreProb = (sc: Scoring, x: number, y: number, round: number): number =>
  winProb(sc.mean(x, round), sc.mean(y, round), sc.sd(round));

/** Chance that x ADVANCES from a game against y: wins it, or in a toilet bowl loses it. */
export function advanceProb(kind: BracketKind, sc: Scoring, x: number, y: number, round: number): number {
  const p = outscoreProb(sc, x, y, round);
  return kind === 'toilet' ? 1 - p : p;
}

/** Head-to-head numbers for a game, for tooltips and slots. */
export interface Matchup {
  weeks: number[];
  meanA: number;
  meanB: number;
  /** chance a outscores b */
  pOutscoreA: number;
  /** chance a advances / b advances */
  pAdvanceA: number;
  pAdvanceB: number;
}

export function matchupOf(bk: Bracket, ctx: BracketCtx, round: number, a: number, b: number): Matchup {
  const sc = scoringFor(bk, ctx);
  const p = outscoreProb(sc, a, b, round);
  const adv = bk.kind === 'toilet' ? 1 - p : p;
  return { weeks: bk.roundWeeks[round - 1] ?? [], meanA: sc.mean(a, round), meanB: sc.mean(b, round), pOutscoreA: p, pAdvanceA: adv, pAdvanceB: 1 - adv };
}

/** Place for a team knocked out in each round: the average of the places it shares. */
export function placeByRound(c: Compiled): number[] {
  const teams = c.n + 1;
  const out: number[] = [0];
  let alive = teams;
  for (let r = 1; r <= c.bracket.rounds; r++) {
    const m = c.start[r + 1]! - c.start[r]!;
    alive -= m;
    out.push(alive + (m + 1) / 2);
  }
  return out;
}

type OddsMap = Record<number, BracketOdds>;

function blank(rounds: number): BracketOdds {
  return { crowned: 0, final: 0, reach: new Array(rounds).fill(0), place: 0 };
}

const MAX_EXACT_OPEN = 16;

/** Odds of every team in the bracket given the picks and real results. */
export function oddsFor(bk: Bracket, ctx: BracketCtx, picks: BracketPicks = {}, o: { runs?: number; seed?: number } = {}): OddsMap {
  return oddsWith(bk, scoringFor(bk, ctx), picks, o);
}

export function oddsWith(bk: Bracket, sc: Scoring, picks: BracketPicks = {}, o: { runs?: number; seed?: number } = {}): OddsMap {
  const c = compile(bk);
  const out: OddsMap = {};
  if (c.n === 0) return out;
  const R = bk.rounds, last = c.n - 1;
  const places = placeByRound(c);
  const get = (rid: number) => (out[rid] ??= blank(R));
  const adv: Array<number | null> = new Array(c.n).fill(null);
  const pairsOf: Array<Array<[number | null, number | null]>> = [];

  // how many games are really open (no real result, no pick that fits)? decides exact versus sampled
  let open = 0;
  {
    const probe: Array<number | null> = new Array(c.n).fill(null);
    for (let r = 1; r <= R; r++) {
      const pairs = roundPairs(c, r, probe);
      pairs.forEach(([x, y], k) => {
        const i = c.start[r]! + k;
        const g = realBetween(bk, c.ids[i]!, x, y);
        if (g) probe[i] = advancerOf(bk.kind, g);
        else if (x !== null && y !== null && (picks[c.ids[i]!] === x || picks[c.ids[i]!] === y)) probe[i] = picks[c.ids[i]!]!;
        else open++;
      });
    }
  }
  const leaf = (p: number) => {
    const champ = adv[last];
    if (champ !== null) { const t = get(champ!); t.crowned += p; t.place += p * 1; }
    for (let i = 0; i < c.n; i++) {
      const a = adv[i];
      if (a === null) continue;
      const r = c.round[i]!;
      const pair = pairsOf[r]![i - c.start[r]!]!;
      const loser = pair[0] === a ? pair[1] : pair[0];
      if (loser !== null) get(loser).place += p * places[r]!;
    }
  };

  if (open <= MAX_EXACT_OPEN) {
    const walkRound = (r: number, p: number): void => {
      if (r > R) { leaf(p); return; }
      const pairs = roundPairs(c, r, adv);
      pairsOf[r] = pairs;
      for (const [x, y] of pairs) {
        if (x !== null) get(x).reach[r - 1]! += p;
        if (y !== null) get(y).reach[r - 1]! += p;
      }
      if (r === R) { const [x, y] = pairs[0]!; if (x !== null) get(x).final += p; if (y !== null) get(y).final += p; }
      walkMatch(r, 0, p);
    };
    const walkMatch = (r: number, k: number, p: number): void => {
      const pairs = pairsOf[r]!;
      if (k >= pairs.length) { walkRound(r + 1, p); return; }
      const i = c.start[r]! + k, [x, y] = pairs[k]!;
      const g = realBetween(bk, c.ids[i]!, x, y);
      if (g) { adv[i] = advancerOf(bk.kind, g); walkMatch(r, k + 1, p); adv[i] = null; return; }
      if (x === null || y === null) { adv[i] = null; walkMatch(r, k + 1, p); return; }
      const pk = picks[c.ids[i]!];
      if (pk === x || pk === y) { adv[i] = pk!; walkMatch(r, k + 1, p); adv[i] = null; return; }
      const px = advanceProb(bk.kind, sc, x, y, r);
      adv[i] = x; walkMatch(r, k + 1, p * px);
      adv[i] = y; walkMatch(r, k + 1, p * (1 - px));
      adv[i] = null;
    };
    walkRound(1, 1);
    return out;
  }

  // sampled
  const runs = o.runs ?? 5000, rand = mulberry32(o.seed ?? 1);
  const gauss = normal(rand);
  for (let n = 0; n < runs; n++) {
    const played = playRounds(bk, sc, gauss, picks);
    for (let i = 0; i < c.n; i++) adv[i] = played.adv[i]!;
    played.pairs.forEach((pr, r) => { pairsOf[r] = pr; });
    for (let r = 1; r <= R; r++) {
      for (const [x, y] of pairsOf[r]!) {
        if (x !== null) get(x).reach[r - 1]! += 1 / runs;
        if (y !== null) get(y).reach[r - 1]! += 1 / runs;
      }
    }
    const [fx, fy] = pairsOf[R]![0]!;
    if (fx !== null) get(fx).final += 1 / runs;
    if (fy !== null) get(fy).final += 1 / runs;
    leaf(1 / runs);
  }
  return out;
}

export interface Played {
  /** the team that advanced from each game (match index), null when it could not be played */
  adv: Array<number | null>;
  /** the teams of every game by round (index = round) */
  pairs: Array<Array<[number | null, number | null]>>;
  /** simulated round scores of the two teams, by game id (only for games that were drawn) */
  scores: Record<string, [number, number]>;
}

/** Play every open game once: scores are drawn, the higher advances (the lower in a toilet bowl). Real results and fitting picks stand. */
export function playRounds(bk: Bracket, sc: Scoring, gauss: () => number, picks: BracketPicks = {}): Played {
  const c = compile(bk);
  const adv: Array<number | null> = new Array(c.n).fill(null);
  const pairs: Played['pairs'] = [[]];
  const scores: Played['scores'] = {};
  for (let r = 1; r <= bk.rounds; r++) {
    const ps = roundPairs(c, r, adv);
    pairs[r] = ps;
    ps.forEach(([x, y], k) => {
      const i = c.start[r]! + k, id = c.ids[i]!;
      const g = realBetween(bk, id, x, y);
      if (g) { adv[i] = advancerOf(bk.kind, g); return; }
      if (x === null || y === null) return;
      const pk = picks[id];
      if (pk === x || pk === y) { adv[i] = pk!; return; }
      const sx = sc.mean(x, r) + sc.sd(r) * gauss();
      const sy = sc.mean(y, r) + sc.sd(r) * gauss();
      scores[id] = [sx, sy];
      const xWins = sx > sy;
      adv[i] = bk.kind === 'toilet' ? (xWins ? y : x) : (xWins ? x : y);
    });
  }
  return { adv, pairs, scores };
}

export interface PlayOnce {
  /** every game's advancer (the picks that were given are kept), ready to use as picks */
  picks: BracketPicks;
  scores: Record<string, [number, number]>;
  /** the last team standing */
  champion: number | null;
}

/** One seeded random run of the bracket from its real results (plus any picks you want kept). Same seed, same run. */
export function playOnce(bk: Bracket, ctx: BracketCtx, o: { seed: number; picks?: BracketPicks }): PlayOnce {
  const c = compile(bk);
  const played = playRounds(bk, scoringFor(bk, ctx), normal(mulberry32(o.seed)), o.picks ?? {});
  const picks: BracketPicks = {};
  for (let i = 0; i < c.n; i++) {
    const a = played.adv[i];
    if (a === null || a === undefined) continue;
    const r = c.round[i]!, pair = played.pairs[r]![i - c.start[r]!]!;
    // real results are not picks
    if (realBetween(bk, c.ids[i]!, pair[0], pair[1])) continue;
    picks[c.ids[i]!] = a;
  }
  return { picks, scores: played.scores, champion: played.adv[c.n - 1] ?? null };
}

/* ---------- named wrappers ---------- */

export interface PlayoffOpts extends BracketCtx {
  picks?: BracketPicks;
  /** sampled brackets only (more than 16 open games): default 5,000 */
  runs?: number;
  seed?: number;
}

const ctxOf = (o: PlayoffOpts): BracketCtx => ({ means: o.means, sd: o.sd, currentWeek: o.currentWeek });

export interface TitleOdds { titlePct: number; finalsPct: number; expFinish: number; reach: number[] }

/** Title odds for a championship bracket: fixed, partially decided or fully decided. Sums to 1 over the teams. */
export function simulatePlayoffs(bk: Bracket, o: PlayoffOpts): Record<number, TitleOdds> {
  const odds = oddsFor(bk, ctxOf(o), o.picks, o);
  const out: Record<number, TitleOdds> = {};
  for (const [rid, v] of Object.entries(odds)) out[Number(rid)] = { titlePct: v.crowned, finalsPct: v.final, expFinish: v.place, reach: v.reach };
  return out;
}

export interface FlushOdds { flushPct: number; finalsPct: number; reach: number[] }

/** Odds for a toilet bowl: `flushPct` is the chance of being crowned the worst team (losing every game). Sums to 1. */
export function simulateToiletBowl(bk: Bracket, o: PlayoffOpts): Record<number, FlushOdds> {
  const odds = oddsFor(bk, ctxOf(o), o.picks, o);
  const out: Record<number, FlushOdds> = {};
  for (const [rid, v] of Object.entries(odds)) out[Number(rid)] = { flushPct: v.crowned, finalsPct: v.final, reach: v.reach };
  return out;
}

/** The same for a consolation bracket (winners advance; the last team standing is the consolation champion). */
export function simulateConsolation(bk: Bracket, o: PlayoffOpts): Record<number, { consolationPct: number; finalsPct: number; reach: number[] }> {
  const odds = oddsFor(bk, ctxOf(o), o.picks, o);
  const out: Record<number, { consolationPct: number; finalsPct: number; reach: number[] }> = {};
  for (const [rid, v] of Object.entries(odds)) out[Number(rid)] = { consolationPct: v.crowned, finalsPct: v.final, reach: v.reach };
  return out;
}

