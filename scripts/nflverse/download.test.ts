// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { download, downloadFresh, exists, loadMeta, saveMeta, type Fetch, type MetaMap } from './download.ts';

let dir: string;
beforeEach(async () => {
  await mkdir(join(process.cwd(), '.cache'), { recursive: true });
  dir = await mkdtemp(join(process.cwd(), '.cache', 'test-download-'));
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

interface Server { etag: string; lastModified: string; body: string; status?: number }
/** a fake GitHub release asset: honours If-None-Match / If-Modified-Since like the real one */
function fakeServer(s: Server) {
  const calls: Array<{ method: string; headers: Record<string, string> }> = [];
  const f: Fetch = async (_url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ method: init?.method ?? 'GET', headers });
    if (s.status && s.status !== 200) return new Response(null, { status: s.status });
    if (headers['If-None-Match'] === s.etag || headers['If-Modified-Since'] === s.lastModified) return new Response(null, { status: 304 });
    return new Response(s.body, { status: 200, headers: { etag: s.etag, 'last-modified': s.lastModified } });
  };
  return { f, calls, server: s };
}

const at = (iso: string) => () => new Date(iso);

describe('conditional downloads', () => {
  it('downloads once, stores ETag and Last-Modified, and does not download again while unchanged', async () => {
    const srv = fakeServer({ etag: '"v1"', lastModified: 'Fri, 16 Oct 2026 11:00:00 GMT', body: 'a,b\n1,2\n' });
    const meta: MetaMap = {};
    const first = await download('https://x/f.csv', dir, 'f.csv', meta, { fetch: srv.f });
    expect(first).toMatchObject({ fromCache: false, meta: { etag: '"v1"', lastModified: 'Fri, 16 Oct 2026 11:00:00 GMT', bytes: 8 } });
    expect(await readFile(join(dir, 'f.csv'), 'utf8')).toBe('a,b\n1,2\n');
    expect(srv.calls[0].headers).toEqual({});

    const second = await download('https://x/f.csv', dir, 'f.csv', meta, { fetch: srv.f });
    expect(second).toMatchObject({ fromCache: true });
    expect(srv.calls[1].headers['If-None-Match']).toBe('"v1"');
    expect(srv.calls[1].headers['If-Modified-Since']).toBe('Fri, 16 Oct 2026 11:00:00 GMT');
    expect(await readFile(join(dir, 'f.csv'), 'utf8')).toBe('a,b\n1,2\n');
  });

  it('re-downloads when the server’s copy changed', async () => {
    const srv = fakeServer({ etag: '"v1"', lastModified: 'Fri, 16 Oct 2026 11:00:00 GMT', body: 'old' });
    const meta: MetaMap = {};
    await download('https://x/f', dir, 'f', meta, { fetch: srv.f });
    srv.server.etag = '"v2"';
    srv.server.lastModified = 'Sat, 17 Oct 2026 11:00:00 GMT';
    srv.server.body = 'new!';
    const r = await download('https://x/f', dir, 'f', meta, { fetch: srv.f });
    expect(r).toMatchObject({ fromCache: false, meta: { etag: '"v2"', bytes: 4 } });
    expect(await readFile(join(dir, 'f'), 'utf8')).toBe('new!');
    expect(meta.f.etag).toBe('"v2"');
  });

  it('the meta file survives between runs (CI persists the cache directory)', async () => {
    const srv = fakeServer({ etag: '"v1"', lastModified: 'L', body: 'abc' });
    const meta = await loadMeta(dir);
    expect(meta).toEqual({});
    await download('https://x/f', dir, 'f', meta, { fetch: srv.f });
    await saveMeta(dir, meta);
    const next = await loadMeta(dir);
    const r = await download('https://x/f', dir, 'f', next, { fetch: srv.f });
    expect(r).toMatchObject({ fromCache: true });
  });

  it('sends no validators when the cached file is gone, even if the meta remembers it', async () => {
    const srv = fakeServer({ etag: '"v1"', lastModified: 'L', body: 'abc' });
    const meta: MetaMap = { f: { etag: '"v1"', lastModified: 'L', bytes: 3, checkedAt: 'x' } };
    const r = await download('https://x/f', dir, 'f', meta, { fetch: srv.f });
    expect(srv.calls[0].headers).toEqual({});
    expect(r).toMatchObject({ fromCache: false });
  });

  it('force ignores the cached copy', async () => {
    const srv = fakeServer({ etag: '"v1"', lastModified: 'L', body: 'abc' });
    const meta: MetaMap = {};
    await download('https://x/f', dir, 'f', meta, { fetch: srv.f });
    const r = await download('https://x/f', dir, 'f', meta, { fetch: srv.f, force: true });
    expect(r).toMatchObject({ fromCache: false });
    expect(srv.calls[1].headers).toEqual({});
  });

  it('404 resolves null (the file was never published)', async () => {
    const srv = fakeServer({ etag: 'e', lastModified: 'l', body: '', status: 404 });
    expect(await download('https://x/f', dir, 'f', {}, { fetch: srv.f })).toBeNull();
  });

  it('retries a server error, then gives up with the error when there is no cached copy', async () => {
    const srv = fakeServer({ etag: 'e', lastModified: 'l', body: '', status: 503 });
    await expect(download('https://x/f', dir, 'f', {}, { fetch: srv.f, attempts: 3, retryDelayMs: 1 })).rejects.toThrow(/503/);
    expect(srv.calls).toHaveLength(3);
  });

  it('does not retry a client error such as 403', async () => {
    const srv = fakeServer({ etag: 'e', lastModified: 'l', body: '', status: 403 });
    await expect(download('https://x/f', dir, 'f', {}, { fetch: srv.f, attempts: 3, retryDelayMs: 1 })).rejects.toThrow(/403/);
    expect(srv.calls).toHaveLength(1);
  });

  it('a network failure with a cached copy on disk uses it instead of failing the nightly job', async () => {
    await writeFile(join(dir, 'f'), 'cached');
    const meta: MetaMap = { f: { etag: '"v1"', lastModified: 'L', bytes: 6, checkedAt: 'x' } };
    const down: Fetch = async () => { throw new TypeError('fetch failed'); };
    const logs: string[] = [];
    const r = await download('https://x/f', dir, 'f', meta, { fetch: down, attempts: 2, retryDelayMs: 1, log: (m) => logs.push(m) });
    expect(r).toMatchObject({ fromCache: true, path: join(dir, 'f') });
    expect(logs.join()).toMatch(/using the cached copy/);
  });

  it('a network failure with nothing cached throws', async () => {
    const down: Fetch = async () => { throw new TypeError('fetch failed'); };
    await expect(download('https://x/f', dir, 'f', {}, { fetch: down, attempts: 1 })).rejects.toThrow(/fetch failed/);
  });

  it('a failed download leaves no half-written file behind', async () => {
    const broken: Fetch = async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('part')); c.error(new Error('reset')); } }), { status: 200 });
    await expect(download('https://x/f', dir, 'f', {}, { fetch: broken, attempts: 1 })).rejects.toThrow();
    await expect(readFile(join(dir, 'f'))).rejects.toThrow();
    await expect(readFile(join(dir, 'f.part'))).rejects.toThrow();
  });
});

