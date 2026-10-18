/* Streaming picks: free agents worth adding for one week (or two), ranked per position.

   Rules (no LLM, rules over real numbers):
   - Positions: QB, TE, DEF and K (each only when the league has a starting slot for it), plus "flex fliers"
     (free-agent RB/WR) only when the league has a flex slot an RB or WR can fill (FLEX, W/R, W/T; a superflex is a
     QB spot, so it does not count). IDP positions appear only when the league starts them.
   - Candidates: free agents (ownerRid 0, not already added in the what-if) with a game that week, a projection
     above zero, and not on IR or out (Out, IR, PUP, suspended).
   - Score: that week's projection `mu` alone. The matchup grade (`dvp`) is shown as context and never added in,
     because the projection already includes the matchup. Floor and ceiling are the calibrated 20th/80th percentile.
   - Versus your starter: the candidate minus the weakest starter of yours that he could replace in the optimizer's
     lineup for that week (an empty slot, or one whose player has no projection that week, counts as 0). More than UPGRADE_MIN points above is an "upgrade".
   - Two weeks: the sum of `mu` for the week and the one after. The best two-week total among players with a game
     both weeks is flagged "hold".
   - Schedule ahead: the next three opponents (the week and the two after) with their grades.
   - Bye-week fill: one of your top players at the position (as many as you have slots, ranked by his usual
     projection in the other weeks) has no game or is out that week. That position goes first and says who it fills for.
   - Top five per position, best projection first. The headline pick is the biggest upgrade among the top rows, and a
     position that needs a fill wins it over an upgrade elsewhere. */
import { fits, ELIG } from '../lineup.ts';
import { createScope, emptyScenario, type Scenario, type Scope } from '../scenario.ts';
import type { Model, ModelPlayer, Pos, Slot } from '../types.ts';

export type StreamPos = 'QB' | 'TE' | 'DEF' | 'K' | 'FLEX' | 'DL' | 'LB' | 'DB';

/** Card order on the page. */
export const STREAM_ORDER: readonly StreamPos[] = ['QB', 'TE', 'DEF', 'K', 'FLEX', 'DL', 'LB', 'DB'];
/** A candidate must beat your starter by more than this to be flagged an upgrade. */
export const UPGRADE_MIN = 1;
/** Rows kept per position. */
export const STREAM_TOP = 5;
/** Statuses that take a player out of the pool (and out of your own lineup). */
export const OUT_STATUS: ReadonlySet<string> = new Set(['Out', 'IR', 'PUP', 'Sus', 'Suspended', 'NA']);

export const STREAM_LABEL: Record<StreamPos, string> = { QB: 'qb', TE: 'te', DEF: 'def', K: 'k', FLEX: 'flex fliers', DL: 'dl', LB: 'lb', DB: 'db' };

export interface StreamAhead {
  week: number;
  /** opponent code, 'BYE' with no game */
  opp: string;
  dvp: number | null;
}

export interface StreamRow {
  pid: string;
  player: ModelPlayer;
  week: number;
  opp: string;
  dvp: number | null;
  /** the week's projection (the ranking score) */
  proj: number;
  floor: number;
  ceil: number;
  /** the starter he would replace; null when that slot is empty */
  starter: ModelPlayer | null;
  starterProj: number;
  /** proj minus the starter's projection */
  diff: number;
  upgrade: boolean;
  /** this week plus the next */
  twoWeek: number;
  /** the best two-week total at his position among players with a game both weeks */
  hold: boolean;
  /** the next three weeks' opponents with grades */
  ahead: StreamAhead[];
}

export interface StreamFill {
  /** the player of yours who is out of the week */
  for: ModelPlayer;
  reason: 'bye' | 'out';
}

export interface StreamCard {
  key: StreamPos;
  label: string;
  /** lineup slots this card is compared against */
  slots: Slot[];
  rows: StreamRow[];
  /** null when none of your usual starters at the position is on bye or out */
  fill: StreamFill | null;
  /** free agents considered, before the top-five cut */
  candidates: number;
}

