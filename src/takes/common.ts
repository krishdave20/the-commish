/* Shared pieces of the takes engine: the Candidate shape detectors return, the per-run lookup context, and
   small numeric helpers. Pure: nothing here reads the network, the clock or random numbers. */
import type { ModelPlayer } from '../engine/types.ts';
import type { CoverageRow, CoverageTeam, PlayerSeason, PlayerWeek, TeamWeek } from '../data/nflverseTypes.ts';
import type { Take, TakeAction, TakeInputs, TakeKind, TakesThresholds } from './types.ts';

/* ---------- minimum samples and gates that are code, not tuned thresholds ---------- */

/** A player-week counts as a finished game only when his team had at least this many offensive snaps in it
    (a real game is 55+; a partial week mid-game has fewer, and those rows are ignored). */
export const MIN_COMPLETE_GAME_SNAPS = 40;
/** usage_spike: the new snap share must itself be at least this, so a bench player going 3% to 18% is not a take. */
export const MIN_SPIKE_SNAP_SHARE = 0.3;
/** Season-split targets needed on each side of a rate comparison (matches MIN_TARGETS in nflverseTypes). */
export const MIN_SPLIT_TARGETS = 15;
/** Opponent tendencies (light box, blitz) need this many charted plays before we believe them. */
export const MIN_OPP_BOX_CARRIES = 30;
export const MIN_OPP_DROPBACKS = 60;
/** rz_role_change: the larger window must hold at least this many of his inside-10 touches. */
export const MIN_I10_TOUCHES = 3;
/** box_count_edge: his light-box yards per carry must beat his overall yards per carry by this much, so "edge" means an edge. */
export const MIN_LIGHT_BOX_EDGE = 0.5;
/** rz_role_change: games needed before the "recent" window so there is something to compare to. */
export const MIN_PRIOR_GAMES = 2;
/** soft_schedule only speaks about players expected to matter: next-game projection at or above this. */
export const MIN_SOFT_SCHEDULE_MU = 7;
/** dynasty_mover looks only at players worth at least this much in FantasyCalc (value 9 is not a mover). */
export const MIN_DYNASTY_VALUE = 500;
export const MIN_DYNASTY_POPULATION = 20;

/* ---------- candidates ---------- */

export type Facts =
  | { kind: 'usage_spike'; now: number; base: number; baseFrom: number; baseTo: number; baseGames: number; week: number }
  | { kind: 'target_hog'; share: number; from: number; to: number; tgt: number; games: number; seasonShare: number | null; teamPass: number }
  | { kind: 'buy_low'; ayShare: number; ayRank: number; ppg: number; ppgRank: number; games: number; pool: number }
  | { kind: 'sell_high'; tds: number; xtd: number; gap: number; opps: number; games: number }
  | { kind: 'rz_role_change'; now: number; prior: number; up: boolean; from: number; to: number; touchesNow: number; touchesPrior: number; teamPlays: number }
  | { kind: 'box_count_edge'; ypcLight: number; lgtCar: number; ypc: number | null; opp: string; oppRate: number; oppCarries: number }
  | { kind: 'blitz_beater'; yptBlitz: number; yptNo: number; blTgt: number; nblTgt: number; opp: string; oppRate: number; oppDropbacks: number }
  | { kind: 'soft_schedule'; opps: string[]; grades: number[]; weeks: number[]; dvpSoftMin: number }
  | { kind: 'waiver_riser'; adds: number; measure: 'snap share' | 'target share' | 'rush share'; now: number; base: number; from: number; to: number; baseGames: number; week: number }
  | { kind: 'dynasty_mover'; value: number; trend: number; pct: number | null; up: boolean; population: number; tailPct: number }
  | { kind: 'coverage_note'; better: 'man' | 'zone'; yprrMan: number; yprrZone: number; manRoutes: number; zoneRoutes: number; opp: string; oppCoverage: 'man' | 'zone'; oppRate: number; match: boolean; season: string };

/** What a detector returns: everything about a take except the words (templates.ts) and the relevance (rank.ts). */
export interface Candidate {
  id: string;
  kind: TakeKind;
  pid: string;
  player: string;
  pos: string;
  team: string | null;
  season: string;
  week: number;
  throughWeek: number;
  tone: Take['tone'];
  score: number;
  sample: Take['sample'];
  dataLabel: string | null;
  sources: Take['sources'];
  actions: TakeAction[];
  /** filled by applyEvidence */
  trackRecord?: string | null;
  facts: Facts;
}