describe('exists (HEAD)', () => {
  it('true for 200, false for 404 and for network errors', async () => {
    const srv = fakeServer({ etag: 'e', lastModified: 'l', body: 'x' });
    expect(await exists('https://x/f', srv.f)).toBe(true);
    expect(srv.calls[0].method).toBe('HEAD');
    expect(await exists('https://x/f', fakeServer({ etag: 'e', lastModified: 'l', body: '', status: 404 }).f)).toBe(false);
    expect(await exists('https://x/f', async () => { throw new TypeError('offline'); })).toBe(false);
  });
});

describe('downloadFresh (Sleeper’s players map: at most one fetch a day)', () => {
  it('skips the network while the copy is younger than maxAge, fetches when older, force always fetches', async () => {
    const srv = fakeServer({ etag: '', lastModified: '', body: '{"1":{}}' });
    const meta: MetaMap = {};
    const H = 3_600_000;
    await downloadFresh('https://x/p', dir, 'p.json', meta, 18 * H, { fetch: srv.f, now: at('2026-10-16T00:00:00Z') });
    expect(srv.calls).toHaveLength(1);
    const young = await downloadFresh('https://x/p', dir, 'p.json', meta, 18 * H, { fetch: srv.f, now: at('2026-10-16T10:00:00Z') });
    expect(young.fromCache).toBe(true);
    expect(srv.calls).toHaveLength(1);
    await downloadFresh('https://x/p', dir, 'p.json', meta, 18 * H, { fetch: srv.f, now: at('2026-10-17T00:00:00Z') });
    expect(srv.calls).toHaveLength(2);
    await downloadFresh('https://x/p', dir, 'p.json', meta, 18 * H, { fetch: srv.f, now: at('2026-10-17T00:01:00Z'), force: true });
    expect(srv.calls).toHaveLength(3);
  });
});
