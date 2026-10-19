import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Matchup, SleeperLeague } from '../../data';
import { savePrefs } from '../../app/prefs';
import { renderApp } from '../../app/testUtils';
import {
  createFakeAccountStore, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleKeeperLeague, sampleLeague, sampleLoadModel, sampleModel, sampleScores,
} from '../../test/fakes';

afterEach(() => { cleanup(); window.localStorage.clear(); });
beforeEach(() => { savePrefs({ smartNav: false }); });

const row = (rid: number, mid: number, points: number, starters: string[] = []): Matchup => ({ roster_id: rid, matchup_id: mid, points, starters });
const WEEK: Record<string, Matchup[]> = {
  L1: [row(1, 1, 95.5, ['t1qb']), row(2, 1, 70.2, ['t2qb']), row(3, 2, 0), row(4, 2, 0), row(5, 3, 0), row(6, 3, 0)],
  L2: [row(1, 1, 0, ['t1qb']), row(3, 1, 0, ['t2qb']), row(2, 2, 0), row(4, 2, 0), row(5, 3, 0), row(6, 3, 0)],
};

function sleeperFor(over: Partial<Record<string, SleeperLeague>> = {}) {
  const l1 = over.L1 ?? sampleLeague, l2 = over.L2 ?? sampleKeeperLeague;
  const seasons = {
    L1: { league: l1, rosters: sampleBundle(l1).rosters, users: sampleBundle(l1).users },
    L2: { league: l2, rosters: sampleBundle(l2).rosters, users: sampleBundle(l2).users },
  };
  const s = createFakeSleeper({
    seasons,
    live: {
      matchups: () => [], scores: () => sampleScores({ a: 'pre', b: 'pre', kickoff: Date.now() + 3_600_000 }),
      projections: () => [
        { player_id: 't1qb', stats: { pts_ppr: 20 } }, { player_id: 't2qb', stats: { pts_ppr: 18 } },
      ] as never,
    },
  });
  s.liveMatchups = vi.fn(async (id: string) => ({ data: WEEK[id] ?? [], asOf: 1, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 })) as never;
  return s;
}

const withOdds = sampleLoadModel(sampleModel);
const api = () => createFakeApi({ bundles: { L1: sampleBundle(sampleLeague), L2: sampleBundle(sampleKeeperLeague) } });
const two = (): ReturnType<typeof sampleAccount>[] => [
  sampleAccount({ leagueIds: ['L1', 'L2'] }),
  sampleAccount({ userId: 'u2', username: 'rileyreed', displayName: 'Riley Reed', leagueIds: ['L2'], activeLeagueId: 'L2' }),
];

