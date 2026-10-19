/* Everything game day shows, derived from one snapshot with plain rules over real numbers.

   - game balls:        the top scoring starters of the week across the league
   - upset alert:       a team whose pre-game win chance was under 35% (UPSET_PRE_MAX) and who is ahead now
   - nail-biter:        the closest matchup that still has players to play, within NAIL_MARGIN points
   - blowout:           the biggest margin, from BLOWOUT_MARGIN points
   - left on the sideline: the best lineup of the players a team rostered (their actual points) minus what it started
   - players yet to play / in progress / done, per team
   Nothing here is estimated beyond the projections already in the model. */
import { optimizeLineup } from '../lineup.ts';
import type { Slot } from '../types.ts';
import { winProb } from '../league.ts';
import { gamesByTeam, gameText } from './scores.ts';
import { playerLive } from './project.ts';
import type { PlayerLive, PlayerState } from './project.ts';
import { liveWinProb } from './winprob.ts';
import type { LiveCtx, LiveRow, LiveSnapshot, NflGame, PlayerMeta } from './types.ts';

export const UPSET_PRE_MAX = 0.35;
export const NAIL_MARGIN = 12;
export const BLOWOUT_MARGIN = 35;
export const GAME_BALLS = 5;

const r2 = (x: number) => Math.round(x * 100) / 100;

export type Tag = 'upset alert' | 'nail-biter' | 'blowout';

export interface StarterLive extends PlayerLive {
  slot: string;
  pid: string;
  name: string;
  pos: string;
  nfl: string | null;
  game: NflGame | null;
  /** "cin vs pit" */
  gameText: string;
}

export interface TeamLive {
  rid: number;
  name: string;
  manager: string;
  isMe: boolean;
  starters: StarterLive[];
  /** the team's points so far (Sleeper's own total) */
  actual: number;
  /** live projection: the sum over starters */
  projection: number;
  /** pre-game projection: the sum of full-game expectations */
  preProjection: number;
  /** share of starter-minutes left, 0 to 1 */
  remaining: number;
  yet: number;
  live: number;
  done: number;
}

export interface MatchupLive {
  id: number;
  a: TeamLive;
  b: TeamLive;
  /** chance that `a` wins, live */
  winA: number;
  /** chance that `a` wins before kickoff */
  preWinA: number;
  /** a.actual - b.actual */
  margin: number;
  started: boolean;
  /** starters still to play or in progress, both sides */
  left: number;
  final: boolean;
  tags: Tag[];
}

export interface GameBall { pid: string; name: string; pos: string; nfl: string | null; rid: number; team: string; points: number; state: PlayerState; isMe: boolean }

export interface BenchRow {
  rid: number;
  team: string;
  isMe: boolean;
  started: number;
  best: number;
  /** best - started, never negative */
  left: number;
  /** the benched player who would have helped most */
  top: { name: string; points: number; pid?: string; pos?: string; nfl?: string | null } | null;
}

export interface LiveView {
  week: number;
  matchups: MatchupLive[];
  mine: MatchupLive | null;
  gameBalls: GameBall[];
  bench: BenchRow[];
  upsets: MatchupLive[];
  nailBiter: MatchupLive | null;
  blowout: MatchupLive | null;
  counts: { yet: number; live: number; done: number };
  /** any live starter had to be given an assumed half-game remaining */
  assumed: boolean;
}

export function metaOf(ctx: LiveCtx, pid: string): PlayerMeta {
  return ctx.players[pid] ?? { pid, name: /^[A-Z]{2,3}$/.test(pid) ? `${pid} d/st` : `player ${pid}`, pos: /^[A-Z]{2,3}$/.test(pid) ? 'DEF' : 'NA', nfl: /^[A-Z]{2,3}$/.test(pid) ? pid : null };
}

/** When the feeds are down, a player's game is guessed from his points: some points means in progress. */
function guessGame(points: number): NflGame {
  return { id: 'guess', home: '', away: '', kickoff: null, state: points !== 0 ? 'live' : 'pre', quarter: '', clock: '', homeScore: null, awayScore: null, elapsed: null };
}

