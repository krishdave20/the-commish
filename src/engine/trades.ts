/* Trade analyzer (port of evaluate() in reference/ff_live.js) and the win-win idea generator (from load() in
   reference/sleeper_live.js).

   evaluateTrade re-scores both best lineups with the players swapped, for the rest of the regular season
   (weeks cur+1..last) and, for you, the playoff weeks. It works for any number of players on each side.
   tradeOdds re-simulates the season before and after (6,000 runs each, same seed, like the reference). */
import { bestSet, bestTotal } from './lineup.ts';
import { createScope, indexModel, type Scenario } from './scenario.ts';
import { simInputFor, type SimInputOpts } from './simInput.ts';
import { simulate, type SimInput } from './sim.ts';
import type { ByWeek, Model, ModelPlayer, TradeIdea } from './types.ts';

export const TRADE_SIM_RUNS = 6000;

export interface TradeProposal {
  /** the other team */
  partnerRid: number;
  /** your players you send (pids) */
  send: string[];
  /** their players you get (pids) */
  get: string[];
}

export interface TradeEval {
  /** first and last regular-season week scored (cur+1 .. last) */
  weeks: [number, number];
  playoffWeeks: number[];
  /** change in your best-lineup points, weeks cur+1..last */
  myReg: number;
  /** change in their best-lineup points over the same weeks */
  theirReg: number;
  /** change in your best-lineup points in the playoff weeks */
  myPo: number;
  /** roster-size change: you +get −send, they the opposite */
  rosterDelta: { mine: number; theirs: number };
  /** the verdict sentence(s) */
  message: string;
}

const f1 = (x: number) => x.toFixed(1);

export function evaluateTrade(model: Model, scenario: Scenario, t: TradeProposal, meRid: number = model.meRid): TradeEval {
  const sc = createScope(model, scenario, meRid);
  const w0 = model.meta.currentWeek + 1, w1 = model.meta.lastRegularWeek;
  const po = model.meta.playoffWeeks.length ? model.meta.playoffWeeks : [w1 + 1];
  const sendSet = new Set(t.send), getSet = new Set(t.get);
  const mine = sc.myRoster();
  const myAfter = mine.filter((id) => !sendSet.has(id)).concat(t.get);
  const theirs = (w: number) => sc.otherRoster(t.partnerRid, w);
  const theirsAfter = (w: number) => theirs(w).filter((id) => !getSet.has(id)).concat(t.send);
  let myReg = 0, thReg = 0, myPo = 0;
  for (let w = w0; w <= w1; w++) {
    myReg += sc.total(myAfter, w, true) - sc.total(mine, w, true);
    thReg += sc.total(theirsAfter(w), w, false) - sc.total(theirs(w), w, false);
  }
  for (const w of po) myPo += sc.total(myAfter, w, true) - sc.total(mine, w, true);

  let msg = myReg > 1 && thReg > 0 ? 'Both lineups get better. Easy pitch.'
    : myReg > 1 ? 'Good for you, but their lineup drops ' + f1(-thReg) + '. Expect a counter.'
    : myReg < -1 && thReg > 0 ? 'Helps them more than you. Pass unless your playoff weeks jump.'
    : 'Close to neutral for your lineup.';
  const nS = t.send.length, nG = t.get.length;
  if (nG > nS) msg += ' You take on ' + (nG - nS) + ' extra player' + (nG - nS > 1 ? 's' : '') + ', so plan a drop.';
  if (nS > nG) msg += ' Frees ' + (nS - nG) + ' roster spot' + (nS - nG > 1 ? 's' : '') + ' for a waiver add.';
  return { weeks: [w0, w1], playoffWeeks: po, myReg, theirReg: thReg, myPo, rosterDelta: { mine: nG - nS, theirs: nS - nG }, message: msg };
}

export interface TradeSimInputs { before: SimInput; after: SimInput }

