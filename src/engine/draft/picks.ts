/* Future draft picks for dynasty leagues, from Sleeper's traded_picks.

   `traded_picks` lists only picks that changed hands. Every team starts owning its own pick in each round of each
   upcoming season; each trade row (season, round, roster_id = original owner, owner_id = current owner) moves one. */
import type { TradedPick } from '../../data/contract.ts';

export interface OwnedPick {
  season: string;
  round: number;
  /** the roster whose draft slot the pick comes from */
  originalRosterId: number;
  /** false for a team's own pick, true for one acquired in a trade */
  acquired: boolean;
}

/** season × round × roster → owner, then grouped by owner. `rounds` is the league's rookie-draft length (settings.draft_rounds). */
export function futurePicksByRoster(
  tradedPicks: readonly Pick<TradedPick, 'season' | 'round' | 'roster_id' | 'owner_id'>[],
  rosterIds: readonly number[],
  seasons: readonly string[],
  rounds: number,
): Record<number, OwnedPick[]> {
  const owner = new Map<string, number>();
  for (const s of seasons) for (let r = 1; r <= rounds; r++) for (const rid of rosterIds) owner.set(`${s}:${r}:${rid}`, rid);
  for (const t of tradedPicks) {
    const key = `${t.season}:${t.round}:${t.roster_id}`;
    if (owner.has(key)) owner.set(key, t.owner_id);
  }
  const out: Record<number, OwnedPick[]> = {};
  for (const rid of rosterIds) out[rid] = [];
  for (const s of seasons) {
    for (let r = 1; r <= rounds; r++) {
      for (const rid of rosterIds) {
        const o = owner.get(`${s}:${r}:${rid}`)!;
        (out[o] = out[o] || []).push({ season: s, round: r, originalRosterId: rid, acquired: o !== rid });
      }
    }
  }
  return out;
}
