import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../app/testUtils';
import { createFakeApi, sampleAccount } from '../test/fakes';

describe('sign in', () => {
  it('is called check in', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'check in' })).toBeInTheDocument();
    expect(document.title).toBe('check in · war room');
  });

  it('says so when Sleeper has no such username', async () => {
    const { user, api } = renderApp();
    await user.type(await screen.findByLabelText('Sleeper username'), 'nobody');
    await user.click(screen.getByRole('button', { name: 'Find my leagues' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No Sleeper account named “nobody”.');
    expect(api.nflState).not.toHaveBeenCalled();
  });

  it('lists leagues with scoring and type, saves, and lands on Home with standings', async () => {
    const { user, api, accounts } = renderApp();
    await user.type(await screen.findByLabelText('Sleeper username'), 'SampleUser');
    await user.click(screen.getByRole('button', { name: 'Find my leagues' }));

    const first = await screen.findByRole('checkbox', { name: /Sample League/ });
    expect(screen.getByText('Found Sam Sample on Sleeper')).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
    expect(api.user).toHaveBeenCalledWith('SampleUser');
    expect(api.userLeagues).toHaveBeenCalledWith('u1', '2026');
    // in season: the previous season is not loaded
    expect(api.userLeagues).toHaveBeenCalledTimes(1);

    const row = first.closest('label')!;
    expect(row).toHaveTextContent('2026');
    expect(row).toHaveTextContent('In season');
    expect(row).toHaveTextContent('6 teams');
    expect(within(row).getByText('PPR')).toBeInTheDocument();
    expect(within(row).getByText('Redraft')).toBeInTheDocument();
    const keeper = screen.getByRole('checkbox', { name: /Half Point Keepers/ }).closest('label')!;
    expect(within(keeper).getByText('Half')).toBeInTheDocument();
    expect(within(keeper).getByText('Keeper')).toBeInTheDocument();

    // untick the second league, then save
    await user.click(screen.getByRole('checkbox', { name: /Half Point Keepers/ }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(accounts.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', username: 'sampleuser', displayName: 'Sam Sample', leagueIds: ['L1'], activeLeagueId: 'L1',
    }));
    expect(accounts.setActive).toHaveBeenCalledWith('u1');
    expect(await screen.findByRole('heading', { level: 1, name: 'huddle' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Sample League' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'League standings' })).toBeInTheDocument();
    expect(screen.getByText('Reed Between the Lines')).toBeInTheDocument();
  });

  it('also loads the previous season in the offseason', async () => {
    const api = createFakeApi({ nflState: { week: 1, season: '2026', season_type: 'off', league_season: '2026', previous_season: '2025' } });
    const { user } = renderApp({ api });
    await user.type(await screen.findByLabelText('Sleeper username'), 'sampleuser');
    await user.click(screen.getByRole('button', { name: 'Find my leagues' }));
    await screen.findByRole('checkbox', { name: /Sample League.*Dynasty/s });
    expect(api.userLeagues).toHaveBeenCalledWith('u1', '2026');
    expect(api.userLeagues).toHaveBeenCalledWith('u1', '2025');
    // the older league is listed but not ticked by default
    const rows = screen.getAllByRole('checkbox');
    expect(rows.filter((c) => (c as HTMLInputElement).checked)).toHaveLength(2);
    expect(rows).toHaveLength(3);
  });

  it('lists linked accounts with Switch and Remove', async () => {
    const other = sampleAccount({ userId: 'u2', username: 'second', displayName: 'Second Person' });
    const { user, accounts } = renderApp({ linked: [sampleAccount(), other], route: '/signin' });
    const list = await screen.findByRole('list', { name: 'Linked accounts' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await user.click(within(list).getByRole('button', { name: 'Remove Second Person' }));
    expect(accounts.remove).toHaveBeenCalledWith('u2');
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });

  it('switching to another linked account goes Home', async () => {
    const other = sampleAccount({ userId: 'u2', username: 'second', displayName: 'Second Person' });
    const { user, accounts } = renderApp({ linked: [sampleAccount(), other], route: '/signin' });
    await user.click(await screen.findByRole('button', { name: 'Switch to Second Person' }));
    expect(accounts.setActive).toHaveBeenCalledWith('u2');
    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });
});