export type Detector = (inputs: TakeInputs, thresholds: TakesThresholds) => Candidate[];

/* ---------- numeric helpers ---------- */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Detector strength in 0..1: 0.4 right at the threshold, 1 at `full` or beyond. */
export const over = (value: number, threshold: number, full: number) => {
  const span = full - threshold;
  return clamp01(0.4 + (span > 0 ? (0.6 * (value - threshold)) / span : 0));
};
/** Tolerance so a value that equals the threshold on paper (0.15 as 0.8 - 0.65) still fires. */
export const EPS = 1e-9;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
export const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export const SKILL = new Set(['RB', 'WR', 'TE']);
export const PASS_CATCHERS = new Set(['WR', 'TE']);

/* ---------- context ---------- */

export interface Ctx {
  inputs: TakeInputs;
  byPid: Map<string, ModelPlayer>;
  /** finished player-weeks (see MIN_COMPLETE_GAME_SNAPS) per player, ascending by week */
  games: Map<string, PlayerWeek[]>;
  season: Map<string, PlayerSeason>;
  teamWeek: Map<string, TeamWeek>;
  teamWeeks: Map<string, TeamWeek[]>;
  coverage: Map<string, CoverageRow>;
  coverageTeams: Record<string, CoverageTeam>;
  /** latest week that most teams have played; a player whose last game is older than refWeek - 1 is stale */
  refWeek: number;
}

const memo = new WeakMap<TakeInputs, Ctx>();

export function ctxFor(inputs: TakeInputs): Ctx {
  const hit = memo.get(inputs);
  if (hit) return hit;
  const nv = inputs.nflverse;
  const games = new Map<string, PlayerWeek[]>();
  const season = new Map<string, PlayerSeason>();
  const teamWeek = new Map<string, TeamWeek>();
  const teamWeeks = new Map<string, TeamWeek[]>();
  const coverage = new Map<string, CoverageRow>();
  let refWeek = 0;
  if (nv) {
    for (const r of nv.weekly) {
      if (r.tm_snaps < MIN_COMPLETE_GAME_SNAPS) continue;
      let a = games.get(r.pid);
      if (!a) games.set(r.pid, (a = []));
      a.push(r);
    }
    for (const a of games.values()) a.sort((x, y) => x.week - y.week);
    for (const s of nv.season) season.set(s.pid, s);
    const perWeek = new Map<number, Set<string>>();
    for (const t of nv.teams) {
      teamWeek.set(`${t.team}|${t.week}`, t);
      let a = teamWeeks.get(t.team);
      if (!a) teamWeeks.set(t.team, (a = []));
      a.push(t);
      let s = perWeek.get(t.week);
      if (!s) perWeek.set(t.week, (s = new Set()));
      s.add(t.team);
    }
    for (const a of teamWeeks.values()) a.sort((x, y) => x.week - y.week);
    // the latest week at least 3/4 of the teams in the file have played (24 of 32), else the manifest's throughWeek
    const teamCount = new Set(nv.teams.map((t) => t.team)).size;
    for (const [w, s] of perWeek) if (s.size >= Math.ceil(teamCount * 0.75) && w > refWeek) refWeek = w;
    if (!refWeek) refWeek = nv.manifest.throughWeek;
    for (const c of nv.coverage?.rows ?? []) coverage.set(c.pid, c);
  }
  const ctx: Ctx = {
    inputs, byPid: new Map(inputs.model.players.map((p) => [p.pid, p])), games, season, teamWeek, teamWeeks, coverage,
    coverageTeams: nv?.coverage?.teams ?? {}, refWeek,
  };
  memo.set(inputs, ctx);
  return ctx;
}

/** The player's next game at or after the current week (the one after it once his game has kicked off), or null on a bye run / season end. */
export function nextGames(c: Ctx, p: ModelPlayer, count = 1): Array<{ week: number; opp: string }> {
  const out: Array<{ week: number; opp: string }> = [];
  const start = c.inputs.week + (p.playedThisWeek ? 1 : 0);
  for (let w = start; w <= c.inputs.model.meta.maxWeek && out.length < count; w++) {
    const opp = p.opp[w];
    if (opp && opp !== 'BYE') out.push({ week: w, opp });
  }
  return out;
}

