import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores,
} from '../../test/fakes';
import type { FakeGameState } from '../../test/fakes';
import { renderApp } from '../../app/testUtils';
import { nflItems, pinnedItem, tickerItems } from './items';
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
  it('pin my matchup with me on the left, and list the other matchups after it', () => {
    const view = buildView(ctx(), snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, games('live', 0.5)));
    const pin = pinnedItem(view)!;
    expect(pin).toMatchObject({ mine: true, left: 'icemen', right: 'killa k', leftScore: '21.0', rightScore: '9.0', lead: 'left', fav: 'left', note: '6 left', projected: false });
    expect(pin.pct).toMatch(/^\d+%$/);
    expect(pin.winLeft).toBeGreaterThan(0.5);
    expect(pin.label).toMatch(/icemen 21.0, killa k 9.0, icemen \d+% to win, 6 starters left/);
    // the rotation holds only the others
    expect(tickerItems(view).every((i) => !i.mine)).toBe(true);
    expect(tickerItems(view)).toHaveLength(view.matchups.length - 1);
  });

  it('shows projections before anyone plays and the result when it is over', () => {
    const pre = pinnedItem(buildView(ctx(), snapshot({}, games('pre'))))!;
    expect(pre).toMatchObject({ projected: true, note: 'projected', leftScore: '47.0', rightScore: '46.0' });
    const done = pinnedItem(buildView(ctx(), snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, games('final'))))!;
    expect(done).toMatchObject({ note: 'final', pct: null });
    expect(done.label).toContain('icemen won');
  });

  it('puts me on the left even when the engine lists me second', () => {
    const view = buildView(ctx(), snapshot({ q1: 10 }, games('live', 0.5)));
    const m = view.mine!;
    const swapped = { ...view, mine: { ...m, a: m.b, b: m.a, winA: 1 - m.winA, margin: -m.margin } };
    const pin = pinnedItem(swapped)!;
    expect(pin.left).toBe('icemen');
    expect(pin.winLeft).toBeCloseTo(m.winA);
  });
});

describe('nfl items', () => {
  const g = (id: string, state: 'pre' | 'live' | 'final', kickoff: number, extra: Partial<ReturnType<typeof games>[number]> = {}) =>
    ({ id, home: 'KC', away: 'LAC', kickoff, state, quarter: state === 'live' ? '2' : state === 'final' ? 'F' : '', clock: state === 'live' ? '7:30' : '', homeScore: state === 'pre' ? null : 19, awayScore: state === 'pre' ? null : 3, elapsed: 0.3, ...extra });
  it('puts live games first, then finals (latest first), then kickoffs to come (soonest first)', () => {
    const items = nflItems([
      g('a', 'pre', 3000, { home: 'GB', away: 'DAL' }), g('b', 'final', 1000), g('c', 'live', 2000, { home: 'SF', away: 'WAS' }),
      g('d', 'final', 1500, { home: 'DEN', away: 'LV' }), g('e', 'pre', 2500, { home: 'MIA', away: 'NE' }),
    ] as never);
    expect(items.map((i) => i.id)).toEqual(['c', 'd', 'b', 'e', 'a']);
    expect(items.map((i) => i.state)).toEqual(['live', 'final', 'final', 'pre', 'pre']);
    expect(items[0]).toMatchObject({ live: true, score: 'was 3 · sf 19', status: 'q2 7:30' });
    expect(items[0]!.label).toBe('live, San Francisco 49ers lead');
    expect(items[1]!.label).toBe('Denver Broncos won');
    expect(items[3]).toMatchObject({ score: 'ne at mia' });
  });
  it('marks games where I have starters and says so', () => {
    const [it] = nflItems([g('a', 'final', 1)] as never, new Map([['KC', 2]]));
    expect(it).toMatchObject({ mine: true });
    expect(it!.label).toBe('Kansas City Chiefs won, you have 2 starters');
  });
});

