import { describe, expect, it, vi } from 'vitest';
import { createNflverseSource, decodeRows } from './nflverseSource';
import { nvManifest } from '../test/fakes';

const json = (v: unknown) => new Response(JSON.stringify(v));

describe('nflverse source', () => {
  it('decodes columnar tables', () => {
    expect(decodeRows<{ a: number; b: string | null }>({ cols: ['a', 'b'], rows: [[1, 'x'], [2, null]] })).toEqual([{ a: 1, b: 'x' }, { a: 2, b: null }]);
  });

  it('loads and decodes every published file from the base url', async () => {
    const manifest = nvManifest({ generatedAt: '2026-10-16T09:20:00Z' });
    const files: Record<string, unknown> = {
      'data/nflverse/manifest.json': manifest,
      'data/nflverse/weekly_2026.json': { schema: 1, season: 2026, generatedAt: '', cols: ['pid', 'week', 'snap_pct'], rows: [['p1', 1, 0.5], ['p1', 2, 0.6]] },
      'data/nflverse/season_2026.json': { schema: 1, season: 2026, generatedAt: '', throughWeek: 6, cols: ['pid', 'games'], rows: [['p1', 2]] },
      'data/nflverse/coverage_2025.json': { schema: 1, season: 2025, generatedAt: '', isCurrent: false, routesDefinition: 'proxy', shells: { p1: {} }, teams: {}, cols: ['pid', 'routes'], rows: [['p1', 100]] },
      'data/nflverse/unmatched.json': { schema: 1, season: 2026, generatedAt: '', players: [{ key: 'k', name: 'N' }] },
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const f = files[String(url)];
      return f ? json(f) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const b = await createNflverseSource('data/nflverse', fetchImpl).load();
    expect(b.weekly).toHaveLength(2);
    expect(b.weekly[1]).toMatchObject({ pid: 'p1', week: 2, snap_pct: 0.6 });
    expect(b.season[0]).toMatchObject({ pid: 'p1', games: 2 });
    expect(b.coverage).toMatchObject({ season: 2025, isCurrent: false, routesDefinition: 'proxy' });
    expect(b.coverage!.rows[0]).toMatchObject({ pid: 'p1', routes: 100 });
    expect(b.unmatched).toHaveLength(1);
    expect(b.asOf).toBe(Date.parse('2026-10-16T09:20:00Z'));
  });

  it('copes with a missing coverage or unmatched file, but not a missing manifest', async () => {
    const manifest = nvManifest();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('manifest.json')) return json(manifest);
      if (u.includes('weekly')) return json({ cols: ['pid'], rows: [] });
      if (u.includes('season_')) return json({ cols: ['pid'], rows: [] });
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const b = await createNflverseSource('/d/', fetchImpl).load();
    expect(b.coverage).toBeNull();
    expect(b.unmatched).toEqual([]);
    const down = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(createNflverseSource('/d', down).load()).rejects.toThrow(/not published yet/);
  });
});