export interface StreamBoard {
  week: number;
  /** weeks the toggle offers: next week and the one after, inside the season */
  weeks: number[];
  /** bye-fill positions first, then the usual order */
  cards: StreamCard[];
  /** the single best stream: the biggest upgrade among the cards' top rows; null when nothing beats your starters */
  best: { card: StreamCard; row: StreamRow } | null;
  /** positions that need a bye or injury fill */
  fills: StreamCard[];
}

export interface StreamOpts {
  /** the week to stream for (default next week; clamped into next week .. last week of the model) */
  week?: number;
  /** positions to build; the default is every position the league can use. Positions with no slot are dropped either way. */
  positions?: readonly StreamPos[];
  scenario?: Scenario;
  meRid?: number;
  /** rows per position (default 5) */
  limit?: number;
}

/** The weeks a streamer can be picked for: next week and the one after, never past the season. */
export function streamWeeks(model: Model): number[] {
  const { currentWeek: cur, maxWeek } = model.meta;
  return [cur + 1, cur + 2].filter((w) => w <= maxWeek);
}

const isOut = (p: ModelPlayer): boolean => p.onIr || OUT_STATUS.has(p.injury);
const hasGame = (p: ModelPlayer, w: number): boolean => !!p.opp[w] && p.opp[w] !== 'BYE';

/** The slots a card compares against, [] when the league has no use for the position. */
export function cardSlots(model: Model, key: StreamPos): Slot[] {
  const slots = model.meta.slots;
  if (key === 'FLEX') return slots.filter((s) => s !== 'SUPER_FLEX' && (ELIG[s]?.length ?? 0) > 1 && (fits(s, 'RB') || fits(s, 'WR')));
  const own = slots.filter((s) => s === key);
  if (own.length) return own;
  if (key === 'DL' || key === 'LB' || key === 'DB') return slots.filter((s) => s === 'IDP_FLEX');
  return [];
}

/** Positions with the card's candidates: flex fliers are RB/WR, every other card is its own position. */
const candidatePos = (key: StreamPos): readonly Pos[] => (key === 'FLEX' ? ['RB', 'WR'] : [key]);

function aheadOf(p: ModelPlayer, week: number, maxWeek: number): StreamAhead[] {
  const out: StreamAhead[] = [];
  for (let w = week; w < week + 3 && w <= maxWeek; w++) out.push({ week: w, opp: p.opp[w] || 'BYE', dvp: p.dvp[w] ?? null });
  return out;
}

/** His usual projection: the mean of his positive projections in the other weeks (season average when there are none). */
function usual(p: ModelPlayer, week: number, cur: number, maxWeek: number): number {
  const v: number[] = [];
  for (let w = cur; w <= maxWeek; w++) if (w !== week && (p.mu[w] ?? 0) > 0) v.push(p.mu[w]!);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : (p.seasonAvg ?? 0);
}

function fillFor(sc: Scope, key: StreamPos, slots: Slot[], week: number): StreamFill | null {
  if (key === 'FLEX' || !slots.length) return null;
  const { currentWeek: cur, maxWeek } = sc.model.meta;
  const mine = sc.myRoster().map((id) => sc.idx.P[id]).filter((p): p is ModelPlayer => !!p && p.pos === key && !p.onIr);
  const core = mine.map((p) => [p, usual(p, week, cur, maxWeek)] as const).sort((a, b) => b[1] - a[1]).slice(0, slots.length).map(([p]) => p);
  for (const p of core) {
    if (!hasGame(p, week)) return { for: p, reason: 'bye' };
    if (OUT_STATUS.has(p.injury)) return { for: p, reason: 'out' };
  }
  return null;
}

