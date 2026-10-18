import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores,
} from '../../test/fakes';
import type { FakeGameState } from '../../test/fakes';
import { renderApp } from '../../app/testUtils';
import { tickerItems } from './items';
import { buildView } from '../../engine/live';
import { ctx, games, snapshot } from '../../engine/live/test-helpers';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const pts = { t1qb: 10, t1rb: 5, t1wr: 6, t2qb: 4, t2rb: 3, t2wr: 2, t3qb: 5, t3rb: 5, t3wr: 5, t4qb: 12, t4rb: 12, t4wr: 12 };

function setup(o: { pts?: Record<string, number>; a?: FakeGameState; b?: FakeGameState; route?: string; linked?: typeof linked } = {}) {
  const state = { pts: o.pts ?? pts, a: o.a ?? 'live', b: o.b ?? 'final' };
  const sleeper = createFakeSleeper({
    live: {
      matchups: () => sampleLiveMatchups(state.pts),
      scores: () => sampleScores({ a: state.a, b: state.b, kickoff: state.a === 'pre' ? Date.now() + 60_000 : undefined }),
      projections: () => sampleLiveProjections(),
    },
  });
  const utils = renderApp({ linked: o.linked ?? linked, route: o.route ?? '/', sleeper, loadModel: sampleLoadModel(liveSampleModel) });
  return { state, ...utils };
}

const region = () => screen.findByRole('region', { name: 'league scores' });

function stubReducedMotion() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('reduce') && !q.includes('no-preference'), media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}

describe('ticker items', () => {
  it('make one item per matchup with the favorite’s chance, the left count and the lead', () => {
    const view = buildView(ctx(), snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, games('live', 0.5)));
    const items = tickerItems(view);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ mine: true, left: 'icemen', right: 'killa k', leftScore: '21.0', rightScore: '9.0', lead: 'left', fav: 'left', note: '6 left', projected: false });
    expect(items[0]!.pct).toMatch(/^\d+%$/);
    expect(items[0]!.label).toMatch(/icemen 21.0, killa k 9.0, icemen \d+% to win, 6 starters left/);
  });

  it('show projections before anyone plays and the result when it is over', () => {
    const pre = tickerItems(buildView(ctx(), snapshot({}, games('pre'))));
    expect(pre[0]).toMatchObject({ projected: true, note: 'projected', leftScore: '47.0', rightScore: '46.0' });
    const done = tickerItems(buildView(ctx(), snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, games('final'))));
    expect(done[0]).toMatchObject({ note: 'final', pct: null });
    expect(done[0]!.label).toContain('icemen won');
  });
});

