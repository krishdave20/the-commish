import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { NflverseClient } from '../data';
import { coverageRows, seasonRows, weeklyRows } from '../data';
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

/** Read every published file through the data layer's nflverse client. Throws (with the client's plain-English message)
    when the manifest or the weekly or season file is not there yet; coverage and unmatched are optional. */
export async function loadNflverseBundle(client: NflverseClient, o: { force?: boolean } = {}): Promise<NflverseBundle> {
  const opts = { force: o.force };
  const manifest = await client.manifest(opts);
  if (!manifest.available) throw new Error(manifest.message);
  const [weekly, season, coverage, unmatched] = await Promise.all([
    client.weekly(undefined, opts), client.season(undefined, opts), client.coverage(opts), client.unmatched(opts),
  ]);
  if (!weekly.available) throw new Error(weekly.message);
  if (!season.available) throw new Error(season.message);
  return {
    manifest: manifest.data,
    weekly: weeklyRows(weekly.data),
    season: seasonRows(season.data),
    coverage: coverage.available
      ? {
        rows: coverageRows(coverage.data), shells: coverage.data.shells, season: coverage.data.season,
        isCurrent: coverage.data.isCurrent, routesDefinition: coverage.data.routesDefinition,
      }
      : null,
    unmatched: unmatched.available ? unmatched.data.players : [],
    asOf: Date.parse(manifest.data.generatedAt) || manifest.asOf,
  };
}

export interface NflverseState {
  bundle: NflverseBundle | null;
  loading: boolean;
  /** why there is no bundle, when loading failed (the files are simply missing before the first nightly run) */
  error: string | undefined;
  /** request every file again, skipping fresh cache copies */
  refresh: () => Promise<void>;
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
        const bundle = await loadNflverseBundle(nflverse, { force: o?.force });
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
    refresh: () => (fetcher ? store.load(key, fetcher, true) : Promise.resolve()),
  };
}
