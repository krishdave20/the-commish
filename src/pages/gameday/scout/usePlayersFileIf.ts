import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { PlayersMap } from '../../../data';
import { useData } from '../../../app/dataContext';
import { displayName, str } from '../../../app/playersIndex';

/** Sleeper's players file through the shared resource store, but only fetched when `needed` (the scouting tab asks only when a recent move
    names a player the model does not carry). Returns a lookup for name, position and team; every answer is null until the file is there. */
export function usePlayersFileIf(needed: boolean): (pid: string) => { name: string; pos: string; nfl: string | null } | null {
  const { sleeper, store } = useData();
  useSyncExternalStore(store.subscribe, store.getVersion);
  const key = 'sleeper-players';
  const entry = store.get<PlayersMap>(key);
  const missing = needed && !!sleeper && !entry;
  useEffect(() => {
    if (missing && sleeper) void store.load(key, (o) => sleeper.players(o));
  }, [missing, sleeper, store]);
  const map = entry?.data;
  return useMemo(() => (pid: string) => {
    const rec = map?.[pid];
    if (!rec) return null;
    return { name: displayName({ ...rec, player_id: pid }), pos: str(rec.position), nfl: typeof rec.team === 'string' ? rec.team : null };
  }, [map]);
}