export function buildTeam(ctx: LiveCtx, snap: LiveSnapshot, row: LiveRow, teamGames: Map<string, NflGame>): TeamLive {
  const starters: StarterLive[] = [];
  row.starters.forEach((pid, i) => {
    if (!pid || pid === '0') return;
    const meta = metaOf(ctx, pid);
    const actual = row.startersPoints[i] ?? row.playersPoints[pid] ?? 0;
    const g = snap.gamesKnown ? (meta.nfl ? teamGames.get(meta.nfl) ?? null : null) : guessGame(actual);
    const live = playerLive(actual, ctx.mu[pid] ?? 0, g);
    starters.push({ ...live, slot: ctx.slots[i] ?? meta.pos, pid, name: meta.name, pos: meta.pos, nfl: meta.nfl, game: g, gameText: gameText(g, meta.nfl) });
  });
  const n = starters.length;
  const team = ctx.teams[row.rid];
  return {
    rid: row.rid, name: team?.name ?? `roster ${row.rid}`, manager: team?.manager ?? '', isMe: row.rid === ctx.meRid, starters,
    actual: row.points,
    // Sleeper's total can carry custom points; the projection adds the rest of the lineup to it
    projection: r2(row.points + starters.reduce((s, p) => s + (p.projection - p.actual), 0)),
    preProjection: r2(starters.reduce((s, p) => s + p.mu, 0)),
    remaining: n ? starters.reduce((s, p) => s + p.remaining, 0) / n : 0,
    yet: starters.filter((p) => p.state === 'pre').length,
    live: starters.filter((p) => p.state === 'live').length,
    done: starters.filter((p) => p.state === 'final' || p.state === 'idle').length,
  };
}

/** One matchup from two rows, `mineFirst` puts the signed-in team on the left. */
export function buildMatchup(ctx: LiveCtx, snap: LiveSnapshot, x: LiveRow, y: LiveRow, teamGames = gamesByTeam(snap.games)): MatchupLive {
  const [rowA, rowB] = y.rid === ctx.meRid || (x.rid !== ctx.meRid && y.rid < x.rid) ? [y, x] : [x, y];
  const a = buildTeam(ctx, snap, rowA, teamGames), b = buildTeam(ctx, snap, rowB, teamGames);
  const left = a.yet + a.live + b.yet + b.live;
  return {
    id: x.matchupId ?? 0, a, b,
    winA: liveWinProb(a.projection, b.projection, ctx.sd, a.remaining, b.remaining),
    preWinA: winProb(a.preProjection, b.preProjection, ctx.sd),
    margin: r2(a.actual - b.actual),
    started: a.actual !== 0 || b.actual !== 0 || a.live + b.live > 0,
    left, final: left === 0,
    tags: [],
  };
}

export function pairRows(rows: readonly LiveRow[]): Array<[LiveRow, LiveRow]> {
  const by = new Map<number, LiveRow[]>();
  for (const r of rows) {
    if (r.matchupId === null) continue;
    const a = by.get(r.matchupId);
    if (a) a.push(r); else by.set(r.matchupId, [r]);
  }
  return [...by.values()].filter((g) => g.length === 2).map((g) => [g[0]!, g[1]!]);
}

/** The best lineup the team could have started from the players on its roster, by actual points. */
function benchRow(ctx: LiveCtx, row: LiveRow): BenchRow {
  const pool = row.players.map((pid) => ({ pid, pos: metaOf(ctx, pid).pos, name: metaOf(ctx, pid).name }));
  const pts = (pid: string) => row.playersPoints[pid] ?? 0;
  const best = optimizeLineup(pool, ctx.slots as Slot[], { value: (p) => pts(p.pid) });
  const started = new Set(row.starters);
  const startedTotal = row.starters.reduce((s, pid) => s + (pid && pid !== '0' ? pts(pid) : 0), 0);
  const swaps = best.slots.map((s) => s.p).filter((p): p is NonNullable<typeof p> => !!p && !started.has(p.pid));
  swaps.sort((x, y) => pts(y.pid) - pts(x.pid));
  const team = ctx.teams[row.rid];
  return {
    rid: row.rid, team: team?.name ?? `roster ${row.rid}`, isMe: row.rid === ctx.meRid,
    started: r2(startedTotal), best: r2(best.total), left: Math.max(0, r2(best.total - startedTotal)),
    top: swaps[0] ? { name: swaps[0].name, points: pts(swaps[0].pid), pid: swaps[0].pid, pos: swaps[0].pos, nfl: metaOf(ctx, swaps[0].pid).nfl ?? null } : null,
  };
}

