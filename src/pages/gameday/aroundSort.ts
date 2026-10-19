import { fieldRole } from '../../engine/live';
import type { MatchupLive, StarterLive, TeamLive } from '../../engine/live';

export type SortKey = 'live' | 'closest' | 'biggest';

export const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'live', label: 'live first' },
  { value: 'closest', label: 'closest' },
  { value: 'biggest', label: 'biggest' },
];

/** The gap that sorts "closest" and "biggest": the margin on the board, or the projected gap before anyone has scored. */
export const gapOf = (m: MatchupLive, projected: boolean) => Math.abs(projected ? m.a.projection - m.b.projection : m.margin);

/** Live first (most starters on the field, then games still to come, then finished ones), the closest of each kind first; or by gap alone. */
export function sortMatchups(list: readonly MatchupLive[], by: SortKey, projected: boolean): MatchupLive[] {
  const rank = (m: MatchupLive) => (m.a.live + m.b.live > 0 ? 0 : m.final ? 2 : 1);
  const live = (m: MatchupLive) => m.a.live + m.b.live;
  const out = [...list];
  if (by === 'closest') out.sort((p, q) => gapOf(p, projected) - gapOf(q, projected) || p.id - q.id);
  else if (by === 'biggest') out.sort((p, q) => gapOf(q, projected) - gapOf(p, projected) || p.id - q.id);
  else out.sort((p, q) => rank(p) - rank(q) || live(q) - live(p) || gapOf(p, projected) - gapOf(q, projected) || p.id - q.id);
  return out;
}

/** The two starters who matter most: the highest scorers, or the highest projections before anyone has played. */
export function topStarters(t: TeamLive, n = 2): StarterLive[] {
  return [...t.starters].sort((p, q) => q.actual - p.actual || q.projection - p.projection || p.name.localeCompare(q.name)).slice(0, n);
}

/** The starter to call out: someone live, preferring a player whose unit is on the field right now, then the one with the most points. */
export function liveStarter(m: MatchupLive): StarterLive | null {
  const live = [...m.a.starters, ...m.b.starters].filter((p) => p.state === 'live');
  if (!live.length) return null;
  const onField = (p: StarterLive) => (p.game?.situation && fieldRole(p.pos, p.nfl, p.game.situation.possession)?.onField ? 1 : 0);
  return live.sort((p, q) => onField(q) - onField(p) || q.actual - p.actual || p.name.localeCompare(q.name))[0] ?? null;
}
