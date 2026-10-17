/* Reads the nightly nflverse job's JSON files (./data/nflverse/*.json, same origin as the page) through the
   shared transport, limiter and cache. GitHub release assets send no CORS headers, so the browser never talks to
   nflverse itself; see scripts/nflverse. A missing file (local dev before a pipeline run, a 404, the dev server's
   index.html fallback) is a typed "not available yet" result, never a throw. */
import type { Cache } from './cache.ts';
import type { FetchOpts } from './contract.ts';
import type { Limiter } from './limiter.ts';
import type { Transport } from './transport.ts';
import {
  nflverseFiles, type Columnar, type CoverageFile, type CoverageRow, type NflverseManifest, type PlayerSeason, type PlayerWeek, type SeasonFile,
  type TeamsFile, type TeamWeek, type UnmatchedFile, type WeeklyFile,
} from './nflverseTypes.ts';

/** 6 hours, like the rest of the data layer. The files change once a night. */
export const NFLVERSE_TTL = 6 * 3_600_000;
export const NFLVERSE_BASE_PATH = './data/nflverse/';

export type NvUnavailableReason = 'not_found' | 'network' | 'shape';

export interface NvAvailable<T> {
  available: true;
  data: T;
  /** epoch ms this copy was fetched from the server */
  asOf: number;
  fromCache: boolean;
  /** true when the network failed and an older cached copy was served */
  stale: boolean;
  error?: string;
}
export interface NvUnavailable {
  available: false;
  reason: NvUnavailableReason;
  /** plain English for the UI: "nflverse data is not available yet." */
  message: string;
  url: string;
}
export type NvResult<T> = NvAvailable<T> | NvUnavailable;

export interface NflverseClientDeps {
  transport: Transport;
  cache: Cache;
  limiter: Limiter;
  now: () => number;
  /** where the files live, relative to the page (default ./data/nflverse/) */
  basePath?: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const columnar = (x: unknown) => isObj(x) && x.schema === 1 && Array.isArray(x.cols) && Array.isArray(x.rows);
const guards = {
  manifest: (x: unknown) => isObj(x) && x.schema === 1 && typeof x.generatedAt === 'string' && Array.isArray(x.sources) && typeof x.season === 'number',
  columnar,
  coverage: (x: unknown) => columnar(x) && isObj((x as Record<string, unknown>).shells) && isObj((x as Record<string, unknown>).teams),
  unmatched: (x: unknown) => isObj(x) && x.schema === 1 && Array.isArray(x.players),
};

/** Turns a columnar table into one object per row. */
export function decodeColumnar<T>(t: Columnar<string>): T[] {
  return t.rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (let i = 0; i < t.cols.length; i++) o[t.cols[i]] = r[i] ?? null;
    return o as T;
  });
}
export const weeklyRows = (f: WeeklyFile) => decodeColumnar<PlayerWeek>(f);
export const seasonRows = (f: SeasonFile) => decodeColumnar<PlayerSeason>(f);
export const teamRows = (f: TeamsFile) => decodeColumnar<TeamWeek>(f);
export const coverageRows = (f: CoverageFile) => decodeColumnar<CoverageRow>(f);

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createNflverseClient(deps: NflverseClientDeps) {
  const { transport, cache, limiter, now } = deps;
  const base = deps.basePath ?? NFLVERSE_BASE_PATH;
  const urlOf = (file: string) => `${base}${file}`;

  async function load<T>(file: string, guard: (x: unknown) => boolean, o?: FetchOpts): Promise<NvResult<T>> {
    const url = urlOf(file);
    const key = `nflverse:${file}`;
    const gone = (reason: NvUnavailableReason, why: string): NvUnavailable =>
      ({ available: false, reason, url, message: `nflverse data is not available yet (${why}).` });
    const cached = await cache.get(key).catch(() => null);
    if (cached && !o?.force && now() - cached.fetchedAt < NFLVERSE_TTL) {
      return { available: true, data: cached.data as T, asOf: cached.fetchedAt, fromCache: true, stale: false };
    }
    const fallback = (why: string): NvResult<T> =>
      cached ? { available: true, data: cached.data as T, asOf: cached.fetchedAt, fromCache: true, stale: true, error: why } : gone('network', why);
    let res;
    try {
      res = await limiter.run(() => transport(url));
    } catch (e) {
      return fallback(`could not reach ${file}: ${msg(e)}`);
    }
    // the dev server answers unknown paths with index.html (a string body): that is "not there", not a bad file
    if (res.status === 404 || (res.status === 200 && (typeof res.body === 'string' || res.body === null))) return gone('not_found', `${file} was not found`);
    if (res.status < 200 || res.status >= 300) return fallback(`${file} answered HTTP ${res.status}`);
    if (!guard(res.body)) return gone('shape', `${file} has an unexpected format`);
    const asOf = now();
    await cache.put(key, res.body, asOf).catch(() => undefined);
    return { available: true, data: res.body as T, asOf, fromCache: false, stale: false };
  }

  const manifest = (o?: FetchOpts) => load<NflverseManifest>(nflverseFiles.manifest, guards.manifest, o);

  /** Season defaults to the manifest's current season. */
  async function forSeason<T>(file: (s: number | string) => string, guard: (x: unknown) => boolean, season: number | string | undefined, o?: FetchOpts): Promise<NvResult<T>> {
    let s = season;
    if (s === undefined) {
      const m = await manifest(o);
      if (!m.available) return m;
      s = m.data.season;
    }
    return load<T>(file(s), guard, o);
  }

  return {
    manifest,
    weekly: (season?: number | string, o?: FetchOpts) => forSeason<WeeklyFile>(nflverseFiles.weekly, guards.columnar, season, o),
    season: (season?: number | string, o?: FetchOpts) => forSeason<SeasonFile>(nflverseFiles.season, guards.columnar, season, o),
    teams: (season?: number | string, o?: FetchOpts) => forSeason<TeamsFile>(nflverseFiles.teams, guards.columnar, season, o),
    /** The participation-season file (last season until the current season's participation is published): the manifest says which. */
    async coverage(o?: FetchOpts): Promise<NvResult<CoverageFile>> {
      const m = await manifest(o);
      if (!m.available) return m;
      return load<CoverageFile>(nflverseFiles.coverage(m.data.participationSeason), guards.coverage, o);
    },
    unmatched: (o?: FetchOpts) => load<UnmatchedFile>(nflverseFiles.unmatched, guards.unmatched, o),
    urlOf,
  };
}

export type NflverseClient = ReturnType<typeof createNflverseClient>;
