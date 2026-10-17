/* Public surface of the fantasy engine. The UI imports from here only.

   Typical use:
     const pull  = await loadLeaguePull(sleeper, { leagueId, userId });   // network (data layer)
     const model = buildModel(pull, { userId });                          // pure
     const eng   = createEngine(model);                                   // bound to the signed-in team
     eng.waivers(scenario, 'reg').list[0]                                 // top waiver add
     eng.runSim(scenario, {}, onProgress)                                 // worker, cancels stale runs
   Everything takes and returns plain data; a Scenario is the what-if state. */
import { allPlayFor, luck as luckOf, winProb as winProbOf, type AllPlay } from './league.ts';
import { clinchLeagueOf, designations as designationsOf, standingsLocked as lockedOf, winsToClinch as winsToClinchOf, type Picks } from './clinch.ts';
import { createScope, emptyScenario, type Scenario, type Scope } from './scenario.ts';
import { simInputFor, type SimInputOpts } from './simInput.ts';
import { runSimInWorker, type RunOpts } from './simRunner.ts';
import { simulate, type SimInput, type SimSummary } from './sim.ts';
import { evaluateTrade, tradeIdeas, tradeOdds, tradeSimInputs, type TradeProposal } from './trades.ts';
import { waiverBoard, waiverBoards, type WaiverWindow } from './waivers.ts';
import type { Model, ModelTeam } from './types.ts';

export * from './types.ts';
export { loadLeaguePull, type LoadOpts, type LoadProgress } from './load.ts';
export { buildModel, makeScorer, type BuildOpts, FALLBACK_Q, FALLBACK_SD, INJ_MULT, POOL_CAP, MIN_CAL_SAMPLES } from './model.ts';
export {
  ELIG, SLOT_LABEL, POS_ORDER, OFFENSE_POS, IDP_POS, startingSlots, isLineupSlot, fits, fillOrder, optimizeLineup, bestSet, bestTotal,
  type LineupOptions, type LineupResult, type LineupSlot, type LineupPlayerLike,
} from './lineup.ts';
export {
  emptyScenario, isScenarioActive, toggleIn, withOverride, describeScenario, indexModel, createScope,
  val, range, irEstimate, myRoster, otherRoster, teamMeans, lineup,
  type Scenario, type PlayerOverride, type Scope, type Means, type ModelIndex, type LineupOverrides,
} from './scenario.ts';
export {
  SIM_RUNS, DEFAULT_SEED, mulberry32, quantile, createSim, simulate, simulateChunked,
  type Sim, type SimInput, type SimSummary, type SimTeam, type SimGame, type TeamSim, type ChunkOpts,
} from './sim.ts';
export { simInputFor, baseSimInput, applyBaseSim, type SimInputOpts } from './simInput.ts';
export { runSimInWorker, cancelSim, type RunOpts } from './simRunner.ts';
export {
  standingsLocked, nonWinnersAbove, designations, winsToClinch, clinchLeagueOf,
  type ClinchLeague, type ClinchTeam, type ClinchGame, type Designation, type Locked, type Mark, type Picks, type WinsToClinch,
} from './clinch.ts';
export {
  waiverBoard, waiverBoards, waiverWeeks, bidFor, WAIVER_WINDOWS, WAIVER_GAIN_MIN, WAIVER_DROP_CANDIDATES, WAIVER_SCALE,
  type WaiverBoard, type WaiverEntry, type WaiverWindow,
} from './waivers.ts';
export {
  evaluateTrade, tradeOdds, tradeSimInputs, tradeIdeas, TRADE_SIM_RUNS,
  type TradeEval, type TradeOdds, type TradeProposal, type TradeSimInputs,
} from './trades.ts';
export { allPlay, allPlayFor, luck, winProb, erf, type AllPlay } from './league.ts';

