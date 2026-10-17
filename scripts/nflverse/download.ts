/* Conditional downloads into a cache directory. Each file's ETag and Last-Modified are kept in meta.json next to
   it; the next run sends If-None-Match / If-Modified-Since and only re-downloads when the server says it changed
   (HTTP 304 otherwise). CI persists the cache directory with actions/cache, so a nightly run with no new data
   downloads nothing. Files stream to disk; nothing is held in memory. */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface FileMeta {
  etag: string | null;
  lastModified: string | null;
  bytes: number;
  /** ISO time of the last successful check against the server */
  checkedAt: string;
}
export type MetaMap = Record<string, FileMeta>;
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface DownloadResult { path: string; meta: FileMeta; fromCache: boolean }
export interface DownloadOpts {
  fetch?: Fetch;
  /** ignore the cached copy */
  force?: boolean;
  attempts?: number;
  retryDelayMs?: number;
  log?: (msg: string) => void;
  now?: () => Date;
}

const META = 'meta.json';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const has = async (p: string) => stat(p).then(() => true, () => false);

export async function loadMeta(dir: string): Promise<MetaMap> {
  try { return JSON.parse(await readFile(join(dir, META), 'utf8')) as MetaMap; } catch { return {}; }
}
export async function saveMeta(dir: string, meta: MetaMap): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, META), JSON.stringify(meta, null, 1));
}

/** HEAD request: does this release asset exist? (GitHub answers 404 for a file that was never published.) */
export async function exists(url: string, f: Fetch = fetch): Promise<boolean> {
  try {
    const res = await f(url, { method: 'HEAD', redirect: 'follow' });
    return res.status >= 200 && res.status < 300;
  } catch { return false; }
}

/**
 * Downloads `url` to `<dir>/<name>` unless the cached copy is still current. Returns null when the server answers 404.
 * On a network failure with a cached copy on disk, the cached copy is used (and reported as fromCache).
 */
export async function download(url: string, dir: string, name: string, meta: MetaMap, o: DownloadOpts = {}): Promise<DownloadResult | null> {
  const f = o.fetch ?? fetch;
  const log = o.log ?? (() => undefined);
  const now = o.now ?? (() => new Date());
  const dest = join(dir, name);
  await mkdir(dir, { recursive: true });
  const have = (await has(dest)) ? meta[name] : undefined;
  const cached = o.force ? undefined : have;
  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  const attempts = o.attempts ?? 3;
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await f(url, { headers, redirect: 'follow' });
      if (res.status === 304 && cached) {
        const m = { ...cached, checkedAt: now().toISOString() };
        meta[name] = m;
        log(`${name}: not modified`);
        return { path: dest, meta: m, fromCache: true };
      }
      if (res.status === 404) return null;
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (res.status !== 200 || !res.body) throw Object.assign(new Error(`${url} answered HTTP ${res.status}`), { fatal: true });
      const tmp = `${dest}.part`;
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
      await rename(tmp, dest);
      const m: FileMeta = {
        etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified'), bytes: (await stat(dest)).size, checkedAt: now().toISOString(),
      };
      meta[name] = m;
      log(`${name}: downloaded ${(m.bytes / 1e6).toFixed(1)} MB`);
      return { path: dest, meta: m, fromCache: false };
    } catch (e) {
      lastErr = e;
      await rm(`${dest}.part`, { force: true });
      if ((e as { fatal?: boolean }).fatal) break;
      if (i < attempts) await sleep((o.retryDelayMs ?? 1000) * i);
    }
  }
  // offline or flaky: a copy we already have beats failing the whole nightly job
  if (have) {
    log(`${name}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}; using the cached copy`);
    return { path: dest, meta: have, fromCache: true };
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** A file refreshed at most every `maxAgeMs` (Sleeper's players map: they ask for one fetch a day). */
export async function downloadFresh(url: string, dir: string, name: string, meta: MetaMap, maxAgeMs: number, o: DownloadOpts = {}): Promise<DownloadResult> {
  const dest = join(dir, name);
  const m = meta[name];
  const now = o.now ?? (() => new Date());
  if (!o.force && m && (await has(dest)) && now().getTime() - new Date(m.checkedAt).getTime() < maxAgeMs) {
    (o.log ?? (() => undefined))(`${name}: fresh enough, not fetched`);
    return { path: dest, meta: m, fromCache: true };
  }
  // no conditional headers: Sleeper sends no validators, and force is already true for this call
  const r = await download(url, dir, name, meta, { ...o, force: true });
  if (!r) throw new Error(`${url} answered 404`);
  return r;
}
