import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores,
} from '../test/fakes';
import type { FakeGameState } from '../test/fakes';
import { savePrefs } from './prefs';
import { renderApp } from './testUtils';

afterEach(() => { cleanup(); window.localStorage.clear(); });
// the order of the tabs follows the time of week; these tests are about the markup, so they use the fixed order (navOrder.test.ts has the rules)
beforeEach(() => { savePrefs({ smartNav: false }); });

const linked = [sampleAccount()];

function withGames(a: FakeGameState, b: FakeGameState) {
  const sleeper = createFakeSleeper({
    live: { matchups: () => sampleLiveMatchups({ t1qb: 3 }), scores: () => sampleScores({ a, b, kickoff: a === 'pre' ? Date.now() + 60_000 : undefined }), projections: () => sampleLiveProjections() },
  });
  return renderApp({ linked, sleeper, loadModel: sampleLoadModel(liveSampleModel) });
}

describe('section tabs', () => {
  it('has one row of tabs in order, front office with the account tools, and under the hood in the footer', async () => {
    renderApp({ linked });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'huddle', 'game day', 'locker room', 'playoff picture', 'around the league', 'hot takes', 'nfl', 'waiver wire', 'trade block', 'scouting report', 'draft room', 'record book',
    ]);
    expect(screen.getByRole('link', { name: 'front office' }).closest('.tn-tools')).not.toBeNull();
    const ref = screen.getByRole('navigation', { name: 'Reference' });
    expect(within(ref).getAllByRole('link').map((a) => a.textContent)).toEqual(['under the hood']);
    expect(within(nav).getByRole('link', { name: 'nfl' })).toHaveAttribute('href', '/nfl');
  });

  it('puts the record book before front office, and all leagues beside the league switcher (not among the tabs)', async () => {
    renderApp({ linked });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'record book' })).toHaveAttribute('href', '/almanac');
    expect(within(nav).queryByRole('link', { name: 'all leagues' })).not.toBeInTheDocument();
    const leagues = screen.getByRole('link', { name: 'all leagues' });
    expect(leagues).toHaveAttribute('href', '/leagues');
    expect(leagues.closest('.tn-tools')).not.toBeNull();
    expect(leagues.closest('.tn-tools')!.querySelector('.switcher')).not.toBeNull();
  });

  it('marks the open page on the record book and on all leagues', async () => {
    renderApp({ linked, route: '/almanac' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'record book' })).toHaveAttribute('aria-current', 'page');
    cleanup();
    renderApp({ linked, route: '/leagues' });
    expect(await screen.findByRole('link', { name: 'all leagues' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts the team name over the tabs as a banner, not a heading, with the league, week and record under it', async () => {
    renderApp({ linked, loadModel: sampleLoadModel(liveSampleModel) });
    const team = await screen.findByText('Sunday Scaries', { selector: '.tn-team' });
    expect(team.closest('header')).toBe(document.querySelector('.sidebar'));
    expect(screen.queryByRole('heading', { name: 'Sunday Scaries' })).not.toBeInTheDocument();
    expect(document.querySelector('.tn-ctx')).toHaveTextContent('Sample League · week 5 · you’re 3–1');
    // the page keeps exactly one h1
    await screen.findByRole('heading', { level: 1, name: 'huddle' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('keeps the active page marked with aria-current, game day included', async () => {
    renderApp({ linked, route: '/gameday' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'game day' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'huddle' })).not.toHaveAttribute('aria-current');
  });

  it('shows a live dot beside game day while games are on, and not otherwise', async () => {
    const a = withGames('live', 'final');
    const link = await screen.findByRole('link', { name: /^game day\s*\(live\)$/ }, { timeout: 4000 });
    expect(link.querySelector('.live-dot')).not.toBeNull();
    a.unmount();
    cleanup();
    withGames('pre', 'pre');
    await screen.findByRole('region', { name: 'league scores' }, { timeout: 4000 });
    const plain = screen.getByRole('link', { name: 'game day' });
    expect(plain.querySelector('.live-dot')).toBeNull();
  });

  it('shows the live dot beside the nfl tab too', async () => {
    withGames('live', 'final');
    const link = await screen.findByRole('link', { name: /^nfl\s*\(live\)$/ }, { timeout: 4000 });
    expect(link.querySelector('.live-dot')).not.toBeNull();
  });

});
