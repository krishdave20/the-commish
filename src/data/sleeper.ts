/* The Sleeper (and FantasyCalc) client: URL → limiter → transport → shape guard → cache, with the
   freshness policy from docs/WEB_APP_NOTES.md. The UI never sees this directly; createDataApi wraps
   the subset it needs. Later milestones use the rest. */
import type {
  Fetched, FetchOpts, LeagueBundle, LeagueUser, NflState, SleeperDraft, SleeperLeague, SleeperRoster, SleeperUser, TradedPick,
} from './contract.ts';
import type { Cache } from './cache.ts';
import { DataError } from './errors.ts';
import type { Limiter } from './limiter.ts';
import { shapes, type Guard } from './shapes.ts';
import type { Transport } from './transport.ts';
import type {
  DraftPick, FantasyCalcRow, Matchup, PlayersMap, ProjectionRow, ScheduleGame, Transaction, TrendingRow, TrendingType, WeekStats,
} from './types.ts';
import { fantasyCalcUrl, OFFENSE_POSITIONS, SLEEPER_BASE, sleeperUrls, type FantasyCalcParams } from './urls.ts';

export const TTL = {
  state: 10 * 60_000,
  players: 24 * 3_600_000,
  default: 6 * 3_600_000,
};

/** Fetched plus what the network call cost; health checks and the Settings screen read the extras. */
export interface Loaded<T> extends Fetched<T> {
  bytes: number;
  ms: number;
  status: number | null;
}

export interface SleeperClientDeps {
  transport: Transport;
  cache: Cache;
  limiter: Limiter;
  now: () => number;
}

interface LoadSpec<T> {
  url: string;
  label: string;
  guard: Guard<T>;
  ttl?: number;
  key?: string;
  /** body to use when Sleeper answers 200 with `null` (an empty list, say) */
  nullAs?: unknown;
  /** a `null` body is a legitimate answer (unknown username) and is neither guarded nor cached */
  nullOk?: boolean;
  /** the 24 h players cap: only forcePlayers bypasses a fresh copy */
  players?: boolean;
  o?: FetchOpts;
}

