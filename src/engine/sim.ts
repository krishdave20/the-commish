/* Season simulator (port of makeSim in reference/ff_live.js and simulate in reference/sleeper_live.js).

   Each simulated season plays every remaining regular-season game: both teams score
   mean + sd * N(0,1) (sd is ×0.85 for the in-progress week), the higher score wins, and the final table
   is ranked by `wins*10000 + pf`. Seeding: division winners first (best record among each division),
   then wildcards by the same key. With zero divisions the table is ranked by record only.
   "Playoff-machine" picks force a game's winner (the scores are still drawn so the random stream, and
   points-for tiebreaks, stay aligned).

   The PRNG is mulberry32 and the normal draw is Box-Muller with a spare, exactly as in the reference, so
   the same seed gives the same numbers as the reference engine.

   Stepwise API: `createSim(input)` then `sim.step(n)` until it returns true; `sim.summary()` can be read at
   any point. `simulate(input)` runs the whole thing synchronously. */
import type { ByWeek } from './types.ts';

export const SIM_RUNS = 20000;
export const DEFAULT_SEED = 20261016;

export interface SimTeam { rid: number; wins: number; pf: number; divId: number }
export interface SimGame { id: string; week: number; teamA: number; teamB: number }

/** Pure data: structured-clone safe, so it can be posted to a worker. */
export interface SimInput {
  teams: SimTeam[];
  /** remaining regular-season games */
  games: SimGame[];
  /** expected lineup points: rid -> week -> mean */
  means: Record<number, ByWeek<number>>;
  /** team weekly score SD (before the volatility multiplier) */
  sd: number;
  /** multiplier on sd (default 1) */
  volatility?: number;
  currentWeek: number;
  playoffTeams: number;
  /** number of divisions; 0 = seed by record only */
  divisions: number;
  runs: number;
  /** PRNG seed (default 20261016) */
  seed?: number;
  /** playoff-machine picks: game id -> winning rid */
  picks?: Record<string, number>;
  /** track the win-count histogram for this team (`myHist`) */
  meRid?: number | null;
}

export interface TeamSim {
  /** chance of making the playoffs */
  playoff: number;
  /** chance of winning the division (0 with no divisions) */
  div: number;
  expW: number;
  /** chance of finishing at each seed 1..playoffTeams */
  seeds: number[];
  /** 10th / 90th percentile of final wins (sampled from every 10th run) */
  winsP10: number;
  winsP90: number;
}

export interface SimSummary {
  /** runs completed */
  n: number;
  teams: Record<number, TeamSim>;
  /** final wins -> how often it happened and how often `meRid` made the playoffs with it */
  myHist: Record<number, { n: number; made: number }>;
}

export interface Sim {
  /** run up to `m` more seasons; true when all `total` runs are done */
  step(m: number): boolean;
  summary(): SimSummary;
  readonly total: number;
  /** runs finished so far */
  readonly done: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** linear-interpolated quantile; NaN for an empty array (as in the reference) */
export function quantile(arr: readonly number[], p: number): number {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo]! + (a[hi]! - a[lo]!) * (i - lo);
}

