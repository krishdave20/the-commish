import { formatClockTime } from '../../app/live/format';
import type { DrivePlay, PlaySide } from '../../components/field';
import { gameStatusText, gameText, gamesByTeam, metaOf } from '../../engine/live';
import type { LiveCtx, LiveSnapshot, LiveView, NflGame, RawChange } from '../../engine/live';

/** How many plays the field and the list keep: the newest. */
export const MAX_PLAYS = 60;
/** The week's top scoring plays shown for a finished week with no replay. */
export const TOP_PLAYS = 14;

export interface PlayRow { play: DrivePlay; team: string; time: string; mine: boolean }

const sideOf = (rid: number, meRid: number, oppRid: number | null): PlaySide => (rid === meRid ? 'me' : rid === oppRid ? 'opp' : 'other');

/** The scoring feed as plays. Each play carries the game as it stood at that poll ("cin vs pit · q3 8:12"), read from the snapshot taken then. */
export function playsFromChanges(
  changes: readonly RawChange[], ctx: LiveCtx, frames: readonly LiveSnapshot[], meRid: number, oppRid: number | null,
): PlayRow[] {
  const byAt = new Map(frames.map((f) => [f.at, f]));
  const teams = new Map<LiveSnapshot, Map<string, NflGame>>();
  return changes.slice(0, MAX_PLAYS).map((c) => {
    const meta = metaOf(ctx, c.pid);
    const frame = byAt.get(c.at);
    let games = frame ? teams.get(frame) : undefined;
    if (frame && !games) { games = gamesByTeam(frame.games); teams.set(frame, games); }
    const g = games && meta.nfl ? games.get(meta.nfl) : undefined;
    const where = g ? [gameText(g, meta.nfl), gameStatusText(g)].filter(Boolean).join(' · ').toLowerCase() : '';
    return {
      play: { id: c.id, t: c.clock, points: c.delta, side: sideOf(c.rid, meRid, oppRid), name: meta.name.toLowerCase(), where, pid: c.pid, pos: meta.pos, nfl: meta.nfl ?? null },
      team: ctx.teams[c.rid]?.name ?? '', time: formatClockTime(c.clock), mine: c.rid === meRid,
    };
  });
}

/** A finished week with no replay: its top scoring starters as plays, in the order their games kicked off. */
export function topPlays(view: LiveView, meRid: number, oppRid: number | null, n = TOP_PLAYS): PlayRow[] {
  const all: Array<{ row: PlayRow; pts: number }> = [];
  for (const m of view.matchups) {
    for (const t of [m.a, m.b]) {
      for (const p of t.starters) {
        if (p.actual <= 0) continue;
        const kick = p.game?.kickoff ?? 0;
        all.push({
          pts: p.actual,
          row: {
            // a hair of the score keeps two players of one game in a steady order
            play: { id: `${t.rid}-${p.pid}`, t: kick + p.actual / 1000, points: p.actual, side: sideOf(t.rid, meRid, oppRid), name: p.name.toLowerCase(), where: [p.gameText, 'final'].filter(Boolean).join(' · ').toLowerCase(), pid: p.pid, pos: p.pos, nfl: p.nfl ?? null },
            team: t.name, time: '', mine: t.isMe,
          },
        });
      }
    }
  }
  return all.sort((a, b) => b.pts - a.pts || a.row.play.id.localeCompare(b.row.play.id)).slice(0, n).map((x) => x.row);
}
