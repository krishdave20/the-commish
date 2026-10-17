/* The watchlist: Sleeper player ids a manager wants to keep an eye on, in localStorage `wr.watchlist.v1`. */
export const WATCHLIST_KEY = 'wr.watchlist.v1';

const listeners = new Set<() => void>();
let cache: { raw: string | null; list: string[] } | null = null;

function readRaw(): string | null {
  try { return window.localStorage.getItem(WATCHLIST_KEY); } catch { return null; }
}

/** A stable array until the stored value changes (so React can subscribe to it). */
export function getWatchlist(): string[] {
  const raw = readRaw();
  if (cache && cache.raw === raw) return cache.list;
  let list: string[] = [];
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(v)) list = v.filter((x): x is string => typeof x === 'string');
  } catch { /* a broken value reads as empty */ }
  cache = { raw, list };
  return list;
}

function write(list: string[]) {
  try { window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)); } catch { /* storage unavailable */ }
  cache = null;
  for (const l of listeners) l();
}

export function toggleWatch(pid: string): void {
  const cur = getWatchlist();
  write(cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]);
}

export function subscribeWatchlist(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === WATCHLIST_KEY) { cache = null; fn(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}
