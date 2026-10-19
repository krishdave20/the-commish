/* Real trades: read them from Sleeper's transactions, then grade both sides.

   PARSING. Sleeper lists a trade as { type: 'trade', status: 'complete', roster_ids, adds, drops, draft_picks, waiver_budget }. `adds` maps a
   player id to the roster that RECEIVED him and `drops` maps it to the roster that SENT him. Picks are { season, round, roster_id (original
   owner), previous_owner_id (sender), owner_id (receiver) } and FAAB is { sender, receiver, amount }. Only completed trades count (not
   pending, failed or vetoed ones). Trades of three or more teams are kept as they are.

   GRADING (approximate, and labelled so). The league does not store old projections, so a trade cannot be re-scored with the numbers that
   existed that week. What is done instead, for each side, from the trade's week to the end of the season:
     lineup swing = best lineup WITH the deal minus best lineup WITHOUT it, summed over every week from the trade's week on, where
       weeks already played use the points players ACTUALLY scored, and weeks to come use today's projections (the model's mu, with its
       injury and IR rules). The rosters are today's, with the deal put in (with) or taken out (without): a player picked up later
       or dropped since is treated as if the trade had been the only move.
     points since = points actually scored since the trade by the players received, minus the players sent (completed weeks only).
     value now (dynasty only) = FantasyCalc value of what came in minus what went out.
   GRADE = score per week = (your swing ÷ weeks) − 0.4 × (the other side's swing ÷ weeks), so a deal both sides gain from grades well for
   both, and a deal that took something from the other side grades badly for the loser. GRADE_CUTS maps the score to a letter.
   WINNER = the side with the bigger swing, when the gap is at least DECISIVE_PER_WEEK points a week; otherwise "even".
   LABELS. "fleece of the week": in each week, the trade with the biggest gap, when it is decisive, the gap is at least FLEECE_MIN_POINTS and the
   loser's swing is negative.
   "trade of the year": the decisive trade with the biggest gap over the whole season so far. */
import type { Transaction } from '../../data/types.ts';
import { bestTotal } from '../lineup.ts';
import { createScope, emptyScenario, type Scenario } from '../scenario.ts';
import { simInputFor } from '../simInput.ts';
import { TRADE_SIM_RUNS } from '../trades.ts';
import type { SimInput } from '../sim.ts';
import type { ByWeek, Model, ModelPlayer } from '../types.ts';

/* ---------- parsing ---------- */

export interface PickMove { season: string; round: number; /** the roster that originally owned the pick */ from: number }

export interface TradeTeam {
  rid: number;
  /** player ids received / sent */
  got: string[];
  sent: string[];
  picksGot: PickMove[];
  picksSent: PickMove[];
  /** FAAB dollars received minus sent */
  faab: number;
}

export interface RealTrade {
  id: string;
  /** the week the trade went through */
  week: number;
  /** epoch ms the trade was made */
  at: number;
  teams: TradeTeam[];
}

type WeekTransactions = Readonly<Record<number, readonly Transaction[] | null | undefined>>;

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Completed trades from `transactions(leagueId, week)` for each week, oldest first. */
export function parseTrades(byWeek: WeekTransactions): RealTrade[] {
  const out: RealTrade[] = [];
  for (const wk of Object.keys(byWeek).map(Number).sort((a, b) => a - b)) {
    for (const tx of byWeek[wk] ?? []) {
      if (tx.type !== 'trade' || tx.status !== 'complete') continue;
      const teams = new Map<number, TradeTeam>();
      const team = (rid: number) => {
        let t = teams.get(rid);
        if (!t) { t = { rid, got: [], sent: [], picksGot: [], picksSent: [], faab: 0 }; teams.set(rid, t); }
        return t;
      };
      for (const rid of tx.roster_ids ?? []) team(rid);
      for (const [pid, rid] of Object.entries(tx.adds ?? {})) team(rid).got.push(pid);
      for (const [pid, rid] of Object.entries(tx.drops ?? {})) team(rid).sent.push(pid);
      const picks = Array.isArray(tx.draft_picks) ? (tx.draft_picks as Array<Record<string, unknown>>) : [];
      for (const p of picks) {
        if (!p || typeof p !== 'object') continue;
        const season = String(p.season ?? ''), round = num(p.round), from = num(p.roster_id), prev = num(p.previous_owner_id), to = num(p.owner_id);
        if (!season || round === null || from === null || prev === null || to === null) continue;
        const move = { season, round, from };
        team(to).picksGot.push(move);
        team(prev).picksSent.push(move);
      }
      const faab = Array.isArray(tx.waiver_budget) ? (tx.waiver_budget as Array<Record<string, unknown>>) : [];
      for (const f of faab) {
        const amount = num(f.amount), sender = num(f.sender), receiver = num(f.receiver);
        if (amount === null || sender === null || receiver === null) continue;
        team(receiver).faab += amount;
        team(sender).faab -= amount;
      }
      if (teams.size < 2) continue;
      out.push({ id: tx.transaction_id, week: wk, at: num(tx.created) ?? num(tx.status_updated) ?? 0, teams: [...teams.values()].sort((a, b) => a.rid - b.rid) });
    }
  }
  return out.sort((a, b) => a.week - b.week || a.at - b.at);
}

