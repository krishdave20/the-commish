/* Draft grades for the league's real, completed draft. Pure: give it the rankings, the saved picks, what each drafted player has
   scored and is projected to score, and today's rosters.

   Two grades per team, each a letter on the same scale as the mock draft (letterGrade: the team's rank percentile in the league):

   DRAFT DAY (approximate). Sleeper only serves *current* season projections and ADP, not the numbers on draft day. ADP barely moves
   after a draft; projections do (injuries, roles). So this grade is "what the draft looked like using today's projections and ADP".
     per team:  vor    = Σ max(0, VOR) of its picks   (below-replacement picks are not worth anything over a free agent)
                lineup = projected points of its best starting lineup (optimizeLineup on season points, as the mock draft grades)
                adp    = Σ clip(pick number − ADP, ±ADP_CLIP) over picks that have an ADP (positive = it got players later than the market)
     score = 0.45·z(vor) + 0.35·z(lineup) + 0.20·z(adp), z = (x − league mean) ÷ league SD (0 when everyone ties).
     Rank by score, percentile = (teams − rank) ÷ (teams − 1), letter = letterGrade(percentile).

   HINDSIGHT. For every pick, total = points scored so far + projected rest-of-season points (when known). Raw points favour
   positions that score more (a late quarterback always out-scores a late running back), so each total is first measured against
   a replacement player at his position: value = max(0, total − replacement), where replacement is the total of the N-th best player
   in the league's player pool at that position (N = the league's starters there, rankings.starters; the pool is the rostered players
   and tracked free agents when the caller passes it, else the drafted players; 0 for a position with no starting slot). The expected
   value at a pick number is a smoothed median curve over this draft's own values (smoothedMedianCurve: a rolling median of
   ±EXPECT_RADIUS picks, pooled so it never rises as the pick number grows).
   "Points over pick expectation" = value − expected(pick number). A team's hindsight is the sum over its picks, ranked and
   lettered the same way. It scores the pick, not the team's results: a player the team later dropped still counts all of his
   points. Players the team no longer holds are flagged (traded / dropped).

   MOVEMENT is the draft-day letter → the hindsight letter (and the rank change).

   HIGHLIGHTS (all rules over the numbers above): steals and busts (largest and smallest points over expectation), the best pick of
   each round, each team's MVP pick (most value) and "the one that got away" (below). */
import type { DraftPick, StatLine } from '../../data/types.ts';
import { optimizeLineup } from '../lineup.ts';
import { letterGrade } from './mock.ts';
import { pickValues } from './live.ts';
import type { RankedPlayer, Rankings } from './rankings.ts';

export const DRAFT_DAY_WEIGHTS = { vor: 0.45, lineup: 0.35, adp: 0.2 } as const;
/** one pick's value vs ADP counts at most this many picks either way in the draft-day score (two rounds in a 12-team league) */
export const ADP_CLIP = 24;
/** half-width, in picks, of the rolling median behind the expectation curve */
export const EXPECT_RADIUS = 6;
/** a "got away" player has to come off the board within a round of picks after the team's pick, and at least this many */
export const GOT_AWAY_WINDOW_MIN = 6;
/** how many steals and busts the league lists */
export const HIGHLIGHT_COUNT = 5;

/** What a drafted player has done. `ros` is null when no projection is known (he is on no tracked roster). */
export interface PlayerResult {
  /** fantasy points scored so far this season, with the league's scoring */
  toDate: number;
  /** projected points for the rest of the regular season, null when unknown */
  ros: number | null;
}

export interface GradeInput {
  rankings: Rankings;
  /** the draft's picks (any order) */
  picks: readonly DraftPick[];
  /** pid → result; a pid missing here scored 0 */
  performance: Readonly<Record<string, PlayerResult>>;
  /** today's rosters: roster id → Sleeper ids */
  rosters: Readonly<Record<number, readonly string[]>>;
  /** every roster that should be graded (default: the rosters that made a pick) */
  rosterIds?: readonly number[];
  /** everyone in the league's player pool (rostered players and the free agents the model tracks) with his total (points so far + rest of season):
      the field replacement level is read from. Default: the drafted players only. */
  pool?: ReadonlyArray<{ pos: string; total: number }>;
  /** half-width of the expectation curve's rolling median (default EXPECT_RADIUS) */
  expectRadius?: number;
  /** how many picks after a team's pick a same-position player can come off the board and still "get away" (default: a round, at least GOT_AWAY_WINDOW_MIN) */
  gotAwayWindow?: number;
}

