import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { AccountStore, DataApi, LeagueBundle, LinkedAccount, NflState } from '../data';
import { useData } from './dataContext';
import type { Fetcher } from './resourceStore';

/** What every data hook returns. */
export interface Resource<T> {
  data: T | undefined;
  /** epoch ms of the network fetch behind `data`; null when there is no data */
  asOf: number | null;
  fromCache: boolean;
  stale: boolean;
  error: string | undefined;
  loading: boolean;
  /** goes back to the network with `{ force: true }` */
  refresh: () => Promise<void>;
}

/** The pieces the page header needs. */
export type Freshness = Pick<Resource<unknown>, 'asOf' | 'fromCache' | 'stale' | 'error' | 'loading' | 'refresh'>;

export function useApi(): DataApi {
  return useData().api;
}

export function useAccountStore(): AccountStore {
  return useData().accounts;
}

/* ---------- accounts ---------- */

function useAccountsVersion(): void {
  const { bridge } = useData();
  useSyncExternalStore(bridge.subscribe, bridge.getVersion);
}

const NO_REFRESH = () => Promise.resolve();

export function useAccounts(): Resource<LinkedAccount[]> {
  const { accounts } = useData();
  useAccountsVersion();
  return {
    data: accounts.list(),
    asOf: null,
    fromCache: false,
    stale: false,
    error: undefined,
    loading: false,
    refresh: NO_REFRESH,
  };
}

export interface ActiveSelection {
  account: LinkedAccount;
  /** the league the app is following right now */
  leagueId: string | null;
}

export function useActive(): Resource<ActiveSelection | null> {
  const { accounts } = useData();
  useAccountsVersion();
  const account = accounts.active();
  return {
    data: account ? { account, leagueId: account.activeLeagueId ?? account.leagueIds[0] ?? null } : null,
    asOf: null,
    fromCache: false,
    stale: false,
    error: undefined,
    loading: false,
    refresh: NO_REFRESH,
  };
}

/* ---------- network-backed resources ---------- */

function useResource<T>(key: string | null, fetcher: Fetcher<T> | null): Resource<T> {
  const { store } = useData();
  useSyncExternalStore(store.subscribe, store.getVersion);
  const entry = key ? store.get<T>(key) : undefined;
  const missing = key !== null && fetcher !== null && !entry;

  useEffect(() => {
    if (key && fetcher && missing) void store.load(key, fetcher);
  }, [store, key, fetcher, missing]);

  const refresh = useCallback(
    () => (key && fetcher ? store.load(key, fetcher, true) : Promise.resolve()),
    [store, key, fetcher],
  );

  return {
    data: entry?.data,
    asOf: entry?.asOf ?? null,
    fromCache: entry?.fromCache ?? false,
    stale: entry?.stale ?? false,
    error: entry?.error,
    loading: entry ? entry.loading : missing,
    refresh,
  };
}

export function useNflState(): Resource<NflState> {
  const api = useApi();
  const fetcher = useMemo<Fetcher<NflState>>(() => (o) => api.nflState(o), [api]);
  return useResource('nfl-state', fetcher);
}

export const leagueKey = (id: string) => `league:${id}`;

/** The league bundle for the active league (or for `leagueId` when given). */
export function useLeagueBundle(leagueId?: string | null): Resource<LeagueBundle> {
  const api = useApi();
  const { data: active } = useActive();
  const id = leagueId === undefined ? (active?.leagueId ?? null) : leagueId;
  const fetcher = useMemo<Fetcher<LeagueBundle> | null>(
    () => (id ? (o) => api.leagueBundle(id, o) : null),
    [api, id],
  );
  return useResource(id ? leagueKey(id) : null, fetcher);
}

/** Bundles for several leagues at once (the sidebar needs their names). Shares the same cache as useLeagueBundle. */
export function useLeagueBundles(ids: string[]): Record<string, LeagueBundle | undefined> {
  const { api, store } = useData();
  useSyncExternalStore(store.subscribe, store.getVersion);
  const idsKey = ids.join('|');

  useEffect(() => {
    for (const id of idsKey ? idsKey.split('|') : []) {
      if (!store.get(leagueKey(id))) void store.load(leagueKey(id), (o) => api.leagueBundle(id, o));
    }
  });

  const out: Record<string, LeagueBundle | undefined> = {};
  for (const id of ids) out[id] = store.get<LeagueBundle>(leagueKey(id))?.data;
  return out;
}