/* ---------- grading ---------- */

export type Letter = 'A+' | 'A' | 'A−' | 'B+' | 'B' | 'B−' | 'C+' | 'C' | 'C−' | 'D+' | 'D' | 'D−' | 'F';

/** score (points a week) at or above → letter; below the last cut is an F */
export const GRADE_CUTS: ReadonlyArray<[number, Letter]> = [
  [2.0, 'A+'], [1.5, 'A'], [1.0, 'A−'], [0.7, 'B+'], [0.4, 'B'], [0.15, 'B−'],
  [-0.15, 'C+'], [-0.4, 'C'], [-0.7, 'C−'], [-1.0, 'D+'], [-1.5, 'D'], [-2.0, 'D−'],
];
export const OTHER_SIDE_WEIGHT = 0.4;
export const DECISIVE_PER_WEEK = 0.4;
/** a fleece needs a gap of at least this many lineup points, on top of being decisive */
export const FLEECE_MIN_POINTS = 15;

export const letterFor = (scorePerWeek: number): Letter => {
  for (const [cut, l] of GRADE_CUTS) if (scorePerWeek >= cut) return l;
  return 'F';
};

export interface PlayerRef { pid: string; name: string; pos: string; nfl: string | null }

export interface TradeSideGrade {
  rid: number;
  team: string;
  isMe: boolean;
  got: PlayerRef[];
  sent: PlayerRef[];
  picksGot: PickMove[];
  picksSent: PickMove[];
  faab: number;
  /** points actually scored since the trade (completed weeks) by what came in / went out */
  ptsGot: number;
  ptsSent: number;
  /** completed weeks counted in those two */
  weeksSince: number;
  /** lineup swing over the weeks already played (actual points) and over the weeks to come (today's projections) */
  past: number;
  ahead: number;
  swing: number;
  /** weeks the swing runs over, trade week to the last playoff week */
  weeks: number;
  /** swing ÷ weeks */
  perWeek: number;
  /** the number the letter comes from */
  score: number;
  grade: Letter;
  /** dynasty only */
  valueGot: number | null;
  valueSent: number | null;
  /** players with no row in the model (not scored) */
  unscored: number;
}

export interface TradeLabel { kind: 'trade of the year' | 'fleece of the week'; text: string }

export interface TradeGrade {
  trade: RealTrade;
  sides: TradeSideGrade[];
  /** roster id of the winner; null when even */
  winner: number | null;
  /** biggest swing minus smallest, points */
  margin: number;
  marginPerWeek: number;
  decisive: boolean;
  labels: TradeLabel[];
}

export interface GradeOptions {
  scenario?: Scenario;
  /** names for players the model does not carry (dropped to waivers and trimmed from the pool) */
  lookup?: (pid: string) => Partial<PlayerRef> | null;
  /** dynasty: FantasyCalc value by player id */
  values?: Readonly<Record<string, number | null>> | null;
}

const f1 = (x: number) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(1);
const signed = (x: number) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(1);

/** Weeks from a trade's week to the last playoff week (inclusive). */
export function tradeWeeks(model: Model, week: number): number[] {
  const { lastRegularWeek: last, playoffWeeks } = model.meta;
  const po = playoffWeeks.length ? playoffWeeks : [last + 1];
  const ws: number[] = [];
  for (let w = Math.max(1, week); w <= last; w++) ws.push(w);
  return ws.concat(po);
}

function rosterWith(model: Model, rid: number, t: TradeTeam, applied: boolean, byPid: ReadonlyMap<string, ModelPlayer>): ModelPlayer[] {
  const out = new Set(applied ? t.sent : t.got), into = applied ? t.got : t.sent;
  const have = model.players.filter((p) => p.ownerRid === rid && !out.has(p.pid));
  const hav = new Set(have.map((p) => p.pid));
  for (const pid of into) { const p = byPid.get(pid); if (p && !hav.has(pid)) { have.push(p); hav.add(pid); } }
  return have;
}