describe('the ticker bar', () => {
  it('pins my matchup first and highlighted, then the other matchups and the nfl games, each linking where it belongs', async () => {
    setup();
    const bar = await region();
    const links = within(bar).getAllByRole('link');
    expect(links).toHaveLength(4);
    // the visible text is the name (plus a trailing hidden note), so voice control can say what it sees
    expect(links[0]).toHaveAccessibleName(/^live Sunday Scaries 21\.0 9\.0 Reed Between the Lines · \d+% ?, (Sunday Scaries|Reed Between the Lines) \d+% to win$/);
    expect(links[0]).not.toHaveAttribute('aria-label');
    expect(links[0]).not.toHaveAttribute('title');
    expect(links[0]).toHaveClass('tk-pin');
    expect(links[0]).toHaveAttribute('href', '/gameday?m=1');
    expect(links[1]).toHaveAttribute('href', '/gameday?m=2');
    expect(links[1]).toHaveAccessibleName(/Fourth and Long|Hail Mary Club/);
    // the mini bar is decoration
    expect(links[0].querySelector('.tk-mini')).toHaveAttribute('aria-hidden', 'true');
    // the nfl games: live first, then the final; they open /nfl with that game's drawer
    expect(links[2]).toHaveAttribute('href', '/nfl?game=g1');
    expect(links[3]).toHaveAttribute('href', '/nfl?game=g2');
    expect(links[2]).toHaveAccessibleName(/^n2 10 · n1 17 · q2 7:30 ?, live, N1 lead, you have 3 starters$/i);
    expect(links[2]).not.toHaveAttribute('aria-label');
    expect(links[2]).toHaveAttribute('data-state', 'live');
    expect(links[3]).toHaveAttribute('data-state', 'final');
    expect(within(bar).getAllByText('q2 7:30')[0]).toHaveClass('tk-gstat');
  });

  it('splits the rotation into "your league" and "nfl", each a named list with a visible label, in that order and with a divider between', async () => {
    setup();
    const bar = await region();
    const mine = within(bar).getByRole('list', { name: 'your league scores' });
    const nfl = within(bar).getByRole('list', { name: 'nfl scores' });
    expect(mine).toHaveTextContent('your league');
    expect(nfl).toHaveTextContent('nfl');
    expect(within(mine).getAllByRole('link')).toHaveLength(1);
    expect(within(nfl).getAllByRole('link')).toHaveLength(2);
    // labels are visible text, in the rotation order: league, divider, nfl
    expect(within(mine).getByText('your league')).toHaveClass('tk-label');
    expect(within(nfl).getByText('nfl')).toHaveClass('tk-label');
    expect(mine.compareDocumentPosition(nfl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const split = bar.querySelector('.tk-half .tk-split')!;
    expect(mine.compareDocumentPosition(split) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(split.compareDocumentPosition(nfl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the pinned matchup comes before both
    expect(bar.querySelector('.tk-pin')!.compareDocumentPosition(mine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('repeats the split in the looped copy, so the labels never meet at the seam', async () => {
    setup();
    const bar = await region();
    const halves = bar.querySelectorAll('.tk-half');
    expect(halves).toHaveLength(2);
    for (const h of halves) {
      expect([...h.querySelectorAll('.tk-label')].map((l) => l.textContent)).toEqual(['your league', 'nfl']);
      // a divider between the segments, and another at the end of the copy, so the next copy starts clear of it
      expect(h.querySelectorAll('.tk-split')).toHaveLength(2);
      expect(h.lastElementChild).toHaveClass('tk-split');
    }
  });

  it('keeps the labels and the divider under reduced motion', async () => {
    stubReducedMotion();
    setup();
    const bar = await region();
    expect([...bar.querySelectorAll('.tk-label')].map((l) => l.textContent)).toEqual(['your league', 'nfl']);
    expect(bar.querySelectorAll('.tk-split').length).toBeGreaterThan(0);
    expect(within(bar).getByRole('list', { name: 'your league scores' })).toBeInTheDocument();
    expect(within(bar).getByRole('list', { name: 'nfl scores' })).toBeInTheDocument();
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
    expect(within(bar).getAllByRole('link')[0]).toHaveAccessibleName(/Sunday Scaries 47\.0 46\.0 Reed Between the Lines/);
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
    expect(within(bar).getAllByRole('link')).toHaveLength(4);
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
    expect(within(again).getAllByRole('link')).toHaveLength(4);
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
    await waitFor(() => expect(within(bar).getAllByRole('link')[1]).toHaveAccessibleName(/44\.0/));
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
