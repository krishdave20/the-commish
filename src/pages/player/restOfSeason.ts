import type { Model, ModelPlayer } from '../../engine';

/** Rest-of-season points from the model, and the player's rank at his position in the pool. */
export function restOfSeason(model: Model, mp: ModelPlayer): { points: number; rank: number; of: number } {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const total = (p: ModelPlayer) => { let s = 0; for (let w = cur + 1; w <= last; w++) s += p.mu[w] || 0; return s; };
  const same = model.players.filter((p) => p.pos === mp.pos);
  const mine = total(mp);
  return { points: mine, rank: 1 + same.filter((p) => total(p) > mine).length, of: same.length };
}