export function gradeTrades(model: Model, trades: readonly RealTrade[], o: GradeOptions = {}): TradeGrade[] {
  const { currentWeek: cur, slots } = model.meta;
  const byPid = new Map(model.players.map((p) => [p.pid, p]));
  const teamName = new Map(model.teams.map((t) => [t.rid, t.team]));
  const values = o.values ?? null;
  const ref = (pid: string): PlayerRef => {
    const p = byPid.get(pid), l = o.lookup?.(pid);
    return { pid, name: p?.name ?? l?.name ?? `player ${pid}`, pos: p?.pos ?? l?.pos ?? '?', nfl: p?.nfl ?? l?.nfl ?? null };
  };
  const actual = (p: ModelPlayer, w: number) => p.pts[w] ?? 0;
  const lineup = (players: readonly ModelPlayer[], w: number) => (w < cur
    ? bestTotal(players, slots, (p) => actual(p, w))
    : bestTotal(players.filter((p) => !p.onIr || w >= cur + 4), slots, (p) => p.mu[w] || 0));

  const graded: TradeGrade[] = trades.map((trade) => {
    const ws = tradeWeeks(model, trade.week);
    const sides: TradeSideGrade[] = trade.teams.map((t) => {
      const withR = rosterWith(model, t.rid, t, true, byPid), withoutR = rosterWith(model, t.rid, t, false, byPid);
      let past = 0, ahead = 0;
      for (const w of ws) {
        const d = lineup(withR, w) - lineup(withoutR, w);
        if (w < cur) past += d; else ahead += d;
      }
      const done = ws.filter((w) => w < cur);
      const pts = (ids: readonly string[]) => ids.reduce((s, id) => { const p = byPid.get(id); return p ? s + done.reduce((a, w) => a + actual(p, w), 0) : s; }, 0);
      const swing = past + ahead;
      return {
        rid: t.rid, team: teamName.get(t.rid) ?? `team ${t.rid}`, isMe: t.rid === model.meRid,
        got: t.got.map(ref), sent: t.sent.map(ref), picksGot: t.picksGot, picksSent: t.picksSent, faab: t.faab,
        ptsGot: pts(t.got), ptsSent: pts(t.sent), weeksSince: done.length,
        past, ahead, swing, weeks: ws.length, perWeek: swing / ws.length, score: 0, grade: 'C+' as Letter,
        valueGot: values ? t.got.reduce((s, id) => s + (values[id] ?? 0), 0) : null,
        valueSent: values ? t.sent.reduce((s, id) => s + (values[id] ?? 0), 0) : null,
        unscored: [...t.got, ...t.sent].filter((id) => !byPid.has(id)).length,
      };
    });
    for (const s of sides) {
      const others = sides.filter((x) => x !== s);
      const otherMean = others.length ? others.reduce((a, x) => a + x.perWeek, 0) / others.length : 0;
      s.score = s.perWeek - OTHER_SIDE_WEIGHT * otherMean;
      s.grade = letterFor(s.score);
    }
    const ranked = [...sides].sort((a, b) => b.swing - a.swing);
    const weeks = sides[0]?.weeks ?? 1;
    const margin = (ranked[0]?.swing ?? 0) - (ranked[ranked.length - 1]?.swing ?? 0);
    const decisive = margin / weeks >= DECISIVE_PER_WEEK;
    return { trade, sides, winner: decisive ? ranked[0]!.rid : null, margin, marginPerWeek: margin / weeks, decisive, labels: [] };
  });

  // labels
  const lose = (g: TradeGrade) => [...g.sides].sort((a, b) => a.swing - b.swing)[0]!;
  const win = (g: TradeGrade) => g.sides.find((s) => s.rid === g.winner)!;
  const line = (g: TradeGrade) => `${win(g).team} ${signed(win(g).swing)} lineup points to ${lose(g).team} ${signed(lose(g).swing)}`;
  const weeksWithTrades = [...new Set(graded.map((g) => g.trade.week))];
  for (const wk of weeksWithTrades) {
    const pick = graded.filter((g) => g.trade.week === wk && g.decisive && g.margin >= FLEECE_MIN_POINTS && lose(g).swing < 0).sort((a, b) => b.margin - a.margin)[0];
    if (pick) pick.labels.push({ kind: 'fleece of the week', text: `fleece of the week ${wk}: ${line(pick)}` });
  }
  const year = graded.filter((g) => g.decisive).sort((a, b) => b.margin - a.margin)[0];
  if (year) year.labels.push({ kind: 'trade of the year', text: `trade of the year so far: ${line(year)}, a ${f1(year.margin)} point gap` });
  return graded;
}

/* ---------- playoff odds with and without a real trade ---------- */

export interface TradeSimPair { without: SimInput; with: SimInput }

/** Two simulations of today's season: with the trade in place, and with it undone for every team in it. The playoff odds of each side
    in the pair, difference, is what the deal is worth to them today (not what it was worth the week it happened). */
export function tradeSimPair(model: Model, trade: RealTrade, scenario?: Scenario, o: { runs?: number } = {}): TradeSimPair {
  const scen = scenario ?? emptyScenario();
  const sc = createScope(model, scen, model.meRid);
  const byPid = new Map(model.players.map((p) => [p.pid, p]));
  const cur = model.meta.currentWeek;
  const opts = { runs: o.runs ?? TRADE_SIM_RUNS, volatility: scen.volatility, meRid: model.meRid };
  const build = (applied: boolean) => {
    const ov: Record<number, ByWeek<number>> = {};
    for (const t of trade.teams) {
      const roster = rosterWith(model, t.rid, t, applied, byPid);
      const mine = t.rid === model.meRid;
      ov[t.rid] = {};
      for (let w = cur + 1; w <= model.meta.maxWeek; w++) {
        ov[t.rid]![w] = sc.total(roster.filter((p) => mine || !p.onIr || w >= cur + 4).map((p) => p.pid), w, mine);
      }
    }
    return simInputFor(model, sc.teamMeans(undefined, ov), opts);
  };
  return { without: build(false), with: build(true) };
}
