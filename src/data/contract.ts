/* The boundary between the UI and the data layer.
   The UI only ever talks to a DataApi and an AccountStore; it never calls fetch itself.
   In the browser the DataApi is backed by live Sleeper fetches plus an IndexedDB cache;
   in tests it is backed by the saved fixture in reference/fixture/ (fully offline). */

/* ---------- Sleeper shapes (only the fields the app reads) ---------- */

export type SeasonType = 'pre' | 'regular' | 'post' | 'off';

export interface NflState {
  week: number;
  display_week?: number;
  season: string;
  season_type: SeasonType;
  league_season?: string;
  previous_season?: string;
  season_start_date?: string;
}

export interface SleeperUser {
  user_id: string;
  username?: string;
  display_name: string;
  avatar: string | null;
}

export type LeagueStatus = 'pre_draft' | 'drafting' | 'in_season' | 'complete';

export interface LeagueSettings {
  playoff_week_start?: number;
  playoff_teams?: number;
  divisions?: number;
  waiver_budget?: number;
  /** 0 redraft, 1 keeper, 2 dynasty */
  type?: number;
  [k: string]: unknown;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: LeagueStatus;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: LeagueSettings;
  previous_league_id: string | null;
  draft_id: string | null;
  avatar: string | null;
  metadata: Record<string, string> | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners?: string[] | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  settings: {
    wins?: number; losses?: number; ties?: number;
    fpts?: number; fpts_decimal?: number;
    fpts_against?: number; fpts_against_decimal?: number;
    waiver_budget_used?: number; division?: number;
    [k: string]: unknown;
  };
}

export interface LeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata?: { team_name?: string; [k: string]: unknown } | null;
}

export type DraftStatus = 'pre_draft' | 'drafting' | 'paused' | 'complete';

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  season: string;
  status: DraftStatus;
  type: string;
  start_time: number | null;
  settings: Record<string, number>;
  draft_order: Record<string, number> | null;
  slot_to_roster_id?: Record<string, number> | null;
  metadata?: Record<string, string> | null;
}

export interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
}

/* ---------- what the data layer returns ---------- */

/** Every value the UI shows carries where and when it came from. */
export interface Fetched<T> {
  data: T;
  /** epoch ms when this data was fetched from the network */
  asOf: number;
  /** true when served from the cache (network skipped or failed) */
  fromCache: boolean;
  /** true when older than the freshness policy for this endpoint */
  stale: boolean;
  /** set when the network failed and we fell back to the cache */
  error?: string;
}

export interface FetchOpts {
  /** skip the cache and go to the network (still honours the players-file daily cap unless forcePlayers) */
  force?: boolean;
  forcePlayers?: boolean;
}

export interface LeagueBundle {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: LeagueUser[];
  drafts: SleeperDraft[];
  tradedPicks: TradedPick[];
}

export interface HealthContext {
  season: string;
  week: number;
  username?: string;
  userId?: string;
  leagueId?: string;
  draftId?: string;
}

export interface HealthResult {
  id: string;
  label: string;
  /** the URL that was checked */
  url: string;
  /** false for Sleeper's undocumented endpoints */
  documented: boolean;
  source: 'sleeper' | 'nflverse' | 'fantasycalc';
  /** ok: works. warn: expected gap (e.g. 2026 participation not published, nflverse blocked by CORS until
      the nightly job exists). fail: broken; message says which features are affected. */
  level: 'ok' | 'warn' | 'fail';
  httpStatus: number | null;
  ms: number;
  bytes: number;
  /** plain-English line: what was found, or what broke and what still works */
  message: string;
  checkedAt: number;
}

export interface CacheEntryInfo {
  key: string;
  bytes: number;
  fetchedAt: number;
}

export interface CacheStats {
  entries: CacheEntryInfo[];
  totalBytes: number;
  /** from navigator.storage.estimate() when available */
  quotaBytes?: number;
}

export interface DataApi {
  nflState(o?: FetchOpts): Promise<Fetched<NflState>>;
  /** resolves null when Sleeper has no such username (Sleeper answers 200 with a `null` body) */
  user(username: string): Promise<SleeperUser | null>;
  userLeagues(userId: string, season: string, o?: FetchOpts): Promise<Fetched<SleeperLeague[]>>;
  leagueBundle(leagueId: string, o?: FetchOpts): Promise<Fetched<LeagueBundle>>;
  healthChecks(ctx: HealthContext): Promise<HealthResult[]>;
  cacheStats(): Promise<CacheStats>;
  clearCache(): Promise<void>;
}

/* ---------- linked accounts on this device ---------- */

export interface LinkedAccount {
  userId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  /** leagues the person chose to follow */
  leagueIds: string[];
  activeLeagueId: string | null;
  addedAt: number;
}

export interface AccountStore {
  list(): LinkedAccount[];
  active(): LinkedAccount | null;
  upsert(acc: LinkedAccount): void;
  setActive(userId: string): void;
  setActiveLeague(userId: string, leagueId: string): void;
  remove(userId: string): void;
  subscribe(fn: () => void): () => void;
}

/* ---------- season phase ---------- */

export type Phase = 'offseason' | 'pre_draft' | 'drafting' | 'in_season' | 'postseason';