/** Ranked streaming candidates per position for one week, scored against the optimizer's lineup for that week. */
export function streamers(model: Model, opts: StreamOpts = {}): StreamBoard {
  const { currentWeek: cur, maxWeek } = model.meta;
  const weeks = streamWeeks(model);
  const week = Math.min(Math.max(opts.week ?? cur + 1, cur + 1), Math.max(maxWeek, cur + 1));
  const board: StreamBoard = { week, weeks, cards: [], best: null, fills: [] };
  if (week > maxWeek) return board;

  const scenario = opts.scenario ?? emptyScenario();
  const sc = createScope(model, scenario, opts.meRid ?? model.meRid);
  const limit = opts.limit ?? STREAM_TOP;
  const wanted = opts.positions ? new Set(opts.positions) : null;
  const lineup = sc.lineup(sc.myRoster(), week, true);
  const adds = new Set(scenario.adds);
  const pool = model.players.filter((p) => p.ownerRid === 0 && !adds.has(p.pid) && !isOut(p) && hasGame(p, week) && sc.val(p, week, true) > 0);

  const cards: StreamCard[] = [];
  for (const key of STREAM_ORDER) {
    if (wanted && !wanted.has(key)) continue;
    const slots = cardSlots(model, key);
    if (!slots.length) continue;
    const kinds = candidatePos(key);
    const cands = pool.filter((p) => kinds.includes(p.pos));
    // the starters this card can replace, by slot
    const inCard = lineup.slots.filter((s) => slots.includes(s.slot));
    const rows = cands.map((p): StreamRow => {
      const proj = sc.val(p, week, true);
      const [floor, ceil] = sc.range(p, week, true);
      const open = inCard.filter((s) => fits(s.slot, p.pos));
      let starter: ModelPlayer | null = null, starterProj = 0;
      for (const [i, s] of open.entries()) {
        const v = s.p ? sc.val(s.p, week, true) : 0;
        // a starter with nothing projected (bye, out) is an open slot
        if (i === 0 || v < starterProj) { starter = v > 0 ? s.p : null; starterProj = v; }
      }
      const diff = proj - starterProj;
      const next = week + 1 <= maxWeek ? sc.val(p, week + 1, true) : 0;
      return {
        pid: p.pid, player: p, week, opp: p.opp[week]!, dvp: p.dvp[week] ?? null, proj, floor, ceil,
        starter, starterProj, diff, upgrade: diff > UPGRADE_MIN, twoWeek: proj + next, hold: false, ahead: aheadOf(p, week, maxWeek),
      };
    });
    // rank by the projection alone (the grade is context); ties go to the two-week total, then the name
    rows.sort((a, b) => b.proj - a.proj || b.twoWeek - a.twoWeek || a.player.name.localeCompare(b.player.name));
    let hold: StreamRow | null = null;
    for (const r of rows) if (week + 1 <= maxWeek && hasGame(r.player, week + 1) && (!hold || r.twoWeek > hold.twoWeek)) hold = r;
    if (hold) hold.hold = true;
    cards.push({ key, label: STREAM_LABEL[key], slots, rows: rows.slice(0, limit), fill: fillFor(sc, key, slots, week), candidates: rows.length });
  }

  // a position that needs a fill goes first; otherwise the usual order stands
  board.cards = [...cards.filter((c) => c.fill), ...cards.filter((c) => !c.fill)];
  board.fills = board.cards.filter((c) => c.fill);
  for (const c of board.cards) {
    const top = c.rows[0];
    if (top && top.upgrade && (!board.best || top.diff > board.best.row.diff)) board.best = { card: c, row: top };
  }
  // a position that needs a fill wins the headline over a bigger upgrade elsewhere: the hole costs a whole starter
  const fillBest = board.fills.map((c) => ({ card: c, row: c.rows[0] })).filter((x): x is { card: StreamCard; row: StreamRow } => !!x.row && x.row.upgrade);
  if (fillBest.length) board.best = fillBest.sort((a, b) => b.row.diff - a.row.diff)[0]!;
  return board;
}