/** The model bound to one team (default: the signed-in user's), with every helper pre-wired. */
export interface Engine {
  model: Model;
  meRid: number;
  me: ModelTeam;
  /** same model, another team's point of view (what-ifs apply to that team) */
  withTeam(rid: number): Engine;
  scope(s?: Scenario): Scope;
  /** my roster's pids after the scenario's adds/drops */
  roster(s?: Scenario): string[];
  /** my best lineup for a week */
  lineup(s: Scenario | undefined, week: number): ReturnType<Scope['lineup']>;
  /** expected lineup points rid -> week -> mean, with the scenario applied to my team */
  teamMeans(s?: Scenario): ReturnType<Scope['teamMeans']>;
  simInput(s?: Scenario, o?: SimInputOpts): SimInput;
  /** synchronous run (use for ≤6,000 runs; use runSim for the full 20,000) */
  simulate(s?: Scenario, o?: SimInputOpts): SimSummary;
  /** off-thread run with progress; resolves null when a newer run on the same channel superseded it */
  runSim(s: Scenario | undefined, o: SimInputOpts | undefined, onProgress?: (frac: number) => void, run?: RunOpts): Promise<SimSummary | null>;
  designations(picks?: Picks): ReturnType<typeof designationsOf>;
  standingsLocked(picks?: Picks): ReturnType<typeof lockedOf>;
  winsToClinch(picks?: Picks): ReturnType<typeof winsToClinchOf>;
  waivers(s: Scenario | undefined, window?: WaiverWindow): ReturnType<typeof waiverBoard>;
  allWaivers(s?: Scenario): ReturnType<typeof waiverBoards>;
  evaluateTrade(s: Scenario | undefined, t: TradeProposal): ReturnType<typeof evaluateTrade>;
  tradeOdds(s: Scenario | undefined, t: TradeProposal): ReturnType<typeof tradeOdds>;
  /** the before/after simulations behind tradeOdds, to run in a worker */
  tradeSimInputs(s: Scenario | undefined, t: TradeProposal): ReturnType<typeof tradeSimInputs>;
  tradeIdeas(): ReturnType<typeof tradeIdeas>;
  allPlay(): Record<number, AllPlay>;
  luck(rid: number): number;
  /** chance team a beats team b given expected points and the (volatility-scaled) weekly SD */
  winProb(a: number, b: number, volatility?: number): number;
}

export function createEngine(model: Model, o: { teamRid?: number } = {}): Engine {
  const meRid = o.teamRid ?? model.meRid;
  const me = model.teams.find((t) => t.rid === meRid) ?? model.teams[0]!;
  const clinchLeague = clinchLeagueOf(model);
  let ap: Record<number, AllPlay> | null = null;
  const sInput = (s: Scenario | undefined, opt: SimInputOpts = {}) => {
    const sc = s ?? emptyScenario();
    return simInputFor(model, createScope(model, sc, meRid).teamMeans(), { ...opt, volatility: opt.volatility ?? sc.volatility, meRid });
  };
  const eng: Engine = {
    model, meRid, me,
    withTeam: (rid) => createEngine(model, { teamRid: rid }),
    scope: (s) => createScope(model, s ?? emptyScenario(), meRid),
    roster: (s) => createScope(model, s ?? emptyScenario(), meRid).myRoster(),
    lineup: (s, week) => { const sc = createScope(model, s ?? emptyScenario(), meRid); return sc.lineup(sc.myRoster(), week, true); },
    teamMeans: (s) => createScope(model, s ?? emptyScenario(), meRid).teamMeans(),
    simInput: sInput,
    simulate: (s, opt) => simulate(sInput(s, opt)),
    runSim: (s, opt, onProgress, run) => runSimInWorker(sInput(s, opt), onProgress, run),
    designations: (picks) => designationsOf(clinchLeague, picks),
    standingsLocked: (picks) => lockedOf(clinchLeague, picks),
    winsToClinch: (picks) => winsToClinchOf(clinchLeague, meRid, picks),
    waivers: (s, win = 'reg') => waiverBoard(model, s ?? emptyScenario(), win, meRid),
    allWaivers: (s) => waiverBoards(model, s ?? emptyScenario(), meRid),
    evaluateTrade: (s, t) => evaluateTrade(model, s ?? emptyScenario(), t, meRid),
    tradeOdds: (s, t) => tradeOdds(model, s ?? emptyScenario(), t, { meRid }),
    tradeSimInputs: (s, t) => tradeSimInputs(model, s ?? emptyScenario(), t, { meRid }),
    tradeIdeas: () => tradeIdeas(model, meRid),
    allPlay: () => (ap ??= allPlayFor(model)),
    luck: (rid) => {
      const t = model.teams.find((x) => x.rid === rid)!;
      return luckOf(t, (ap ??= allPlayFor(model))[rid]!);
    },
    winProb: (a, b, vol = 1) => winProbOf(a, b, model.meta.teamWeeklySd * vol),
  };
  return eng;
}
export * from './draft/index.ts';
