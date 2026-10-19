/* The two players to show beside a team: the best two by expected points over the rest of the season. Kickers and defenses are left out
   (they have no headshot worth showing). */
import type { Model } from '../types.ts';

export interface PowerPlayer { pid: string; name: string; pos: string; team?: string }

export function topPlayers(model: Pick<Model, 'players' | 'meta'>, rid: number, n = 2): PowerPlayer[] {
  const { currentWeek: cur, maxWeek } = model.meta;
  const value = (p: Model['players'][number]) => {
    let s = 0;
    for (let w = cur; w <= maxWeek; w++) s += p.mu[w] ?? 0;
    return s;
  };
  return model.players
    .filter((p) => p.ownerRid === rid && p.pos !== 'K' && p.pos !== 'DEF')
    .map((p) => ({ p, v: value(p) }))
    .sort((a, b) => b.v - a.v || a.p.pid.localeCompare(b.p.pid))
    .slice(0, n)
    .map(({ p }) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }));
}
