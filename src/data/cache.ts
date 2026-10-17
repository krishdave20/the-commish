/* Raw API responses, gzipped, in IndexedDB (db `war-room`, store `raw`). A small `meta` store holds
   key/size/time so stats() never has to read the 14 MB players blob. If IndexedDB is missing or throws
   (private windows, blocked storage, tests) everything falls back to an in-memory map. */
import { openDB, type IDBPDatabase } from 'idb';
import type { CacheStats } from './contract.ts';

export interface CachedValue { data: unknown; fetchedAt: number; bytes: number }

export interface Cache {
  get(key: string): Promise<CachedValue | null>;
  put(key: string, data: unknown, fetchedAt?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  stats(): Promise<CacheStats>;
}

export interface CacheOpts {
  dbName?: string;
  now?: () => number;
  /** skip IndexedDB entirely */
  memoryOnly?: boolean;
}

interface RawRecord { enc: 'gzip' | 'json'; body: Uint8Array; fetchedAt: number; bytes: number }
interface MetaRecord { key: string; bytes: number; fetchedAt: number }

const hasStreams = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function pipe(input: Uint8Array, ts: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }): Promise<Uint8Array> {
  const w = ts.writable.getWriter();
  // not awaited on purpose: the writer only resolves once the reader drains
  void w.write(input as Uint8Array<ArrayBuffer>).then(() => w.close());
  const r = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export const gzip = (text: string) => pipe(new TextEncoder().encode(text), new CompressionStream('gzip') as never);
export const gunzip = async (bytes: Uint8Array) => new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip') as never));

async function pack(data: unknown, fetchedAt: number): Promise<RawRecord> {
  const text = JSON.stringify(data) ?? 'null';
  if (hasStreams()) {
    const body = await gzip(text);
    return { enc: 'gzip', body, fetchedAt, bytes: body.length };
  }
  const body = new TextEncoder().encode(text);
  return { enc: 'json', body, fetchedAt, bytes: body.length };
}

async function unpack(rec: RawRecord): Promise<CachedValue> {
  const text = rec.enc === 'gzip' ? await gunzip(rec.body) : new TextDecoder().decode(rec.body);
  return { data: JSON.parse(text), fetchedAt: rec.fetchedAt, bytes: rec.bytes };
}

export function createCache(opts: CacheOpts = {}): Cache {
  const dbName = opts.dbName ?? 'war-room';
  const now = opts.now ?? Date.now;
  const mem = new Map<string, RawRecord>();
  let dbp: Promise<IDBPDatabase | null> | null = null;

  const getDb = (): Promise<IDBPDatabase | null> => {
    if (opts.memoryOnly || typeof indexedDB === 'undefined') return Promise.resolve(null);
    dbp ??= (async () => {
      try {
        return await openDB(dbName, 1, {
          upgrade(db) {
            db.createObjectStore('raw');
            db.createObjectStore('meta', { keyPath: 'key' });
          },
        });
      } catch { return null; }
    })();
    return dbp;
  };

  return {
    async get(key) {
      const db = await getDb();
      let rec: RawRecord | undefined;
      if (db) {
        try { rec = (await db.get('raw', key)) as RawRecord | undefined; } catch { rec = mem.get(key); }
      } else rec = mem.get(key);
      if (!rec && db) rec = mem.get(key);
      if (!rec) return null;
      try { return await unpack(rec); } catch { return null; }
    },

    async put(key, data, fetchedAt = now()) {
      const rec = await pack(data, fetchedAt);
      const db = await getDb();
      if (db) {
        try {
          const tx = db.transaction(['raw', 'meta'], 'readwrite');
          await Promise.all([
            tx.objectStore('raw').put(rec, key),
            tx.objectStore('meta').put({ key, bytes: rec.bytes, fetchedAt } satisfies MetaRecord),
            tx.done,
          ]);
          mem.delete(key);
          return;
        } catch { /* fall through to memory */ }
      }
      mem.set(key, rec);
    },

    async delete(key) {
      mem.delete(key);
      const db = await getDb();
      if (!db) return;
      try {
        const tx = db.transaction(['raw', 'meta'], 'readwrite');
        await Promise.all([tx.objectStore('raw').delete(key), tx.objectStore('meta').delete(key), tx.done]);
      } catch { /* nothing to remove */ }
    },

    async clear() {
      mem.clear();
      const db = await getDb();
      if (!db) return;
      try {
        const tx = db.transaction(['raw', 'meta'], 'readwrite');
        await Promise.all([tx.objectStore('raw').clear(), tx.objectStore('meta').clear(), tx.done]);
      } catch { /* nothing to clear */ }
    },

    async stats() {
      const entries = new Map<string, MetaRecord>();
      const db = await getDb();
      if (db) {
        try { for (const m of (await db.getAll('meta')) as MetaRecord[]) entries.set(m.key, m); } catch { /* memory only */ }
      }
      for (const [key, r] of mem) entries.set(key, { key, bytes: r.bytes, fetchedAt: r.fetchedAt });
      const list = [...entries.values()].sort((a, b) => a.key.localeCompare(b.key));
      const out: CacheStats = { entries: list, totalBytes: list.reduce((s, e) => s + e.bytes, 0) };
      try {
        const est = await navigator.storage?.estimate?.();
        if (est?.quota) out.quotaBytes = est.quota;
      } catch { /* unavailable */ }
      return out;
    },
  };
}
