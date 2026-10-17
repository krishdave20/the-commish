import type { Fetched, FetchOpts } from '../data';

/* A tiny shared cache of fetch results, so the sidebar, the page header and the page body
   share one request per key instead of each asking the data layer. */

export interface Entry<T = unknown> {
  data?: T;
  asOf: number | null;
  fromCache: boolean;
  stale: boolean;
  error?: string;
  loading: boolean;
}

export type Fetcher<T> = (o?: FetchOpts) => Promise<Fetched<T>>;

export interface StoreOptions {
  /** when true, data that came back stale from the cache is refreshed once automatically */
  autoRefreshOnOpen?: () => boolean;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class ResourceStore {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<void>>();
  private autoRefreshed = new Set<string>();
  private listeners = new Set<() => void>();
  private version = 0;
  private epoch = 0;
  private opts: StoreOptions;

  constructor(opts: StoreOptions = {}) {
    this.opts = opts;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getVersion = (): number => this.version;

  get<T>(key: string): Entry<T> | undefined {
    return this.entries.get(key) as Entry<T> | undefined;
  }

  private set(key: string, entry: Entry) {
    this.entries.set(key, entry);
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Fetch `key`. A forced load always goes to the network; an unforced one joins any request in flight. */
  load<T>(key: string, fetcher: Fetcher<T>, force = false): Promise<void> {
    const running = this.inflight.get(key);
    if (running && !force) return running;

    const epoch = this.epoch;
    const prev = this.entries.get(key);
    this.set(key, { asOf: null, fromCache: false, stale: false, ...prev, loading: true });

    const p = fetcher(force ? { force: true } : undefined).then(
      (res) => {
        if (epoch !== this.epoch) return;
        this.set(key, { data: res.data, asOf: res.asOf, fromCache: res.fromCache, stale: res.stale, error: res.error, loading: false });
        const again = !force && res.fromCache && res.stale && !res.error && !this.autoRefreshed.has(key)
          && (this.opts.autoRefreshOnOpen?.() ?? false);
        if (again) {
          this.autoRefreshed.add(key);
          void this.load(key, fetcher, true);
        }
      },
      (e: unknown) => {
        if (epoch !== this.epoch) return;
        const cur = this.entries.get(key);
        this.set(key, { asOf: null, fromCache: false, stale: false, ...cur, error: message(e), loading: false });
      },
    ).finally(() => {
      if (this.inflight.get(key) === p) this.inflight.delete(key);
    });
    this.inflight.set(key, p);
    return p;
  }

  /** Forget everything (after the cache is cleared or someone signs out). Mounted hooks refetch. */
  clear() {
    this.epoch++;
    this.entries.clear();
    this.inflight.clear();
    this.autoRefreshed.clear();
    this.version++;
    for (const l of this.listeners) l();
  }
}