/** The last `n` finished games, only if they are recent (the newest within a bye of refWeek) and tight (n games inside n + 1 weeks). */
export function lastGames(c: Ctx, pid: string, n: number, skip = 0): PlayerWeek[] | null {
  const rows = c.games.get(pid);
  if (!rows) return null;
  const end = rows.length - skip;
  if (end < n) return null;
  const win = rows.slice(end - n, end);
  if (skip === 0 && win[win.length - 1]!.week < c.refWeek - 1) return null;
  if (win[win.length - 1]!.week - win[0]!.week > n) return null;
  return win;
}

/** A team's total of one TeamWeek field over the given weeks (null if any week is missing). */
export function teamTotal(c: Ctx, team: string, weeks: number[], f: (t: TeamWeek) => number): number | null {
  let s = 0;
  for (const w of weeks) {
    const t = c.teamWeek.get(`${team}|${w}`);
    if (!t) return null;
    s += f(t);
  }
  return s;
}

/** A defense's tendency pooled over every team-week so far: sum(num) / sum(den), with the denominator for the sample. */
export function pooledDefense(c: Ctx, team: string, num: (t: TeamWeek) => number, den: (t: TeamWeek) => number): { rate: number; n: number } | null {
  const rows = c.teamWeeks.get(team);
  if (!rows) return null;
  const n = sum(rows.map(den));
  if (n <= 0) return null;
  return { rate: sum(rows.map(num)) / n, n };
}

/** Points per game for one player over the weeks he has a finished nflverse game, from league-scored `pts`. */
export function ppgOf(c: Ctx, p: ModelPlayer): { ppg: number; games: number } | null {
  const rows = c.games.get(p.pid);
  if (!rows) return null;
  let s = 0, n = 0;
  for (const r of rows) {
    const v = p.pts[r.week];
    if (isNum(v)) { s += v; n++; }
  }
  return n ? { ppg: s / n, games: n } : null;
}

export function baseCandidate(
  c: Ctx, p: ModelPlayer, kind: TakeKind, o: { week: number; throughWeek: number; tone: Take['tone']; score: number; sample: Take['sample']; sources: Take['sources']; actions: TakeAction[]; dataLabel?: string | null; team?: string | null },
): Omit<Candidate, 'facts'> {
  return {
    id: `${kind}:${p.pid}:${o.week}`, kind, pid: p.pid, player: p.name, pos: p.pos, team: p.nfl ?? o.team ?? null,
    season: c.inputs.season, week: o.week, throughWeek: o.throughWeek, tone: o.tone, score: round(clamp01(o.score), 4),
    sample: o.sample, dataLabel: o.dataLabel ?? null, sources: o.sources, actions: o.actions,
  };
}

/** His most recent finished game, if it is fresh (see `refWeek`). */
export function latestGame(c: Ctx, pid: string): PlayerWeek | null {
  const rows = c.games.get(pid);
  const last = rows?.[rows.length - 1];
  return last && last.week >= c.refWeek - 1 ? last : null;
}

/** Baseline games right before `latest`: the `n` games before it, inside n + 1 weeks of each other and at most one bye from `latest`. */
export function baselineBefore(c: Ctx, pid: string, latest: PlayerWeek, n: number): PlayerWeek[] | null {
  const rows = c.games.get(pid);
  if (!rows) return null;
  const i = rows.indexOf(latest);
  if (i < n) return null;
  const win = rows.slice(i - n, i);
  if (latest.week - win[win.length - 1]!.week > 2) return null;
  if (win[win.length - 1]!.week - win[0]!.week > n) return null;
  return win;
}

export const pct = (x: number) => Math.round(x * 100);

/** The week a take is about: his next game, else the current week. */
export function nextWeek(c: Ctx, p: ModelPlayer, current: number): number {
  return nextGames(c, p, 1)[0]?.week ?? current;
}

/** Injury statuses that take a player out of the conversation for matchup-style takes. */
const OUT_STATUSES = new Set(['out', 'ir', 'pup', 'sus', 'suspended', 'na']);

/** True when a take about his next game would be noise: he sits in a roster IR slot, Sleeper lists him Out/IR/PUP/Sus/Suspended/NA,
    or his projection for his next game is 0. */
export function unavailable(c: Ctx, p: ModelPlayer): boolean {
  if (p.onIr || OUT_STATUSES.has(p.injury.trim().toLowerCase())) return true;
  const next = nextGames(c, p, 1)[0];
  return !!next && (p.mu[next.week] ?? 0) === 0;
}