export type KeptStatus = 'kept' | 'traded' | 'dropped';

export interface PickGrade {
  pickNo: number;
  round: number;
  /** the draft slot of the pick (its place within the round: 1.01 is round 1, slot 1) */
  slot: number;
  /** the drafting team */
  rosterId: number;
  pid: string;
  name: string;
  pos: string;
  /** NFL team code when known */
  nfl: string | null;
  adp: number | null;
  /** pick number − ADP: positive = a steal. null without ADP. */
  valueVsAdp: number | null;
  vor: number;
  /** projected season points (today's projection) */
  projected: number;
  toDate: number;
  ros: number | null;
  /** toDate + ros */
  total: number;
  /** points above a replacement player at his position (never below 0: under replacement is worth nothing over a free agent) */
  value: number;
  /** the expected value for this pick number */
  expected: number;
  /** value − expected: points over pick expectation */
  overExp: number;
  /** where he is now */
  status: KeptStatus;
  /** the roster that holds him now, 0 = on none */
  ownerRid: number;
}

export interface Grade {
  letter: string;
  rank: number;
  percentile: number;
}

export interface DraftDayGrade extends Grade {
  vor: number;
  lineup: number;
  adp: number;
  score: number;
}

export interface HindsightGrade extends Grade {
  /** Σ total over the picks (raw points) */
  total: number;
  /** Σ expected over the picks (in value) */
  expected: number;
  /** Σ points over expectation: what the grade ranks */
  overExp: number;
}

export interface GotAway {
  /** the team's own pick */
  mine: PickGrade;
  /** the same-position player taken just after it */
  theirs: PickGrade;
  /** theirs.total − mine.total */
  gap: number;
}

export interface TeamGrade {
  rosterId: number;
  picks: PickGrade[];
  draftDay: DraftDayGrade;
  hindsight: HindsightGrade;
  /** draft-day rank − hindsight rank: positive = the draft aged well */
  rankChange: number;
  /** letter steps up (+) or down (−) on the scale */
  steps: number;
  kept: number;
  traded: number;
  dropped: number;
  /** the pick with the most value (points above a replacement player at his position) */
  mvp: PickGrade | null;
  /** most points over expectation */
  best: PickGrade | null;
  /** fewest points over expectation */
  worst: PickGrade | null;
  gotAway: GotAway | null;
}

export interface DraftGrades {
  teams: TeamGrade[];
  /** pick number → expected value */
  curve: number[];
  /** position → replacement total (the baseline each total is measured against) */
  replacement: Record<string, number>;
  picks: PickGrade[];
  steals: PickGrade[];
  busts: PickGrade[];
  bestByRound: Array<{ round: number; pick: PickGrade }>;
  /** the draft's size */
  rounds: number;
  teamCount: number;
}

/* ---------- small helpers ---------- */

/** F … A on the same scale as `letterGrade`, worst first (there is no A+ and no F+ / D-). */
export const LETTER_SCALE: readonly string[] = ['F', 'D', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A'];

/** How many letters up (+) or down (−) the scale `to` is from `from`. */
export const letterSteps = (from: string, to: string): number => LETTER_SCALE.indexOf(to) - LETTER_SCALE.indexOf(from);

/** Show a grade with a real minus sign ("A−"). */
export const showLetter = (letter: string): string => letter.replace('-', '−');

const percentileOf = (rank: number, teams: number) => (teams > 1 ? (teams - rank) / (teams - 1) : 1);

function zScores(xs: readonly number[]): number[] {
  const n = xs.length;
  if (n === 0) return [];
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / n);
  return xs.map((x) => (sd > 1e-9 ? (x - m) / sd : 0));
}