export function createSim(input: SimInput): Sim {
  const T = input.teams, n = input.runs, K = T.length;
  const NP = Math.min(input.playoffTeams, K);
  const sd = input.sd * (input.volatility || 1);
  const pk = input.picks ?? {};
  const idx: Record<number, number> = {};
  T.forEach((t, i) => { idx[t.rid] = i; });
  const divs = input.divisions ? [...new Set(T.map((t) => t.divId))] : [];
  const divOf = T.map((t) => t.divId);
  const G = input.games.map((g) => ({
    a: idx[g.teamA]!, b: idx[g.teamB]!,
    ma: input.means[g.teamA]?.[g.week] || 0, mb: input.means[g.teamB]?.[g.week] || 0,
    s: sd * (g.week === input.currentWeek ? 0.85 : 1),
    pick: pk[g.id] != null ? (idx[pk[g.id]!] ?? -1) : -1,
  }));
  const r = mulberry32(input.seed || DEFAULT_SEED);
  let spare: number | null = null;
  const gauss = () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = r();
    const v = r(), m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  const made = new Float64Array(K), div = new Float64Array(K), winsSum = new Float64Array(K);
  const seeds = T.map(() => new Float64Array(NP));
  const winDist: number[][] = T.map(() => []);
  const myHist: Record<number, { n: number; made: number }> = {};
  const meI = input.meRid != null ? (idx[input.meRid] ?? -1) : -1;
  const W0 = T.map((t) => t.wins), PF0 = T.map((t) => t.pf);
  const Wv = new Float64Array(K), PF = new Float64Array(K), key = new Float64Array(K);
  let ran = 0;

  function step(m: number): boolean {
    for (let it = 0; it < m && ran < n; it++, ran++) {
      for (let i = 0; i < K; i++) { Wv[i] = W0[i]!; PF[i] = PF0[i]!; }
      for (const g of G) {
        const a = g.ma + g.s * gauss(), b = g.mb + g.s * gauss();
        PF[g.a] = PF[g.a]! + a; PF[g.b] = PF[g.b]! + b;
        const aw = g.pick >= 0 ? g.pick === g.a : a > b;
        if (aw) Wv[g.a] = Wv[g.a]! + 1; else Wv[g.b] = Wv[g.b]! + 1;
      }
      for (let i = 0; i < K; i++) {
        key[i] = Wv[i]! * 10000 + PF[i]!;
        winsSum[i] = winsSum[i]! + Wv[i]!;
        if (ran % 10 === 0) winDist[i]!.push(Wv[i]!);
      }
      const winners: number[] = [];
      for (const d of divs) {
        let best = -1;
        for (let i = 0; i < K; i++) if (divOf[i] === d && (best < 0 || key[i]! > key[best]!)) best = i;
        if (best >= 0) winners.push(best);
      }
      winners.sort((x, y) => key[y]! - key[x]!);
      const rest: number[] = [];
      for (let i = 0; i < K; i++) if (!winners.includes(i)) rest.push(i);
      rest.sort((x, y) => key[y]! - key[x]!);
      const order = winners.concat(rest.slice(0, Math.max(0, NP - winners.length))).slice(0, NP);
      order.forEach((i, s) => { made[i] = made[i]! + 1; seeds[i]![s] = seeds[i]![s]! + 1; });
      winners.forEach((i) => { div[i] = div[i]! + 1; });
      if (meI >= 0) {
        const mw = Wv[meI]!;
        const h = myHist[mw] ?? (myHist[mw] = { n: 0, made: 0 });
        h.n++;
        if (order.includes(meI)) h.made++;
      }
    }
    return ran >= n;
  }

  function summary(): SimSummary {
    const k = ran || 1;
    const teams: Record<number, TeamSim> = {};
    T.forEach((t, i) => {
      teams[t.rid] = {
        playoff: made[i]! / k, div: div[i]! / k, expW: winsSum[i]! / k,
        seeds: Array.from(seeds[i]!).map((x) => x / k),
        winsP10: quantile(winDist[i]!, 0.1), winsP90: quantile(winDist[i]!, 0.9),
      };
    });
    const hist: Record<number, { n: number; made: number }> = {};
    for (const [w, h] of Object.entries(myHist)) hist[Number(w)] = { ...h };
    return { n: ran, teams, myHist: hist };
  }

  return { step, summary, total: n, get done() { return ran; } };
}

/** Run the whole simulation synchronously. */
export function simulate(input: SimInput): SimSummary {
  const s = createSim(input);
  s.step(input.runs);
  return s.summary();
}

export interface ChunkOpts {
  /** seasons per step call (default 400) */
  chunk?: number;
  /** time budget per slice before yielding to the event loop (default 14 ms) */
  sliceMs?: number;
  /** return true to abandon the run (resolves null) */
  isStale?: () => boolean;
}

/** Run in time slices, yielding with setTimeout between slices so a UI thread stays responsive.
    Resolves null when `isStale()` turned true. */
export function simulateChunked(input: SimInput, onProgress?: (frac: number) => void, opts: ChunkOpts = {}): Promise<SimSummary | null> {
  const s = createSim(input);
  const chunk = opts.chunk ?? 400, slice = opts.sliceMs ?? 14;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return new Promise((resolve) => {
    const tick = () => {
      if (opts.isStale?.()) { resolve(null); return; }
      const t0 = now();
      let done = false;
      while (!done && now() - t0 < slice) done = s.step(chunk);
      onProgress?.(Math.min(1, s.done / Math.max(1, s.total)));
      if (done) resolve(s.summary()); else setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  });
}
