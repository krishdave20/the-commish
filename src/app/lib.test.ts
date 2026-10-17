import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatAsOf, formatBytes, sleeperPoints } from './format';
import { groupSlots, leagueTypeLabel, scoringLabel } from './league';
import { loadPrefs, PREFS_KEY, savePrefs } from './prefs';
import { checkForUpdate, compareVersions } from './version';
import { ResourceStore } from './resourceStore';
import type { Fetched } from '../data';

afterEach(() => window.localStorage.clear());

describe('format', () => {
  it('formats the as-of stamp', () => {
    expect(formatAsOf(new Date(2026, 9, 16, 16, 5).getTime())).toBe('Fri, Oct 16, 4:05 PM');
  });
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
  it('joins whole points and hundredths', () => {
    expect(sleeperPoints(1432, 28)).toBeCloseTo(1432.28);
    expect(sleeperPoints(undefined, undefined)).toBe(0);
  });
});

describe('league labels', () => {
  it('maps rec to PPR / Half / Std', () => {
    expect([1, 0.75, 0.5, 0.25, 0.1, 0, undefined].map(scoringLabel)).toEqual(['PPR', 'PPR', 'Half', 'Half', 'Std', 'Std', 'Std']);
  });
  it('maps type to Redraft / Keeper / Dynasty', () => {
    expect([0, 1, 2, undefined].map(leagueTypeLabel)).toEqual(['Redraft', 'Keeper', 'Dynasty', 'Redraft']);
  });
  it('groups roster slots', () => {
    expect(groupSlots(['QB', 'RB', 'RB', 'BN', 'BN'])).toEqual([['QB', 1], ['RB', 2], ['BN', 2]]);
  });
});

describe('prefs', () => {
  it('defaults, saves and survives bad JSON', () => {
    expect(loadPrefs()).toEqual({ autoRefresh: true, updateUrl: '', losers: 'toilet' });
    savePrefs({ updateUrl: 'x' });
    expect(loadPrefs()).toEqual({ autoRefresh: true, updateUrl: 'x', losers: 'toilet' });
    window.localStorage.setItem(PREFS_KEY, '{nope');
    expect(loadPrefs().autoRefresh).toBe(true);
  });
});

describe('version', () => {
  it('compares dotted versions', () => {
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('v1.10.0', '1.9.0')).toBe(1);
  });
  it('reports each outcome', async () => {
    const ok = (v: unknown) => (async () => new Response(JSON.stringify(v))) as unknown as typeof fetch;
    expect((await checkForUpdate('  ', '0.1.0')).message).toBe('No update URL set.');
    expect((await checkForUpdate('u', '0.1.0', ok({ version: '0.1.0' }))).kind).toBe('current');
    expect((await checkForUpdate('u', '0.1.0', ok({ version: '0.3.0' }))).kind).toBe('available');
    expect((await checkForUpdate('u', '0.1.0', ok({}))).kind).toBe('error');
    const down = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect((await checkForUpdate('u', '0.1.0', down)).message).toContain('offline');
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect((await checkForUpdate('u', '0.1.0', notFound)).message).toContain('404');
  });
});

describe('ResourceStore', () => {
  const res = (over: Partial<Fetched<number>> = {}): Fetched<number> => ({ data: 1, asOf: 5, fromCache: false, stale: false, ...over });

  it('shares one request per key and forces on demand', async () => {
    const store = new ResourceStore();
    const fetcher = vi.fn(async () => res());
    await Promise.all([store.load('k', fetcher), store.load('k', fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get<number>('k')).toMatchObject({ data: 1, asOf: 5, loading: false });
    await store.load('k', fetcher, true);
    expect(fetcher).toHaveBeenLastCalledWith({ force: true });
  });

  it('keeps old data when a fetch fails', async () => {
    const store = new ResourceStore();
    await store.load('k', async () => res());
    await store.load('k', async () => { throw new Error('boom'); }, true);
    expect(store.get<number>('k')).toMatchObject({ data: 1, error: 'boom', loading: false });
  });

  it('refreshes stale cached data once when auto-refresh is on', async () => {
    const store = new ResourceStore({ autoRefreshOnOpen: () => true });
    const fetcher = vi.fn(async (o?: { force?: boolean }) => (o?.force ? res({ asOf: 9 }) : res({ fromCache: true, stale: true })));
    await store.load('k', fetcher);
    await vi.waitFor(() => expect(store.get<number>('k')?.asOf).toBe(9));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not auto-refresh when switched off, and ignores results after clear()', async () => {
    const store = new ResourceStore({ autoRefreshOnOpen: () => false });
    const fetcher = vi.fn(async () => res({ fromCache: true, stale: true }));
    await store.load('k', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    let release: (v: Fetched<number>) => void = () => {};
    const slow = store.load('j', () => new Promise<Fetched<number>>((r) => { release = r; }));
    store.clear();
    release(res());
    await slow;
    expect(store.get('j')).toBeUndefined();
  });
});