const median = (xs: readonly number[]): number => {
  if (!xs.length) return 0;
  const a = xs.slice().sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/** Rank by a score (high = 1), ties by roster id. */
function rankBy<T extends { rosterId: number }>(rows: readonly T[], score: (r: T) => number): Map<number, number> {
  const sorted = rows.slice().sort((a, b) => score(b) - score(a) || a.rosterId - b.rosterId);
  return new Map(sorted.map((r, i) => [r.rosterId, i + 1]));
}

/** The expected value at each position of a list ordered best-pick-first: a rolling median of ±`radius` neighbours (the window slides
    inward at the ends so it keeps its width), then made never to rise (a later pick is not expected to beat an earlier one) by pooling
    adjacent positions that break the order into their average (pool adjacent violators), which keeps the curve's total unbiased. */
export function smoothedMedianCurve(values: readonly number[], radius = EXPECT_RADIUS): number[] {
  const n = values.length;
  if (n === 0) return [];
  const width = Math.min(n, 2 * radius + 1);
  const blocks: Array<{ sum: number; count: number }> = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, Math.min(i - radius, n - width));
    blocks.push({ sum: median(values.slice(lo, lo + width)), count: 1 });
    // pool while the block before is lower than this one
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!, a = blocks[blocks.length - 2]!;
      if (a.sum / a.count >= b.sum / b.count) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, count: a.count + b.count });
    }
  }
  return blocks.flatMap((b) => new Array<number>(b.count).fill(b.sum / b.count));
}

/** The replacement total at each position: the total of the `starters[pos]`-th best player in the pool there (the lowest if the pool is
    smaller); a position with no starting slot has none (0). */
export function replacementTotals(players: ReadonlyArray<{ pos: string; total: number }>, starters: Readonly<Record<string, number>>): Record<string, number> {
  const byPos: Record<string, number[]> = {};
  for (const p of players) if (p.pos) (byPos[p.pos] ??= []).push(p.total);
  const out: Record<string, number> = {};
  for (const [pos, list] of Object.entries(byPos)) {
    const n = starters[pos] ?? 0;
    if (n <= 0) continue;
    const sorted = list.slice().sort((a, b) => b - a);
    out[pos] = sorted[Math.min(n, sorted.length) - 1]!;
  }
  return out;
}

/* ---------- the grades ---------- */

const metaOf = (p: DraftPick): { name?: string; pos?: string; team?: string } => {
  const m = p.metadata as Record<string, unknown> | null | undefined;
  if (!m || typeof m !== 'object') return {};
  const first = typeof m.first_name === 'string' ? m.first_name : '';
  const last = typeof m.last_name === 'string' ? m.last_name : '';
  return {
    name: `${first} ${last}`.trim() || undefined,
    pos: typeof m.position === 'string' ? m.position : undefined,
    team: typeof m.team === 'string' ? m.team : undefined,
  };
};

