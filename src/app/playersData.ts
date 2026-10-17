import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { loadFantasyCalc } from '../engine';
import type { FcResult } from '../engine';
import type { PlayersMap, SleeperLeague } from '../data';
import { useData } from './dataContext';
import { buildPlayerIndex } from './playersIndex';
import type { Resource } from './hooks';
import type { Fetcher } from './resourceStore';

/** Sleeper's players file (about 12,000 entries, cached for a day). Shared through the resource store. */
export function usePlayersFile(): Resource<PlayersMap> {
  const { sleeper, store } = useData();
  useSyncExternalStore(store.subscribe, store.getVersion);
  const key = 'sleeper-players';
  const entry = store.get<PlayersMap>(key);
  const fetcher = useMemo<Fetcher<PlayersMap> | null>(() => (sleeper ? (o) => sleeper.players(o) : null), [sleeper]);
  const missing = !!fetcher && !entry;
  useEffect(() => {
    if (fetcher && missing) void store.load(key, fetcher);
  }, [store, fetcher, missing]);
  return {
    data: entry?.data,
    asOf: entry?.asOf ?? null,
    fromCache: entry?.fromCache ?? false,
    stale: entry?.stale ?? false,
    error: entry?.error ?? (sleeper ? undefined : 'No data source is connected.'),
    loading: entry ? entry.loading : missing,
    refresh: () => (fetcher ? store.load(key, fetcher, true) : Promise.resolve()),
  };
}

/** The search index, built once per players file. */
export function usePlayerIndex() {
  const file = usePlayersFile();
  const index = useMemo(() => buildPlayerIndex(file.data), [file.data]);
  return { ...file, index };
}

/** FantasyCalc values for a league (never throws; `reason` says why when it is down). */
export function useFantasyCalc(league: SleeperLeague | null | undefined): FcResult | null {
  const { sleeper, store } = useData();
  useSyncExternalStore(store.subscribe, store.getVersion);
  const key = league ? `fantasycalc:${league.league_id}` : null;
  const entry = key ? store.get<FcResult>(key) : undefined;
  const fetcher = useMemo<Fetcher<FcResult> | null>(
    () => (sleeper && league
      ? async (o) => {
        const r = await loadFantasyCalc(sleeper, league, { force: o?.force });
        return { data: r, asOf: r.asOf ?? Date.now(), fromCache: false, stale: r.stale };
      }
      : null),
    [sleeper, league],
  );
  const missing = !!key && !!fetcher && !entry;
  useEffect(() => {
    if (key && fetcher && missing) void store.load(key, fetcher);
  }, [store, key, fetcher, missing]);
  return entry?.data ?? null;
}
