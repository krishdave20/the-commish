/* Managers across seasons. Roster ids change from one season to the next (a league re-drafts its slots), so a person is
   found by the Sleeper `user_id` that owns the roster, never by the roster id. */
import type { Manager, ManagerMap, SeasonData, SeasonRoster } from './types.ts';

/** The id a roster's owner goes by. An open roster (no owner) is its own one-season manager, so it never merges with anyone. */
export const managerIdOf = (season: Pick<SeasonData, 'season'>, r: Pick<SeasonRoster, 'rid' | 'ownerId'>): string =>
  r.ownerId ?? `vacant:${season.season}:${r.rid}`;

export const isVacant = (id: string): boolean => id.startsWith('vacant:');

/** A roster's place in one season: who owned it and what the team was called. */
export interface RosterSlot { mgr: string; team: string }

/** Every season's roster id → manager and team name. */
export function rosterIndex(season: SeasonData): Map<number, RosterSlot> {
  const users = new Map(season.users.map((u) => [u.userId, u] as const));
  const out = new Map<number, RosterSlot>();
  for (const r of season.rosters) {
    const mgr = managerIdOf(season, r);
    const u = r.ownerId ? users.get(r.ownerId) : undefined;
    out.set(r.rid, { mgr, team: u?.teamName || u?.displayName || (r.ownerId ? 'unknown manager' : 'open team') });
  }
  return out;
}

/** Everyone who held a roster in any season, oldest season first so the latest name wins. */
export function buildManagers(seasons: readonly SeasonData[]): ManagerMap {
  const out: ManagerMap = new Map();
  for (const s of seasons) {
    const users = new Map(s.users.map((u) => [u.userId, u] as const));
    for (const r of s.rosters) {
      const id = managerIdOf(s, r);
      const u = r.ownerId ? users.get(r.ownerId) : undefined;
      const prev = out.get(id);
      const name = u?.displayName ?? prev?.name ?? (r.ownerId ? 'unknown manager' : 'open team');
      const team = u?.teamName || u?.displayName || prev?.team || name;
      out.set(id, {
        id, name, avatar: u?.avatar ?? prev?.avatar ?? null,
        teamBySeason: { ...(prev?.teamBySeason ?? {}), [s.season]: team },
        team, seasons: [...(prev?.seasons ?? []), s.season], vacant: isVacant(id),
      } satisfies Manager);
    }
  }
  return out;
}
