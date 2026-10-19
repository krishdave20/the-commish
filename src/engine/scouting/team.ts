/* Build a `ScoutTeam` from the game day feed: one roster row of a snapshot, the ctx (names, slots, projections) and the week's NFL games.
   The same code reads this week (games to come, games on) and a finished week (everything final, points are the story). */
import { gamesByTeam } from '../live/scores.ts';
import { playerLive } from '../live/project.ts';
import { metaOf } from '../live/derive.ts';
import type { LiveCtx, LiveSnapshot, NflGame } from '../live/types.ts';
import type { ScoutPlayer, ScoutTeam } from './types.ts';

/** What only the model knows, and only for the week in progress. All optional: a past week passes nothing. */
export interface ScoutLookups {
  /** Sleeper injury designation, "" when healthy */
  injury?: (pid: string) => string | undefined;
  /** the model's 80th-percentile outcome for the week */
  ceiling?: (pid: string) => number | null | undefined;
  /** on injured reserve: he cannot be started, so he is no bench threat */
  onIr?: (pid: string) => boolean | undefined;
}

function guessGame(points: number): NflGame {
  return { id: 'guess', home: '', away: '', kickoff: null, state: points !== 0 ? 'live' : 'pre', quarter: '', clock: '', homeScore: null, awayScore: null, elapsed: null };
}

function scoutPlayer(ctx: LiveCtx, snap: LiveSnapshot, games: Map<string, NflGame>, pid: string, actual: number, look: ScoutLookups): ScoutPlayer {
  const meta = metaOf(ctx, pid);
  const game = snap.gamesKnown ? (meta.nfl ? games.get(meta.nfl) ?? null : null) : guessGame(actual);
  const mu = ctx.mu[pid] ?? 0;
  const live = playerLive(actual, mu, game);
  const ceiling = look.ceiling?.(pid);
  return {
    pid, name: meta.name, pos: meta.pos, nfl: meta.nfl, state: live.state, actual, mu, projection: live.projection,
    kickoff: game?.kickoff ?? null, injury: look.injury?.(pid) ?? '', ceiling: ceiling == null ? null : ceiling,
    bye: snap.gamesKnown && !!meta.nfl && !game,
  };
}

/** One team's week, or null when the snapshot has no roster `rid`. */
export function scoutTeam(ctx: LiveCtx, snap: LiveSnapshot, rid: number, look: ScoutLookups = {}): ScoutTeam | null {
  const row = snap.rows.find((r) => r.rid === rid);
  if (!row) return null;
  const games = gamesByTeam(snap.games);
  const started = new Set<string>();
  const starters = ctx.slots.map((_, i): ScoutPlayer | null => {
    const pid = row.starters[i];
    if (!pid || pid === '0') return null;
    started.add(pid);
    return scoutPlayer(ctx, snap, games, pid, row.startersPoints[i] ?? row.playersPoints[pid] ?? 0, look);
  });
  const bench = row.players
    .filter((pid) => pid && pid !== '0' && !started.has(pid) && !look.onIr?.(pid))
    .map((pid) => scoutPlayer(ctx, snap, games, pid, row.playersPoints[pid] ?? 0, look));
  const team = ctx.teams[rid];
  return {
    rid, name: team?.name ?? `roster ${rid}`, manager: team?.manager ?? '', isMe: rid === ctx.meRid,
    slots: ctx.slots, starters, bench, actual: row.points,
  };
}