describe('the ticker bar', () => {
  it('sits on every page with my matchup first and highlighted, each item linking to game day', async () => {
    setup();
    const bar = await region();
    const links = within(bar).getAllByRole('link');
    expect(links).toHaveLength(2);
    // the visible text is the name (plus a trailing hidden note), so voice control can say what it sees
    expect(links[0]).toHaveAccessibleName(/Sunday Scaries 21\.0 – 9\.0 Reed Between the Lines 6 left ?, (Sunday Scaries|Reed Between the Lines) \d+% to win$/);
    expect(links[0]).not.toHaveAttribute('aria-label');
    expect(links[0]).not.toHaveAttribute('title');
    expect(links[0]).toHaveAttribute('data-mine', 'true');
    expect(links[0]).toHaveAttribute('href', '/gameday?m=1');
    expect(links[1]).toHaveAttribute('href', '/gameday?m=2');
    expect(links[1]).not.toHaveAttribute('data-mine');
    expect(within(bar).getAllByText('6 left')[0]).toBeInTheDocument();
    // NFL games ride at the end
    expect(within(bar).getAllByText(/n2 10 · n1 17 · q2 7:30/).length).toBeGreaterThan(0);
    expect(within(bar).getAllByText('live')[0]).toBeInTheDocument();
  });

  it('is on other pages too, but not on check in', async () => {
    const a = setup({ route: '/takes' });
    expect(await region()).toBeInTheDocument();
    a.unmount();
    cleanup();
    renderApp({ route: '/signin' });
    await screen.findByLabelText('Sleeper username');
    expect(screen.queryByRole('region', { name: 'league scores' })).not.toBeInTheDocument();
  });

  it('is simply absent when the league has no live source', async () => {
    renderApp({ linked, loadModel: sampleLoadModel(liveSampleModel) });
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(screen.queryByRole('region', { name: 'league scores' })).not.toBeInTheDocument();
  });

  it('shows projections before kickoff', async () => {
    setup({ pts: {}, a: 'pre', b: 'pre' });
    const bar = await region();
    expect(within(bar).getAllByText('projected').length).toBeGreaterThan(0);
    expect(within(bar).getAllByRole('link')[0]).toHaveAccessibleName(/Sunday Scaries 47\.0 – 46\.0 Reed Between the Lines projected/);
  });

  it('stops scrolling on hover and on focus', async () => {
    const { user } = setup();
    const bar = await region();
    expect(bar).toHaveAttribute('data-motion', 'ok');
    expect(bar).not.toHaveAttribute('data-held');
    await user.hover(bar);
    expect(bar).toHaveAttribute('data-held', 'true');
    await user.unhover(bar);
    expect(bar).not.toHaveAttribute('data-held');
    const first = within(bar).getAllByRole('link')[0]!;
    await user.tab(); // the skip link
    await user.tab();
    expect(first).toHaveFocus();
    expect(bar).toHaveAttribute('data-held', 'true');
    await user.tab({ shift: true });
    expect(bar).not.toHaveAttribute('data-held');
  });

  it('is a plain strip with one copy of the list under reduced motion', async () => {
    stubReducedMotion();
    setup();
    const bar = await region();
    expect(bar).toHaveAttribute('data-motion', 'reduced');
    expect(bar.querySelectorAll('.tk-half')).toHaveLength(1);
    expect(within(bar).getAllByRole('link')).toHaveLength(2);
  });

  it('keeps two copies for a seamless loop otherwise, and hides the copy from screen readers', async () => {
    setup();
    const bar = await region();
    const halves = bar.querySelectorAll('.tk-half');
    expect(halves).toHaveLength(2);
    expect(halves[1]).toHaveAttribute('aria-hidden', 'true');
  });

  it('collapses to a slim "show scores" button, remembers it, and expands again', async () => {
    const { user, unmount } = setup();
    const bar = await region();
    await user.click(within(bar).getByRole('button', { name: 'hide scores' }));
    expect(within(bar).queryAllByRole('link')).toHaveLength(0);
    const show = within(bar).getByRole('button', { name: /show scores/ });
    expect(window.localStorage.getItem('wr.ticker.v1')).toBe('collapsed');
    expect(document.querySelector('.shell')).toHaveAttribute('data-ticker', 'collapsed');
    unmount();
    cleanup();
    // a new visit starts folded
    setup();
    const again = await region();
    expect(await within(again).findByRole('button', { name: /show scores/ })).toBeInTheDocument();
    await user.click(within(again).getByRole('button', { name: /show scores/ }));
    expect(within(again).getAllByRole('link')).toHaveLength(2);
    expect(window.localStorage.getItem('wr.ticker.v1')).toBe('open');
    expect(show).toBeTruthy();
  });

  it('announces only my own score changes, politely', async () => {
    const { state, user } = setup({ route: '/gameday' });
    const bar = await region();
    const live = bar.querySelector('[aria-live="polite"]')!;
    expect(live).toHaveTextContent('');
    // somebody else's player scores: silence
    state.pts = { ...pts, t4qb: 20 };
    await user.click(await screen.findByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(within(bar).getAllByRole('link')[1]).toHaveAccessibleName(/Fourth and Long|Hail Mary Club 28\.0|28\.0/));
    expect(live).toHaveTextContent('');
    // mine does
    state.pts = { ...pts, t4qb: 20, t1qb: 16.4 };
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(live).toHaveTextContent('Sunday Scaries 27.4, Reed Between the Lines 9.0'));
  });

  it('opens game day focused on the matchup you click', async () => {
    const { user } = setup({ route: '/takes' });
    const bar = await region();
    await user.click(within(bar).getAllByRole('link')[1]!);
    await screen.findByRole('heading', { level: 2, name: 'the main event' });
    expect(await screen.findByRole('button', { name: 'back to my matchup' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'scoreboard' })).not.toHaveTextContent('Sunday Scaries');
  });
});