export function gradeDraft(input: GradeInput): DraftGrades {
  const { rankings, performance } = input;
  const picks = input.picks.filter((p) => p.roster_id != null && p.player_id).slice().sort((a, b) => a.pick_no - b.pick_no);
  const teamCount = Math.max(1, input.rosterIds?.length ?? new Set(picks.map((p) => p.roster_id)).size);
  const owner = new Map<string, number>();
  for (const [rid, ids] of Object.entries(input.rosters)) for (const pid of ids) owner.set(pid, Number(rid));

  // totals, then values against a replacement player at the position, then the expectation curve of the values
  const totals = picks.map((p) => {
    const perf = performance[p.player_id];
    return (perf?.toDate ?? 0) + (perf?.ros ?? 0);
  });
  const posOf = picks.map((p) => rankings.byPid[p.player_id]?.pos ?? metaOf(p).pos ?? '');
  const replacement = replacementTotals(input.pool ?? posOf.map((pos, i) => ({ pos, total: totals[i]! })), rankings.starters);
  const values = totals.map((t, i) => Math.max(0, t - (replacement[posOf[i]!] ?? 0)));
  const curve = smoothedMedianCurve(values, input.expectRadius);
  const adpValues = pickValues(rankings, picks);

  const pickGrades: PickGrade[] = picks.map((p, i) => {
    const r: RankedPlayer | undefined = rankings.byPid[p.player_id];
    const meta = metaOf(p);
    const perf = performance[p.player_id];
    const own = owner.get(p.player_id) ?? 0;
    const rosterId = p.roster_id as number;
    const toDate = perf?.toDate ?? 0, ros = perf?.ros ?? null;
    return {
      pickNo: p.pick_no, round: p.round, slot: typeof p.draft_slot === 'number' ? p.draft_slot : ((p.pick_no - 1) % teamCount) + 1, rosterId, pid: p.player_id,
      name: r?.name ?? meta.name ?? p.player_id, pos: posOf[i]!, nfl: r?.team ?? meta.team ?? null,
      adp: r?.adp ?? null, valueVsAdp: adpValues[i]!.value, vor: r?.vor ?? 0, projected: r?.points ?? 0,
      toDate, ros, total: totals[i]!, value: values[i]!, expected: curve[i]!, overExp: values[i]! - curve[i]!,
      status: own === rosterId ? 'kept' : own > 0 ? 'traded' : 'dropped', ownerRid: own,
    };
  });

  const ids = [...(input.rosterIds ?? [])];
  for (const p of pickGrades) if (!ids.includes(p.rosterId)) ids.push(p.rosterId);
  ids.sort((a, b) => a - b);

  // draft day
  const base = ids.map((rosterId) => {
    const mine = pickGrades.filter((p) => p.rosterId === rosterId);
    const players = mine.map((p) => rankings.byPid[p.pid]).filter((r): r is RankedPlayer => !!r);
    const vor = mine.reduce((s, p) => s + Math.max(0, p.vor), 0);
    const lineup = optimizeLineup(players, rankings.slots, { value: (p) => p.points }).total;
    const adp = mine.reduce((s, p) => s + (p.valueVsAdp == null ? 0 : Math.max(-ADP_CLIP, Math.min(ADP_CLIP, p.valueVsAdp))), 0);
    return { rosterId, mine, vor, lineup, adp };
  });
  const zV = zScores(base.map((b) => b.vor)), zL = zScores(base.map((b) => b.lineup)), zA = zScores(base.map((b) => b.adp));
  const scored = base.map((b, i) => ({ ...b, score: DRAFT_DAY_WEIGHTS.vor * zV[i]! + DRAFT_DAY_WEIGHTS.lineup * zL[i]! + DRAFT_DAY_WEIGHTS.adp * zA[i]! }));
  const ddRank = rankBy(scored, (b) => b.score);
  const hsRank = rankBy(scored, (b) => b.mine.reduce((s, p) => s + p.overExp, 0));
  const n = scored.length;

  const teams: TeamGrade[] = scored.map((b) => {
    const dRank = ddRank.get(b.rosterId)!, hRank = hsRank.get(b.rosterId)!;
    const dPct = percentileOf(dRank, n), hPct = percentileOf(hRank, n);
    const draftDay: DraftDayGrade = { vor: b.vor, lineup: b.lineup, adp: b.adp, score: b.score, rank: dRank, percentile: dPct, letter: letterGrade(dPct) };
    const hindsight: HindsightGrade = {
      total: b.mine.reduce((s, p) => s + p.total, 0), expected: b.mine.reduce((s, p) => s + p.expected, 0),
      overExp: b.mine.reduce((s, p) => s + p.overExp, 0), rank: hRank, percentile: hPct, letter: letterGrade(hPct),
    };
    const sorted = b.mine.slice().sort((x, y) => y.overExp - x.overExp || x.pickNo - y.pickNo);
    const mvp = b.mine.slice().sort((x, y) => y.value - x.value || x.pickNo - y.pickNo)[0] ?? null;
    return {
      rosterId: b.rosterId, picks: b.mine, draftDay, hindsight, rankChange: dRank - hRank, steps: letterSteps(draftDay.letter, hindsight.letter),
      kept: b.mine.filter((p) => p.status === 'kept').length, traded: b.mine.filter((p) => p.status === 'traded').length,
      dropped: b.mine.filter((p) => p.status === 'dropped').length,
      mvp, best: sorted[0] ?? null, worst: sorted[sorted.length - 1] ?? null, gotAway: null,
    };
  });

  // the one that got away: for each of a team's picks, the best same-position player taken by someone else within the next
  // window (a round of picks) who ended up with more points; the team's biggest such gap
  const window = input.gotAwayWindow ?? Math.max(GOT_AWAY_WINDOW_MIN, n);
  for (const t of teams) {
    let best: GotAway | null = null;
    for (const mine of t.picks) {
      for (const c of pickGrades) {
        if (c.pickNo <= mine.pickNo || c.pickNo > mine.pickNo + window || c.rosterId === mine.rosterId || c.pos !== mine.pos) continue;
        const gap = c.total - mine.total;
        if (gap > 0 && (!best || gap > best.gap || (gap === best.gap && mine.pickNo < best.mine.pickNo))) best = { mine, theirs: c, gap };
      }
    }
    t.gotAway = best;
  }

  const byOver = pickGrades.slice().sort((a, b) => b.overExp - a.overExp || a.pickNo - b.pickNo);
  const steals = byOver.filter((p) => p.overExp > 0).slice(0, HIGHLIGHT_COUNT);
  const busts = byOver.filter((p) => p.overExp < 0).reverse().slice(0, HIGHLIGHT_COUNT);
  const rounds = pickGrades.reduce((m, p) => Math.max(m, p.round), 0);
  const bestByRound: DraftGrades['bestByRound'] = [];
  for (let r = 1; r <= rounds; r++) {
    const top = byOver.find((p) => p.round === r);
    if (top) bestByRound.push({ round: r, pick: top });
  }
  teams.sort((a, b) => a.hindsight.rank - b.hindsight.rank);
  return { teams, curve, replacement, picks: pickGrades, steals, busts, bestByRound, rounds, teamCount: n };
}