const cacheKey = (url: string) => (url.startsWith(SLEEPER_BASE) ? `sleeper:${url.slice(SLEEPER_BASE.length)}` : url);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createSleeperClient(deps: SleeperClientDeps) {
  const { transport, cache, limiter, now } = deps;

  async function load<T>(s: LoadSpec<T>): Promise<Loaded<T>> {
    const key = s.key ?? cacheKey(s.url);
    const ttl = s.ttl ?? TTL.default;
    const cached = await cache.get(key).catch(() => null);
    const bypass = s.players ? !!s.o?.forcePlayers : !!(s.o?.force || s.o?.forcePlayers);
    if (cached && !bypass && now() - cached.fetchedAt < ttl) {
      return { data: cached.data as T, asOf: cached.fetchedAt, fromCache: true, stale: false, bytes: cached.bytes, ms: 0, status: null };
    }
    try {
      let res;
      try {
        res = await limiter.run(() => transport(s.url));
      } catch (e) {
        throw new DataError('network', `Could not reach ${s.label}: ${msg(e)}`, { url: s.url });
      }
      if (res.status === 404) throw new DataError('not_found', `${s.label} not found (HTTP 404)`, { url: s.url, status: 404 });
      if (res.status < 200 || res.status >= 300) throw new DataError('http', `${s.label} answered HTTP ${res.status}`, { url: s.url, status: res.status });
      let body = res.body;
      if (body === null || body === undefined) {
        if (s.nullOk) return { data: null as T, asOf: now(), fromCache: false, stale: false, bytes: res.bytes, ms: res.ms, status: res.status };
        if (s.nullAs === undefined) throw new DataError('not_found', `${s.label} not found (empty answer)`, { url: s.url, status: res.status });
        body = s.nullAs;
      }
      if (!s.guard(body)) throw new DataError('shape', `${s.label} came back in an unexpected shape`, { url: s.url, status: res.status });
      const asOf = now();
      await cache.put(key, body, asOf).catch(() => undefined);
      return { data: body, asOf, fromCache: false, stale: false, bytes: res.bytes, ms: res.ms, status: res.status };
    } catch (e) {
      if (cached && !(e instanceof DataError && e.kind === 'not_found')) {
        return { data: cached.data as T, asOf: cached.fetchedAt, fromCache: true, stale: true, error: msg(e), bytes: cached.bytes, ms: 0, status: null };
      }
      throw e;
    }
  }

  const list = <T>(url: string, label: string, guard: Guard<T[]>, o?: FetchOpts) => load<T[]>({ url, label, guard, nullAs: [], o });

  /* ---------- documented endpoints ---------- */

  const nflState = (o?: FetchOpts) =>
    load<NflState>({ url: sleeperUrls.state(), label: 'NFL state', guard: shapes.nflState, ttl: TTL.state, o });

  /** null when Sleeper has no such username */
  const userFetched = (username: string, o?: FetchOpts) => {
    const name = username.trim();
    return load<SleeperUser | null>({
      url: sleeperUrls.user(name), key: `sleeper:/v1/user/${name.toLowerCase()}`, label: `Sleeper user "${name}"`,
      guard: shapes.user, nullOk: true, o,
    });
  };
  const user = async (username: string, o?: FetchOpts): Promise<SleeperUser | null> =>
    username.trim() ? (await userFetched(username, o)).data : null;

  const userLeagues = (userId: string, season: string, o?: FetchOpts) =>
    list<SleeperLeague>(sleeperUrls.userLeagues(userId, season), 'user leagues', shapes.leagues, o);
  const league = (id: string, o?: FetchOpts) =>
    load<SleeperLeague>({ url: sleeperUrls.league(id), label: 'league', guard: shapes.league, o });
  const rosters = (id: string, o?: FetchOpts) =>
    load<SleeperRoster[]>({ url: sleeperUrls.rosters(id), label: 'rosters', guard: shapes.rosters, o });
  const users = (id: string, o?: FetchOpts) =>
    load<LeagueUser[]>({ url: sleeperUrls.users(id), label: 'league users', guard: shapes.leagueUsers, o });
  const matchups = (id: string, week: number, o?: FetchOpts) =>
    list<Matchup>(sleeperUrls.matchups(id, week), `week ${week} matchups`, shapes.matchups, o);
  const transactions = (id: string, week: number, o?: FetchOpts) =>
    list<Transaction>(sleeperUrls.transactions(id, week), `week ${week} transactions`, shapes.transactions, o);
  const tradedPicks = (id: string, o?: FetchOpts) =>
    list<TradedPick>(sleeperUrls.tradedPicks(id), 'traded picks', shapes.tradedPicks, o);
  const drafts = (id: string, o?: FetchOpts) =>
    list<SleeperDraft>(sleeperUrls.drafts(id), 'league drafts', shapes.drafts, o);
  const draft = (draftId: string, o?: FetchOpts) =>
    load<SleeperDraft>({ url: sleeperUrls.draft(draftId), label: 'draft', guard: shapes.draft, o });
  /** the live assistant polls this with force: true */
  const draftPicks = (draftId: string, o?: FetchOpts) =>
    list<DraftPick>(sleeperUrls.draftPicks(draftId), 'draft picks', shapes.draftPicks, o);
  const draftTradedPicks = (draftId: string, o?: FetchOpts) =>
    list<TradedPick>(sleeperUrls.draftTradedPicks(draftId), 'draft traded picks', shapes.tradedPicks, o);
  const players = (o?: FetchOpts) =>
    load<PlayersMap>({ url: sleeperUrls.players(), label: 'player list', guard: shapes.players, ttl: TTL.players, players: true, o });
  const trending = (type: TrendingType, lookbackHours = 24, limit = 50, o?: FetchOpts) =>
    list<TrendingRow>(sleeperUrls.trending(type, lookbackHours, limit), `trending ${type}s`, shapes.trending, o);

  /* ---------- undocumented endpoints (each has a health check) ---------- */

  const stats = (season: string, week: number, o?: FetchOpts) =>
    load<WeekStats>({ url: sleeperUrls.stats(season, week), label: `week ${week} stats`, guard: shapes.weekStats, nullAs: {}, o });
  const projections = (season: string, week: number, positions: string[] = OFFENSE_POSITIONS, o?: FetchOpts) =>
    list<ProjectionRow>(sleeperUrls.projections(season, week, positions), `week ${week} projections`, shapes.projections, o);
  const seasonProjections = (season: string, positions: string[] = OFFENSE_POSITIONS, o?: FetchOpts) =>
    list<ProjectionRow>(sleeperUrls.seasonProjections(season, positions), 'season projections', shapes.projections, o);
  const schedule = (season: string, o?: FetchOpts) =>
    load<ScheduleGame[]>({ url: sleeperUrls.schedule(season), label: 'NFL schedule', guard: shapes.schedule, o });

  /* ---------- FantasyCalc ---------- */

  const fantasyCalc = (p: FantasyCalcParams, o?: FetchOpts) =>
    load<FantasyCalcRow[]>({ url: fantasyCalcUrl(p), label: 'FantasyCalc values', guard: shapes.fantasyCalc, o });

  /* ---------- composite ---------- */

  async function leagueBundle(leagueId: string, o?: FetchOpts): Promise<Loaded<LeagueBundle>> {
    const [l, r, u, d, t] = await Promise.all([league(leagueId, o), rosters(leagueId, o), users(leagueId, o), drafts(leagueId, o), tradedPicks(leagueId, o)]);
    const parts = [l, r, u, d, t];
    return {
      data: { league: l.data, rosters: r.data, users: u.data, drafts: d.data, tradedPicks: t.data },
      asOf: Math.min(...parts.map((p) => p.asOf)),
      fromCache: parts.every((p) => p.fromCache),
      stale: parts.some((p) => p.stale),
      error: parts.find((p) => p.error)?.error,
      bytes: parts.reduce((s, p) => s + p.bytes, 0),
      ms: Math.max(...parts.map((p) => p.ms)),
      status: parts.find((p) => p.status !== null)?.status ?? null,
    };
  }

  return {
    nflState, user, userFetched, userLeagues, league, rosters, users, matchups, transactions, tradedPicks,
    drafts, draft, draftPicks, draftTradedPicks, players, trending,
    stats, projections, seasonProjections, schedule, fantasyCalc, leagueBundle,
  };
}

export type SleeperClient = ReturnType<typeof createSleeperClient>;
