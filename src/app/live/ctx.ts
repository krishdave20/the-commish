/* Builds the engine's LiveCtx (names, slots, pre-game expectations) from the model and one week of Sleeper projections. */
import { INJ_MULT, makeScorer } from '../../engine';
import type { Model } from '../../engine';
import type { LiveCtx, PlayerMeta } from '../../engine/live';
import type { ProjectionRow } from '../../data';

export interface CtxInput {
  model: Model;
  week: number;
  /** the league's scoring settings (for scoring the projection rows) */
  scoring: Record<string, number>;
  /** the week's projection rows; without them the model's own expectation for the week is used */
  rows?: readonly ProjectionRow[] | null;
}

/** Pre-game expectation of each player for the whole game: Sleeper's projection scored with the league's rules, then, for the week in
    progress only, the injury multipliers the model uses (questionable ×0.85, doubtful ×0.3, out ×0). Past weeks are not adjusted:
    today's injury report says nothing about who was healthy then. */
export function buildCtx({ model, week, scoring, rows }: CtxInput): LiveCtx {
  const players: Record<string, PlayerMeta> = {};
  const injury: Record<string, string> = {};
  for (const p of model.players) {
    players[p.pid] = { pid: p.pid, name: p.name, pos: p.pos, nfl: p.nfl };
    if (p.injury) injury[p.pid] = p.injury;
  }
  const mu: Record<string, number> = {};
  if (rows && rows.length) {
    const score = makeScorer(scoring);
    const current = week === model.meta.currentWeek;
    for (const r of rows) {
      const pl = r.player;
      if (!players[r.player_id] && pl) {
        const pos = (pl.position as string | undefined) ?? 'NA';
        const name = pos === 'DEF' ? `${r.player_id} d/st` : `${pl.first_name ?? ''} ${pl.last_name ?? ''}`.trim() || r.player_id;
        players[r.player_id] = { pid: r.player_id, name, pos, nfl: (pl.team as string | null | undefined) ?? r.team ?? null };
      }
      const inj = injury[r.player_id] ?? (pl?.injury_status as string | null | undefined) ?? '';
      const mult = current && INJ_MULT[inj] !== undefined ? INJ_MULT[inj]! : 1;
      mu[r.player_id] = Math.max(0, score(r.stats) * mult);
    }
  } else {
    for (const p of model.players) mu[p.pid] = p.mu[week] ?? 0;
  }
  return {
    week, meRid: model.meRid, sd: model.meta.teamWeeklySd, slots: model.meta.slots,
    teams: Object.fromEntries(model.teams.map((t) => [t.rid, { name: t.team, manager: t.manager }])),
    mu, players,
  };
}
