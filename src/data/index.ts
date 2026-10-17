/* Public surface of the data layer. The UI imports from here only. */
import type { AccountStore, DataApi } from './contract.ts';
import { createCache, type Cache } from './cache.ts';
import { createHealth } from './health.ts';
import { createNflverseClient, type NflverseClient } from './nflverse.ts';
import { createLimiter, type Limiter } from './limiter.ts';
import { createSleeperClient, type SleeperClient } from './sleeper.ts';
import { browserTransport, type Transport } from './transport.ts';
import { createAccountStore as makeAccountStore } from './accounts.ts';

export * from './contract.ts';
export { detectPhase } from './phase.ts';
export { DataError, type DataErrorKind } from './errors.ts';
export { createSleeperClient, TTL, type Loaded, type SleeperClient } from './sleeper.ts';
export { createCache, type Cache, type CachedValue } from './cache.ts';
export { createLimiter, type Limiter } from './limiter.ts';
export { browserTransport, fixtureTransport, type Transport, type TransportResult, type FixtureManifest, type FixtureSource } from './transport.ts';
export { createHealth } from './health.ts';
export {
  createNflverseClient, decodeColumnar, weeklyRows, seasonRows, teamRows, coverageRows, NFLVERSE_TTL,
  type NflverseClient, type NvResult, type NvAvailable, type NvUnavailable, type NvUnavailableReason,
} from './nflverse.ts';
export * from './nflverseTypes.ts';
export { resolveIds, normalizeName, normalizeTeam, pfrToGsis, type NvPlayer, type SleeperCand, type IdResolution } from './ids.ts';
export { shapes } from './shapes.ts';
export { planPull, type PullPlan } from './plan.ts';
export { sleeperUrls, fantasyCalcUrl, nflverseUrls, positionsFor } from './urls.ts';
export type * from './types.ts';

export interface DataOpts {
  transport?: Transport;
  cache?: Cache;
  now?: () => number;
}

/** Everything wired together; later milestones take `sleeper` for the endpoints the UI does not use yet. */
export interface DataLayer {
  api: DataApi;
  sleeper: SleeperClient;
  /** the nightly nflverse job's files, same origin */
  nflverse: NflverseClient;
  cache: Cache;
  limiter: Limiter;
}

export function createDataLayer(opts: DataOpts = {}): DataLayer {
  const transport = opts.transport ?? browserTransport;
  const now = opts.now ?? Date.now;
  const cache = opts.cache ?? createCache({ now });
  const limiter = createLimiter({ now });
  const sleeper = createSleeperClient({ transport, cache, limiter, now });
  const nflverse = createNflverseClient({ transport, cache, limiter, now });
  const { healthChecks } = createHealth({ transport, limiter, client: sleeper, nflverse, now });
  const api: DataApi = {
    nflState: (o) => sleeper.nflState(o),
    user: (username) => sleeper.user(username),
    userLeagues: (userId, season, o) => sleeper.userLeagues(userId, season, o),
    leagueBundle: (leagueId, o) => sleeper.leagueBundle(leagueId, o),
    healthChecks,
    cacheStats: () => cache.stats(),
    clearCache: () => cache.clear(),
  };
  return { api, sleeper, nflverse, cache, limiter };
}

export function createDataApi(opts: DataOpts = {}): DataApi {
  return createDataLayer(opts).api;
}

export function createAccountStore(storage?: Storage): AccountStore {
  return makeAccountStore(storage);
}
