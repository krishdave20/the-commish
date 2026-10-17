import type {
  Columnar, CoverageFile, CoverageRow, NflverseManifest, PlayerSeason, PlayerWeek, SeasonFile, UnmatchedFile, WeeklyFile,
} from '../data/nflverseTypes';
import { nflverseFiles } from '../data/nflverseTypes';
import type { NflverseBundle, NflverseSource } from './nflverseData';

/** Turn a columnar table into one object per row. */
export function decodeRows<T>(t: Columnar): T[] {
  return t.rows.map((row) => {
    const o: Record<string, unknown> = {};
    t.cols.forEach((c, i) => { o[c] = row[i] ?? null; });
    return o as T;
  });
}

async function getJson<T>(fetchImpl: typeof fetch, url: string): Promise<T> {
  const res = await fetchImpl(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    // a dev server answers a missing file with the app's own html
    throw new Error(`${url} is not published yet`);
  }
}

/** Reads the nightly files the pipeline publishes next to the site (same origin, so no CORS). */
export function createNflverseSource(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): NflverseSource {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const at = (name: string) => `${base}${name}`;
  return {
    async load() {
      const manifest = await getJson<NflverseManifest>(fetchImpl, at(nflverseFiles.manifest));
      const [weekly, season, unmatched, coverage] = await Promise.all([
        getJson<WeeklyFile>(fetchImpl, at(nflverseFiles.weekly(manifest.season))),
        getJson<SeasonFile>(fetchImpl, at(nflverseFiles.season(manifest.season))),
        getJson<UnmatchedFile>(fetchImpl, at(nflverseFiles.unmatched)).catch(() => null),
        getJson<CoverageFile>(fetchImpl, at(nflverseFiles.coverage(manifest.participationSeason))).catch(() => null),
      ]);
      const bundle: NflverseBundle = {
        manifest,
        weekly: decodeRows<PlayerWeek>(weekly),
        season: decodeRows<PlayerSeason>(season),
        coverage: coverage
          ? { rows: decodeRows<CoverageRow>(coverage), shells: coverage.shells, season: coverage.season, isCurrent: coverage.isCurrent, routesDefinition: coverage.routesDefinition }
          : null,
        unmatched: unmatched?.players ?? [],
        asOf: Date.parse(manifest.generatedAt) || Date.now(),
      };
      return bundle;
    },
  };
}
