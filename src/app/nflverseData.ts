import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { CoverageRow, CoverageTuple, NflverseManifest, PlayerSeason, PlayerWeek, UnmatchedPlayer } from '../data/nflverseTypes';
import { useData } from './dataContext';
import type { Fetcher } from './resourceStore';

/** Everything the nightly nflverse job published, decoded into plain rows. */
export interface NflverseBundle {
  manifest: NflverseManifest;
  weekly: PlayerWeek[];
  season: PlayerSeason[];
  coverage: {
    rows: CoverageRow[];
    /** pid -> coverage shell -> [routes, targets, receptions, yards, td] */
    shells: Record<string, Record<string, CoverageTuple>>;
    season: number;
    isCurrent: boolean;
    routesDefinition: string;
  } | null;
  unmatched: UnmatchedPlayer[];
  /** epoch ms the files were generated */
  asOf: number;
}

/** Where the bundle comes from (a same-origin fetch in the browser, a fake in tests). */
export interface NflverseSource {
  load(opts?: { force?: boolean }): Promise<NflverseBundle>;
}

export interface NflverseState {
  bundle: NflverseBundle | null;
  loading: boolean;
  /** why there is no bundle, when loading failed (the files are simply missing before the first nightly run) */
  error: string | undefined;
}

/** The nightly nflverse data, loaded once and shared. With no source or no files it is `bundle: null`. */
export function useNflverse(): NflverseState {
  const { nflverse, store } = useData();
  useSyncExternalStore(store.subscribe, store.getVersion);
  const key = 'nflverse';
  const entry = store.get<NflverseBundle | null>(key);
  const fetcher = useMemo<Fetcher<NflverseBundle | null> | null>(
    () => (nflverse
      ? async (o) => {
        const bundle = await nflverse.load({ force: o?.force });
        return { data: bundle, asOf: bundle.asOf, fromCache: false, stale: false };
      }
      : null),
    [nflverse],
  );
  const missing = !!fetcher && !entry;
  useEffect(() => {
    if (fetcher && missing) void store.load(key, fetcher);
  }, [store, fetcher, missing]);
  return {
    bundle: entry?.data ?? null,
    loading: entry ? entry.loading && !entry.data : missing,
    error: entry?.error,
  };
}
