import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores,
} from '../test/fakes';
import type { FakeGameState } from '../test/fakes';
import { renderApp } from './testUtils';

afterEach(cleanup);

const linked = [sampleAccount()];

function withGames(a: FakeGameState, b: FakeGameState) {
  const sleeper = createFakeSleeper({
    live: { matchups: () => sampleLiveMatchups({ t1qb: 3 }), scores: () => sampleScores({ a, b, kickoff: a === 'pre' ? Date.now() + 60_000 : undefined }), projections: () => sampleLiveProjections() },
  });
  return renderApp({ linked, sleeper, loadModel: sampleLoadModel(liveSampleModel) });
}

describe('grouped navigation', () => {
  it('has four labelled groups and the two quiet pages at the bottom', async () => {
    renderApp({ linked });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const groups: Record<string, string[]> = {
      'this week': ['huddle', 'game day', 'locker room'],
      league: ['playoff picture', 'hot takes'],
      moves: ['waiver wire', 'trade block'],
      players: ['scouting report', 'draft room'],
    };
    for (const [label, links] of Object.entries(groups)) {
      const g = within(nav).getByRole('group', { name: label });
      expect(within(g).getAllByRole('link').map((a) => a.textContent)).toEqual(links);
      expect(within(g).getByText(label)).toHaveClass('nav-label');
    }
    const ref = screen.getByRole('navigation', { name: 'Reference' });
    expect(within(ref).getAllByRole('link').map((a) => a.textContent)).toEqual(['front office', 'under the hood']);
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

  it('names the current page on the phone menu button', async () => {
    renderApp({ linked, route: '/gameday' });
    expect(await screen.findByRole('button', { name: 'menu, you are on game day' })).toBeInTheDocument();
  });
});