/** The two simulations behind the playoff-odds change, as pure inputs (run them in a worker if you like). */
export function tradeSimInputs(model: Model, scenario: Scenario, t: TradeProposal, o: Omit<SimInputOpts, 'volatility'> & { meRid?: number } = {}): TradeSimInputs {
  const meRid = o.meRid ?? model.meRid;
  const sc = createScope(model, scenario, meRid);
  const w0 = model.meta.currentWeek + 1;
  const getSet = new Set(t.get), sendSet = new Set(t.send);
  const mine = sc.myRoster();
  const myAfter = mine.filter((id) => !sendSet.has(id)).concat(t.get);
  const theirsAfter = (w: number) => sc.otherRoster(t.partnerRid, w).filter((id) => !getSet.has(id)).concat(t.send);
  const ov: Record<number, ByWeek<number>> = { [t.partnerRid]: {} };
  for (let w = w0; w <= model.meta.maxWeek; w++) ov[t.partnerRid]![w] = sc.total(theirsAfter(w), w, false);
  const opts = { runs: TRADE_SIM_RUNS, ...o, volatility: scenario.volatility, meRid };
  return {
    before: simInputFor(model, sc.teamMeans(mine), opts),
    after: simInputFor(model, sc.teamMeans(myAfter, ov), opts),
  };
}

export interface TradeOdds { before: number; after: number; delta: number }

/** Your playoff odds before and after the deal, 6,000 simulated seasons each (synchronous, ~100 ms). */
export function tradeOdds(model: Model, scenario: Scenario, t: TradeProposal, o: Omit<SimInputOpts, 'volatility'> = {}): TradeOdds {
  const meRid = o.meRid ?? model.meRid;
  const { before, after } = tradeSimInputs(model, scenario, t, o);
  const b0 = simulate(before).teams[meRid]!.playoff, b1 = simulate(after).teams[meRid]!.playoff;
  return { before: b0, after: b1, delta: b1 - b0 };
}

/* ---------- win-win 1-for-1 ideas ---------- */

export const IDEA_MIN_MY_GAIN = 2;
export const IDEA_LIMIT = 8;

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Win-win 1-for-1 ideas for team `rid` (default: the signed-in team): both lineups gain over weeks cur+1..last
    (you by more than 2 points), the incoming player starts at least min(4, weeks left) weeks, no K/DEF.
    Ranked by the smaller of the two gains, one idea per incoming player, top 8. Empty in the last regular week. */
export function tradeIdeas(model: Model, rid: number = model.meRid, limit = IDEA_LIMIT): TradeIdea[] {
  const { currentWeek: cur, lastRegularWeek: last, slots } = model.meta;
  const idx = indexModel(model);
  const me = idx.byRid[rid];
  if (!me || cur >= last) return [];
  const val = (p: ModelPlayer, w: number) => p.mu[w] || 0;
  const span = (list: readonly ModelPlayer[]) => {
    let s = 0;
    for (let w = cur + 1; w <= last; w++) s += bestTotal(list.filter((p) => !p.onIr || w >= cur + 4), slots, (p) => val(p, w));
    return s;
  };
  const found: Array<Omit<TradeIdea, 'idea'>> = [];
  const mine = model.players.filter((p) => p.ownerRid === rid), myBase = span(mine);
  for (const t of model.teams) {
    if (t.rid === rid) continue;
    const theirs = model.players.filter((p) => p.ownerRid === t.rid), thBase = span(theirs);
    for (const a of mine) {
      if (a.pos === 'DEF' || a.pos === 'K') continue;
      for (const b of theirs) {
        if (b.pos === 'DEF' || b.pos === 'K') continue;
        const dm = span(mine.filter((x) => x !== a).concat([b])) - myBase;
        if (dm <= IDEA_MIN_MY_GAIN) continue;
        const dt = span(theirs.filter((x) => x !== b).concat([a])) - thBase;
        if (dt <= 0) continue;
        const after = mine.filter((x) => x !== a).concat([b]);
        let st = 0;
        for (let w = cur + 1; w <= last; w++) {
          if (bestSet(after.filter((p) => !p.onIr || w >= cur + 4), slots, (p) => val(p, w)).used.has(b.pid)) st++;
        }
        if (st >= Math.min(4, last - cur)) {
          found.push({ givePid: a.pid, give: a.name, getPid: b.pid, get: b.name, partnerRid: t.rid, partner: t.team, myGain: r2(dm), theirGain: r2(dt), startsForMe: st });
        }
      }
    }
  }
  found.sort((x, y) => Math.min(y.myGain, y.theirGain) - Math.min(x.myGain, x.theirGain));
  const seen = new Set<string>(), ideas: TradeIdea[] = [];
  for (const x of found) {
    if (ideas.length < limit && !seen.has(x.getPid)) { seen.add(x.getPid); ideas.push({ idea: ideas.length + 1, ...x }); }
  }
  return ideas;
}
