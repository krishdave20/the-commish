import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sampleAccount } from '../test/fakes';
import { NAV } from './routes';
import { renderApp } from './testUtils';

describe('app shell', () => {
  it('redirects to sign-in when no account is linked', async () => {
    renderApp({ route: '/' });
    expect(await screen.findByLabelText('Sleeper username')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('redirects every inner route to sign-in without an account', async () => {
    renderApp({ route: '/settings' });
    expect(await screen.findByLabelText('Sleeper username')).toBeInTheDocument();
  });

  it('shows all 9 nav routes in the sidebar', async () => {
    renderApp({ linked: [sampleAccount()] });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(9);
    expect(links.map((a) => a.textContent)).toEqual(NAV.map((n) => n.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/takes', '/players', '/team', '/race', '/waivers', '/trades', '/draft', '/settings']);
  });

  it('puts the wordmark and account switcher in the sidebar', async () => {
    renderApp({ linked: [sampleAccount()] });
    expect(await screen.findByText('Sam Sample')).toBeInTheDocument();
    expect(screen.getByText('the commish')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add an account' })).toHaveAttribute('href', '/signin');
    // the league select shows the league name once the bundle loads
    expect(await screen.findByRole('option', { name: 'Sample League' })).toBeInTheDocument();
  });

  it('marks the active nav link with aria-current and labels the league select', async () => {
    renderApp({ linked: [sampleAccount()], route: '/takes' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'hot takes' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'huddle' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('combobox', { name: 'League' })).toBeInTheDocument();
  });

  it('switches the followed league from the sidebar', async () => {
    const { accounts, user } = renderApp({ linked: [sampleAccount({ leagueIds: ['L1', 'L2'] })] });
    const select = await screen.findByLabelText('League');
    await screen.findByRole('option', { name: 'Half Point Keepers' });
    await user.selectOptions(select, 'L2');
    expect(accounts.active()?.activeLeagueId).toBe('L2');
    expect(await screen.findByRole('heading', { level: 2, name: 'Half Point Keepers' })).toBeInTheDocument();
  });

  it('renders a styled placeholder with the page header on the pages that come later', async () => {
    for (const [route, title, kicker, milestone] of [
      ['/takes', 'hot takes', 'rule-based reads from real numbers', 'Milestone 4'],
      ['/draft', 'draft room', 'rankings, mock drafts, live assistant', 'Milestone 5'],
    ] as const) {
      const { unmount } = renderApp({ linked: [sampleAccount()], route });
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByText(kicker)).toBeInTheDocument();
      expect(screen.getByText(milestone)).toBeInTheDocument();
      expect(await screen.findByText('Data as of Fri, Oct 16, 4:05 PM')).toBeInTheDocument();
      expect(document.title).toBe(`${title} · the commish`);
      unmount();
    }
  });

  it('sets the document title to the page name', async () => {
    renderApp({ linked: [sampleAccount()], route: '/team' });
    await screen.findByRole('heading', { level: 1, name: 'locker room' });
    expect(document.title).toBe('locker room · the commish');
  });

  it('has a small under the hood link outside the nine main items', async () => {
    renderApp({ linked: [sampleAccount()] });
    const ref = await screen.findByRole('navigation', { name: 'Reference' });
    expect(within(ref).getByRole('link', { name: 'under the hood' })).toHaveAttribute('href', '/method');
    expect(within(screen.getByRole('navigation', { name: 'Primary' })).queryByText('under the hood')).not.toBeInTheDocument();
  });
});