export function buildView(ctx: LiveCtx, snap: LiveSnapshot): LiveView {
  const teamGames = gamesByTeam(snap.games);
  const matchups = pairRows(snap.rows).map(([x, y]) => buildMatchup(ctx, snap, x, y, teamGames));
  // my matchup first, then the rest by id
  matchups.sort((p, q) => Number(q.a.isMe || q.b.isMe) - Number(p.a.isMe || p.b.isMe) || p.id - q.id);

  const favored = (m: MatchupLive) => (m.preWinA < UPSET_PRE_MAX ? 'a' : 1 - m.preWinA < UPSET_PRE_MAX ? 'b' : null);
  const upsets = matchups.filter((m) => {
    const dog = favored(m);
    return dog !== null && (m.a.actual !== 0 || m.b.actual !== 0) && (dog === 'a' ? m.margin > 0 : m.margin < 0);
  });
  upsets.sort((p, q) => Math.min(p.preWinA, 1 - p.preWinA) - Math.min(q.preWinA, 1 - q.preWinA));
  const nails = matchups.filter((m) => m.left > 0 && m.started && Math.abs(m.margin) <= NAIL_MARGIN)
    .sort((p, q) => Math.abs(p.margin) - Math.abs(q.margin));
  const blows = matchups.filter((m) => Math.abs(m.margin) >= BLOWOUT_MARGIN).sort((p, q) => Math.abs(q.margin) - Math.abs(p.margin));
  const nailBiter = nails[0] ?? null, blowout = blows[0] ?? null;
  for (const m of upsets) m.tags.push('upset alert');
  if (nailBiter) nailBiter.tags.push('nail-biter');
  if (blowout) blowout.tags.push('blowout');

  const balls: GameBall[] = [];
  const counts = { yet: 0, live: 0, done: 0 };
  let assumed = false;
  for (const m of matchups) {
    for (const t of [m.a, m.b]) {
      counts.yet += t.yet; counts.live += t.live; counts.done += t.done;
      for (const p of t.starters) {
        if (p.assumed) assumed = true;
        if (p.actual > 0) balls.push({ pid: p.pid, name: p.name, pos: p.pos, nfl: p.nfl, rid: t.rid, team: t.name, points: p.actual, state: p.state, isMe: t.isMe });
      }
    }
  }
  balls.sort((p, q) => q.points - p.points || p.name.localeCompare(q.name));

  return {
    week: snap.week, matchups, mine: matchups.find((m) => m.a.isMe || m.b.isMe) ?? null,
    gameBalls: balls.slice(0, GAME_BALLS),
    bench: snap.rows.filter((r) => r.matchupId !== null).map((r) => benchRow(ctx, r)).sort((p, q) => q.left - p.left || p.team.localeCompare(q.team)),
    upsets, nailBiter, blowout, counts, assumed,
  };
}

/** True while nothing has been scored anywhere: pages then show projections instead of points. */
export function isPreGame(view: LiveView): boolean {
  return view.matchups.every((m) => m.a.actual === 0 && m.b.actual === 0 && m.a.live + m.b.live === 0 && !m.final);
}

/** Win chance of `rid`'s matchup across the frames (one point per frame, newest last), as the chance for `rid`. */
export function winSeries(ctx: LiveCtx, frames: readonly LiveSnapshot[], rid: number, maxPoints = 120): Array<{ clock: number; p: number; mine: number; theirs: number }> {
  const step = Math.max(1, Math.ceil(frames.length / maxPoints));
  const out: Array<{ clock: number; p: number; mine: number; theirs: number }> = [];
  frames.forEach((f, i) => {
    if (i % step !== 0 && i !== frames.length - 1) return;
    const mine = f.rows.find((r) => r.rid === rid);
    const opp = mine ? f.rows.find((r) => r.matchupId === mine.matchupId && r.rid !== rid) : undefined;
    if (!mine || !opp || mine.matchupId === null) return;
    const m = buildMatchup(ctx, f, mine, opp);
    const first = m.a.rid === rid;
    out.push({ clock: f.clock, p: first ? m.winA : 1 - m.winA, mine: first ? m.a.actual : m.b.actual, theirs: first ? m.b.actual : m.a.actual });
  });
  return out;
}

