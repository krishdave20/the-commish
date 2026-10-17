/* Dynasty trade evaluation: FantasyCalc value out and in (players and picks), joined to the redraft evaluation of this
   season, then a verdict that depends on whether your team is a contender or a rebuilder. Rules and numbers only.

   Three signals, each squeezed into -1..+1:
     now    = (lineup points gained, rest of the regular season + playoff weeks) ÷ NOW_SCALE
     value  = (value in − value out) ÷ the bigger side ÷ VALUE_SCALE
     youth  = (young value in − young value out) ÷ the bigger side ÷ VALUE_SCALE
              (young = a player 26 or under, or any pick)
   The lens decides how much each counts (LENS_WEIGHTS). score = Σ weight × signal ÷ Σ weight.
   score ≥ TAKE_AT: "take it"; score ≤ PASS_AT: "pass"; in between: "close call". */
import type { TradeEval } from '../trades.ts';
import { YOUNG_MAX_AGE } from './value.ts';
import type { LensLabel } from './lens.ts';

export const NOW_SCALE = 10;
export const VALUE_SCALE = 0.25;
export const TAKE_AT = 0.2;
export const PASS_AT = -0.2;
/** Under this share of the bigger side, the two sides are even on value. */
export const EVEN_BAND = 0.05;

export interface LensWeights { now: number; value: number; youth: number }

/** contender: this season; all-in: this season, future value barely counts; rebuilder: value and youth, this season ignored;
    retool: value first, some of this season, some youth; none (lens unknown): a balanced read. */
export const LENS_WEIGHTS: Record<LensLabel | 'none', LensWeights> = {
  contender: { now: 1, value: 0.4, youth: 0 },
  'all-in': { now: 1, value: 0.15, youth: 0 },
  rebuilder: { now: 0, value: 1, youth: 0.6 },
  retool: { now: 0.35, value: 0.8, youth: 0.4 },
  none: { now: 0.5, value: 0.5, youth: 0.2 },
};

export interface TradeAsset {
  id: string;
  kind: 'player' | 'pick';
  label: string;
  /** FantasyCalc value; null = none on file (counted as 0 and named in the message) */
  value: number | null;
  /** players only; null when unknown */
  age: number | null;
}

export type Verdict = 'take it' | 'close call' | 'pass';

export interface DynastyTradeInput {
  /** what you send */
  give: readonly TradeAsset[];
  /** what you get */
  get: readonly TradeAsset[];
  /** your label; null when the lens is not ready */
  lens: LensLabel | null;
  /** this season's evaluation from the redraft engine; null when there is none */
  redraft: Pick<TradeEval, 'myReg' | 'myPo' | 'weeks' | 'playoffWeeks'> | null;
  /** change in your playoff odds as a fraction (0.03 = +3 points), when the simulation is done */
  oddsDelta?: number | null;
  /** false when FantasyCalc is down: only this season is scored */
  valuesAvailable?: boolean;
}