describe('all leagues', () => {
  it('shows one card for every followed league across every linked account, each with its account', async () => {
    renderApp({ linked: two(), sleeper: sleeperFor(), api: api(), loadModel: withOdds, route: '/leagues' });
    await screen.findByRole('heading', { level: 1, name: 'all leagues' });
    const list = await screen.findByRole('list', { name: 'Followed leagues' });
    await waitFor(() => expect(within(list).getAllByRole('listitem').every((li) => li.getAttribute('data-state') === 'done')).toBe(true));
    const cards = within(list).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.querySelector('.micro')!.textContent)).toEqual([
      expect.stringContaining('@sampleuser'), expect.stringContaining('@sampleuser'), expect.stringContaining('@rileyreed'),
    ]);
    // Sam in Sample League: 4-2, second of six, in a playoff spot, with the live score and the projection
    const sam = cards[0]!;
    expect(sam).toHaveTextContent('Sample League');
    expect(sam).toHaveTextContent('4–2');
    expect(sam).toHaveTextContent('2nd of 6');
    // the league the app has a model of shows the model's odds; the others show where the standings put you
    expect(sam).toHaveTextContent(/\d+% playoff odds/);
    expect(cards[1]).toHaveTextContent('in a playoff spot, 2 wins clear');
    expect(sam).toHaveTextContent('95.5');
    expect(sam).toHaveTextContent('70.2');
    expect(sam).toHaveTextContent('wk 6');
    expect(sam).toHaveTextContent('following now');
    // Riley is roster 2 in the keeper league: 5-1, first
    expect(cards[2]).toHaveTextContent('5–1');
    expect(cards[2]).toHaveTextContent('1st of 6');
  });

  it('shows a projection beside the score before kickoff', async () => {
    renderApp({ linked: two(), sleeper: sleeperFor(), api: api(), loadModel: withOdds, route: '/leagues' });
    const list = await screen.findByRole('list', { name: 'Followed leagues' });
    // the second card: Sam's matchup in the keeper league has not started, so it reads 0.0 against a 20.0 projection
    await waitFor(() => expect(within(within(list).getAllByRole('listitem')[1]!).getByRole('group', { name: 'week 6 matchup' })).toHaveTextContent('0.0 / 20.0'));
  });

  it('loads one league at a time, through the shared client', async () => {
    const s = sleeperFor();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const real = vi.mocked(s.rosters).getMockImplementation()!;
    s.rosters = vi.fn(async (id: string) => { if (id === 'L1') await gate; return real(id); }) as never;
    renderApp({ linked: two(), sleeper: s, api: api(), route: '/leagues' });
    await screen.findByRole('list', { name: 'Followed leagues' });
    await waitFor(() => expect(s.rosters).toHaveBeenCalledWith('L1'));
    // the first league is still loading: the others have not been asked for
    expect(vi.mocked(s.rosters).mock.calls.filter((c) => c[0] === 'L2')).toHaveLength(0);
    release();
    await waitFor(() => expect(vi.mocked(s.rosters).mock.calls.some((c) => c[0] === 'L2')).toBe(true));
    // and no model is built for any of them: no player projections per league, one file for the week
    await waitFor(() => expect(s.projections).toHaveBeenCalled());
    // (the live poller asks for its own copy with the model's positions)
    expect(vi.mocked(s.projections).mock.calls.filter((c) => c.length === 2)).toHaveLength(1);
  });

  it('opens a league\'s huddle and makes it the one being followed, on the account that follows it', async () => {
    const accounts = createFakeAccountStore(two());
    const { user } = renderApp({ accounts, sleeper: sleeperFor(), api: api(), route: '/leagues' });
    const riley = await screen.findByRole('button', { name: 'open Half Point Keepers for Riley Reed' });
    await user.click(riley);
    expect(accounts.setActive).toHaveBeenCalledWith('u2');
    expect(accounts.active()!.userId).toBe('u2');
    expect(await screen.findByRole('heading', { level: 1, name: 'huddle' })).toBeInTheDocument();
  });

  it('switches the league within the same account', async () => {
    const accounts = createFakeAccountStore(two());
    const { user } = renderApp({ accounts, sleeper: sleeperFor(), api: api(), route: '/leagues' });
    const keepers = await screen.findAllByRole('button', { name: /open Half Point Keepers for Sam Sample/ });
    await user.click(keepers[0]!);
    expect(accounts.list().find((a) => a.userId === 'u1')!.activeLeagueId).toBe('L2');
    expect(accounts.setActive).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { level: 1, name: 'huddle' })).toBeInTheDocument();
  });

  it('with one league, says so gently and offers to follow another', async () => {
    renderApp({ linked: [sampleAccount()], sleeper: sleeperFor(), api: api(), route: '/leagues' });
    expect(await screen.findByText(/you follow one league, so there is only one card/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'follow another league' });
    expect(link).toHaveAttribute('href', '/signin');
  });

  it('with no leagues followed, points to check in', async () => {
    renderApp({ linked: [sampleAccount({ leagueIds: [], activeLeagueId: null })], sleeper: sleeperFor(), api: api(), route: '/leagues' });
    expect(await screen.findByRole('link', { name: 'check in to follow your leagues' })).toHaveAttribute('href', '/signin');
  });

  it('keeps going when one league cannot be loaded, and says which', async () => {
    const s = sleeperFor();
    const real = vi.mocked(s.rosters).getMockImplementation()!;
    s.rosters = vi.fn(async (id: string) => { if (id === 'L2') throw new Error('keeper league is down'); return real(id); }) as never;
    renderApp({ linked: [sampleAccount({ leagueIds: ['L2', 'L1'] })], sleeper: s, api: api(), route: '/leagues' });
    expect(await screen.findByText(/could not load this league\. keeper league is down/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Followed leagues' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('4–2'));
  });

  it('shows a finished season without a matchup', async () => {
    const done = { ...sampleLeague, status: 'complete' as const };
    renderApp({ linked: [sampleAccount()], sleeper: sleeperFor({ L1: done }), api: api(), route: '/leagues' });
    const card = (await screen.findAllByRole('listitem')).find((li) => li.textContent?.includes('Sample League'))!;
    await waitFor(() => expect(card).toHaveTextContent('2026 is over'));
    expect(within(card).queryByRole('group', { name: /matchup/ })).not.toBeInTheDocument();
  });

  it('counts the leagues, the playoff spots and the matchups you are winning in the headline', async () => {
    renderApp({ linked: two(), sleeper: sleeperFor(), api: api(), loadModel: withOdds, route: '/leagues' });
    const strip = await screen.findByRole('group', { name: 'your leagues' });
    expect(within(strip).getByText('leagues').closest('.kpi')).toHaveTextContent('3');
    await waitFor(() => expect(within(strip).getByText('winning right now').closest('.kpi')).toHaveTextContent('1'));
    expect(within(strip).getByText('in a playoff spot').closest('.kpi')).toHaveTextContent('3');
  });
});
