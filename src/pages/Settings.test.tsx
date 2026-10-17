import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderApp } from '../app/testUtils';
import { createFakeAccountStore, createFakeApi, sampleAccount, sampleHealth } from '../test/fakes';
import { PREFS_KEY } from '../app/prefs';
import { summarize } from '../app/health';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('Settings', () => {
  it('has the six sections and the attribution text', async () => {
    renderApp({ linked: [sampleAccount()], route: '/settings' });
    for (const name of ['Linked accounts', 'Refresh schedule', 'Cache', 'injury report', 'Attribution', 'About']) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText('Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.')).toBeInTheDocument();
    expect(screen.getByText('Values: FantasyCalc.')).toBeInTheDocument();
    expect(screen.getByText('League data: Sleeper public API.')).toBeInTheDocument();
    expect(screen.getByText('Free public data only. No AI or paid services at runtime.')).toBeInTheDocument();
    expect(screen.getByText('Refreshes on open when data is older than 6 hours; the players file at most once a day.')).toBeInTheDocument();
    expect(screen.getByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });

  it('saves Auto-refresh on open in localStorage', async () => {
    const { user } = renderApp({ linked: [sampleAccount()], route: '/settings' });
    const box = await screen.findByRole('checkbox', { name: 'Auto-refresh on open' });
    expect(box).toBeChecked();
    await user.click(box);
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY)!)).toMatchObject({ autoRefresh: false });
  });

  it('runs the health checks and shows the summary and rows', async () => {
    const { user, api } = renderApp({ linked: [sampleAccount()], route: '/settings' });
    await screen.findByText('Data as of Fri, Oct 16, 4:05 PM');
    await user.click(screen.getByRole('button', { name: 'Run checks' }));
    expect(await screen.findByText('3 healthy · 1 questionable · 1 out')).toBeInTheDocument();
    expect(api.healthChecks).toHaveBeenCalledWith({
      season: '2026', week: 6, username: 'sampleuser', userId: 'u1', leagueId: 'L1', draftId: 'L1-draft',
    });
    const table = screen.getByRole('table', { name: 'Endpoint checks' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + sampleHealth.length);
    const stats = within(table).getByText('Weekly stats').closest('tr')!;
    expect(within(stats).getByText('undocumented')).toBeInTheDocument();
    expect(within(stats).getByText('questionable')).toBeInTheDocument();
    expect(stats.querySelector('[data-level="warn"]')).not.toBeNull();
    expect(within(stats).getByText('340 ms')).toBeInTheDocument();
    const pbp = within(table).getByText('Play-by-play').closest('tr')!;
    expect(within(pbp).getByText('out')).toBeInTheDocument();
    expect(pbp.querySelector('[data-level="fail"]')).not.toBeNull();
    expect(within(pbp).getByText('documented')).toBeInTheDocument();
    expect(within(pbp).getByText('Blocked by CORS; play-by-play panels stay unavailable.')).toBeInTheDocument();
    expect(within(table).getAllByText('200')).toHaveLength(4);
  });

  it('lists cache entries and clears the cache only after confirming', async () => {
    const { user, api } = renderApp({ linked: [sampleAccount()], route: '/settings' });
    const table = await screen.findByRole('table', { name: 'Cached entries' });
    expect(within(table).getByText('sleeper:league:L1')).toBeInTheDocument();
    expect(within(table).getByText('1.2 MB')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear cache' }));
    expect(api.clearCache).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.clearCache).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear cache' }));
    await user.click(screen.getByRole('button', { name: 'Yes, clear it' }));
    expect(api.clearCache).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Nothing is cached yet.')).toBeInTheDocument();
  });

  it('Sign out removes the account, clears the cache and goes to sign-in', async () => {
    const accounts = createFakeAccountStore([sampleAccount()]);
    const api = createFakeApi();
    const { user } = renderApp({ api, accounts, route: '/settings' });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(api.clearCache).toHaveBeenCalledTimes(1);
    expect(accounts.remove).toHaveBeenCalledWith('u1');
    expect(accounts.list()).toEqual([]);
    expect(await screen.findByLabelText('Sleeper username')).toBeInTheDocument();
  });

  it('Sign out keeps the app open when other accounts remain', async () => {
    const accounts = createFakeAccountStore([sampleAccount(), sampleAccount({ userId: 'u2', username: 'two', displayName: 'Two' })]);
    const { user } = renderApp({ accounts, route: '/settings' });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(accounts.list().map((a) => a.userId)).toEqual(['u2']);
    expect(await screen.findByRole('heading', { level: 1, name: 'front office' })).toBeInTheDocument();
  });

  it('switches and removes linked accounts', async () => {
    const accounts = createFakeAccountStore([sampleAccount(), sampleAccount({ userId: 'u2', username: 'two', displayName: 'Two' })]);
    const { user } = renderApp({ accounts, route: '/settings' });
    await user.click(await screen.findByRole('button', { name: 'Switch to Two' }));
    expect(accounts.active()?.userId).toBe('u2');
    await user.click(screen.getByRole('button', { name: 'Remove Sam Sample' }));
    expect(accounts.list().map((a) => a.userId)).toEqual(['u2']);
  });

  describe('About', () => {
    it('shows the version and says when no update URL is set', async () => {
      const { user } = renderApp({ linked: [sampleAccount()], route: '/settings' });
      expect(await screen.findByText('0.1.0')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Check for updates' }));
      expect(await screen.findByText('No update URL set.')).toBeInTheDocument();
    });

    it('saves the URL and compares versions', async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version: '0.2.0' })));
      vi.stubGlobal('fetch', fetchMock);
      const { user } = renderApp({ linked: [sampleAccount()], route: '/settings' });
      await user.type(await screen.findByLabelText('Update file URL (version.json)'), 'https://example.test/version.json');
      expect(JSON.parse(window.localStorage.getItem(PREFS_KEY)!)).toMatchObject({ updateUrl: 'https://example.test/version.json' });
      await user.click(screen.getByRole('button', { name: 'Check for updates' }));
      expect(await screen.findByText('Update available: 0.2.0 (you have 0.1.0).')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith('https://example.test/version.json', { cache: 'no-store' });
    });
  });
});

describe('summarize', () => {
  it('counts levels', () => {
    expect(summarize(sampleHealth)).toBe('3 healthy · 1 questionable · 1 out');
    expect(summarize([])).toBe('0 healthy · 0 questionable · 0 out');
  });
});