/* ---------- what the picks scored ---------- */

interface ModelLike {
  meta: { currentWeek: number; lastRegularWeek: number };
  players: ReadonlyArray<{
    pid: string; pts: Readonly<Record<number, number | null | undefined>>; mu: Readonly<Record<number, number | undefined>>; playedThisWeek: boolean;
  }>;
}

export interface StatsExtras {
  /** week → player id → Sleeper stat line */
  stats: Readonly<Record<number, Readonly<Record<string, StatLine>>>>;
  /** scores a stat line with the league's settings */
  score: (line: StatLine) => number;
}

/** Points so far and rest-of-season projection for each pid. A player in the model (rostered or in the free-agent pool) has both:
    toDate = his actual points in weeks 1..current, ros = his projected points from the current week to the last regular-season week
    (the current week only if he has not played it yet). Anyone else (dropped and unpooled) is scored from the weekly stat lines
    when given, with ros = null. */
export function playerPerformance(pids: Iterable<string>, model: ModelLike, extras?: StatsExtras | null): Record<string, PlayerResult> {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const byPid = new Map(model.players.map((p) => [p.pid, p]));
  const out: Record<string, PlayerResult> = {};
  for (const pid of pids) {
    const p = byPid.get(pid);
    if (p) {
      let toDate = 0, ros = 0;
      for (let w = 1; w <= cur; w++) toDate += p.pts[w] ?? 0;
      for (let w = cur; w <= last; w++) if (!(w === cur && p.playedThisWeek)) ros += p.mu[w] ?? 0;
      out[pid] = { toDate, ros };
    } else if (extras) {
      let toDate = 0;
      for (let w = 1; w <= cur; w++) {
        const s = extras.stats[w]?.[pid];
        if (s && ((s.gms_active ?? 0) > 0 || (s.gp ?? 0) > 0)) toDate += extras.score(s);
      }
      out[pid] = { toDate, ros: null };
    }
  }
  return out;
}