export interface DynastyTradeEval {
  given: number;
  received: number;
  net: number;
  /** net ÷ the bigger side */
  relNet: number;
  /** young value in / out (players 26 and under and picks) */
  youngGiven: number;
  youngReceived: number;
  /** lineup points gained, rest of regular season + playoff weeks (0 without a redraft evaluation) */
  nowPoints: number;
  /** assets with no FantasyCalc value */
  missing: string[];
  signals: { now: number; value: number; youth: number };
  weights: LensWeights;
  score: number;
  verdict: Verdict;
  message: string;
}

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const int = (n: number) => Math.round(n).toLocaleString('en-US');
const sgn = (n: number, d = 1) => {
  const r = Number(n.toFixed(d));
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(d)}`;
};
const sgnInt = (n: number) => `${Math.round(n) > 0 ? '+' : Math.round(n) < 0 ? '−' : ''}${int(Math.abs(n))}`;

const isYoung = (a: TradeAsset) => a.kind === 'pick' || (a.age !== null && a.age <= YOUNG_MAX_AGE);
const sum = (xs: readonly TradeAsset[], f: (a: TradeAsset) => number) => xs.reduce((s, a) => s + f(a), 0);

export function evaluateDynastyTrade(i: DynastyTradeInput): DynastyTradeEval {
  const known = i.valuesAvailable !== false;
  const v = (a: TradeAsset) => (known ? a.value ?? 0 : 0);
  const given = sum(i.give, v), received = sum(i.get, v);
  const net = received - given;
  const big = Math.max(given, received, 1);
  const youngGiven = sum(i.give.filter(isYoung), v), youngReceived = sum(i.get.filter(isYoung), v);
  const nowPoints = i.redraft ? i.redraft.myReg + i.redraft.myPo : 0;
  const missing = known ? [...i.give, ...i.get].filter((a) => a.value === null).map((a) => a.label) : [];

  const signals = {
    now: clamp(nowPoints / NOW_SCALE),
    value: known ? clamp(net / big / VALUE_SCALE) : 0,
    youth: known ? clamp((youngReceived - youngGiven) / big / VALUE_SCALE) : 0,
  };
  const base = LENS_WEIGHTS[i.lens ?? 'none'];
  // without values only this season can be judged
  const weights: LensWeights = known ? base : { now: 1, value: 0, youth: 0 };
  const wSum = weights.now + weights.value + weights.youth;
  const score = wSum > 0 ? (weights.now * signals.now + weights.value * signals.value + weights.youth * signals.youth) / wSum : 0;
  const verdict: Verdict = score >= TAKE_AT ? 'take it' : score <= PASS_AT ? 'pass' : 'close call';

  return {
    given, received, net, relNet: net / big, youngGiven, youngReceived, nowPoints, missing, signals, weights, score, verdict,
    message: sentence(i, { given, received, net, relNet: net / big, youngGiven, youngReceived, signals, verdict, missing, known }),
  };
}

function sentence(
  i: DynastyTradeInput,
  d: { given: number; received: number; net: number; relNet: number; youngGiven: number; youngReceived: number; signals: { now: number; value: number; youth: number }; verdict: Verdict; missing: string[]; known: boolean },
): string {
  const r = i.redraft;
  const odds = i.oddsDelta != null ? `, and your playoff odds ${i.oddsDelta >= 0.005 ? 'rise' : i.oddsDelta <= -0.005 ? 'fall' : 'hold'}${Math.abs(i.oddsDelta) >= 0.005 ? ` ${Math.round(Math.abs(i.oddsDelta) * 100)} points` : ''}` : '';
  const now = r
    ? `your lineup moves ${sgn(r.myReg)} points over weeks ${r.weeks[0]}–${r.weeks[1]} and ${sgn(r.myPo)} in the playoff weeks${odds}`
    : 'this season is unscored';
  const value = d.known
    ? `dynasty value ${int(d.given)} out, ${int(d.received)} in, net ${sgnInt(d.net)}`
    : 'fantasycalc values are unavailable, so only this season is scored';
  const youthNet = d.youngReceived - d.youngGiven;
  const youth = d.known && Math.abs(youthNet) / Math.max(d.given, d.received, 1) >= EVEN_BAND
    ? `you ${youthNet > 0 ? 'take on' : 'give up'} ${int(Math.abs(youthNet))} of value in players 26 and under and picks`
    : null;
  const even = d.known && Math.abs(d.relNet) < EVEN_BAND;
  const lens = i.lens;
  let focus: string;
  if (!d.known) focus = 'judged on this season alone';
  else if (lens === 'contender') {
    focus = d.signals.now >= 0.1 ? 'the lineup gain is what a contender is paying for' : d.signals.now <= -0.1 ? 'it costs lineup points a contender cannot spare' : 'it barely moves this season';
  } else if (lens === 'all-in') {
    focus = d.signals.now >= 0.1 ? 'the lineup gain is the point and an all-in team does not mind the future value'
      : d.signals.now <= -0.1 ? 'it costs lineup points, and this season is all an all-in team is buying' : 'it barely moves this season, which is all an all-in team is buying';
  } else if (lens === 'rebuilder') {
    const valueUp = d.net > 0 && !even, youthUp = youthNet > 0 && !!youth;
    focus = `a rebuilder wants value and youth, and ${valueUp && youthUp ? 'this brings both' : valueUp ? 'this brings value but not youth' : youthUp ? 'this brings youth but not value' : even && !youth ? 'they do not tilt its way' : 'this sends them out'}`;
  } else if (lens === 'retool') {
    focus = 'a retooling team weighs future value first and this season second';
  } else focus = 'no contender or rebuilder read yet, so this season and future value count about evenly';
  const who = lens ? `as ${lens === 'all-in' ? 'an all-in team' : `a ${lens}`}` : 'on balance';
  const bits = [value, youth, now].filter((x): x is string => !!x);
  let msg = `${d.verdict}: ${who}, ${focus}. ${bits.join('; ')}.`;
  if (d.missing.length) msg += ` fantasycalc has no value for ${d.missing.join(', ')}; counted as 0.`;
  return msg;
}
