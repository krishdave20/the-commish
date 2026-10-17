// @vitest-environment node
import { openDB } from 'idb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCache } from './cache.ts';

let n = 0;
const freshName = () => `the-commish-test-${n++}`;
afterEach(() => { vi.unstubAllGlobals(); });

describe('cache', () => {
  it('round-trips JSON through gzip and keeps fetchedAt', async () => {
    const c = createCache({ dbName: freshName() });
    const data = { a: [1, 2, 3], s: 'héllo', nested: { x: null } };
    await c.put('k', data, 1234);
    const got = await c.get('k');
    expect(got?.data).toEqual(data);
    expect(got?.fetchedAt).toBe(1234);
    expect(await c.get('missing')).toBeNull();
  });

  it('stores gzip bytes in the `raw` store of the `the-commish`-style db', async () => {
    const name = freshName();
    const c = createCache({ dbName: name });
    const big = { rows: Array.from({ length: 2000 }, (_, i) => ({ id: i, team: 'KC' })) };
    await c.put('big', big, 1);
    const db = await openDB(name);
    const rec = await db.get('raw', 'big');
    expect([rec.body[0], rec.body[1]]).toEqual([0x1f, 0x8b]);
    expect(rec.bytes).toBe(rec.body.length);
    expect(rec.bytes).toBeLessThan(JSON.stringify(big).length / 5);
    db.close();
  });

  it('reports entries, total bytes and clears', async () => {
    const c = createCache({ dbName: freshName() });
    await c.put('b', { v: 1 }, 10);
    await c.put('a', { v: 2 }, 20);
    const s = await c.stats();
    expect(s.entries.map((e) => e.key)).toEqual(['a', 'b']);
    expect(s.entries[0].fetchedAt).toBe(20);
    expect(s.totalBytes).toBe(s.entries[0].bytes + s.entries[1].bytes);
    await c.delete('a');
    expect((await c.stats()).entries.map((e) => e.key)).toEqual(['b']);
    await c.clear();
    expect((await c.stats()).entries).toEqual([]);
    expect(await c.get('b')).toBeNull();
  });

  it('overwrites an existing key', async () => {
    const c = createCache({ dbName: freshName() });
    await c.put('k', 1, 1);
    await c.put('k', 2, 2);
    expect((await c.get('k'))?.data).toBe(2);
    expect((await c.stats()).entries).toHaveLength(1);
  });

  it('adds the storage quota when the browser reports one', async () => {
    vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 5_000_000 }) } });
    const c = createCache({ dbName: freshName() });
    expect((await c.stats()).quotaBytes).toBe(5_000_000);
  });

  it('falls back to memory when IndexedDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const c = createCache();
    await c.put('k', { ok: true }, 5);
    expect((await c.get('k'))?.data).toEqual({ ok: true });
    expect((await c.stats()).entries).toHaveLength(1);
    await c.clear();
    expect(await c.get('k')).toBeNull();
  });

  it('falls back to memory when IndexedDB throws on open', async () => {
    vi.stubGlobal('indexedDB', { open() { throw new Error('blocked'); } });
    const c = createCache({ dbName: freshName() });
    await c.put('k', [1, 2], 5);
    expect((await c.get('k'))?.data).toEqual([1, 2]);
  });

  it('memoryOnly never touches IndexedDB', async () => {
    const name = freshName();
    const c = createCache({ dbName: name, memoryOnly: true });
    await c.put('k', 1, 1);
    const dbs = await indexedDB.databases();
    expect(dbs.some((d) => d.name === name)).toBe(false);
    expect((await c.get('k'))?.data).toBe(1);
  });
});
