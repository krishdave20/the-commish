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

  it('shows the 11 section tabs and the footer link', async () => {
    renderApp({ linked: [sampleAccount()] });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(11);
    expect(links.map((a) => a.textContent)).toEqual(NAV.map((n) => n.label));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/gameday', '/team', '/race', '/takes', '/nfl', '/waivers', '/trades', '/players', '/draft', '/settings']);
    const ref = within(screen.getByRole('navigation', { name: 'Reference' })).getAllByRole('link');
    expect(ref.map((a) => a.getAttribute('href'))).toEqual(['/method']);
  });

  it('puts the wordmark and account switcher in the header', async () => {
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
    const { accounts, user } = renderApp({ linked: [sampleAccount({ leagueIds: ['L1', 'L2'] })], route: '/settings' });
    const select = await screen.findByLabelText('League');
    await screen.findByRole('option', { name: 'Half Point Keepers' });
    await user.selectOptions(select, 'L2');
    expect(accounts.active()?.activeLeagueId).toBe('L2');
    // the league's rules (front office) now belong to the league just picked
    expect(await screen.findByText('Half Point Keepers', { selector: '.sum-hint' })).toBeInTheDocument();
  });

  it('gives the draft room its page header, kicker and document title (no placeholder is left)', async () => {
    renderApp({ linked: [sampleAccount()], route: '/draft' });
    expect(await screen.findByRole('heading', { level: 1, name: 'draft room' })).toBeInTheDocument();
    expect(await screen.findByText(/^rankings, mock drafts, live assistant/)).toBeInTheDocument();
    expect(await screen.findByText('Data as of Fri, Oct 16, 4:05 PM')).toBeInTheDocument();
    expect(screen.queryByText('Milestone 5')).not.toBeInTheDocument();
    expect(document.title).toBe('draft room · the commish');
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
