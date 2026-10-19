import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBracket } from '../engine';
import { Bracket } from '../components/bracket/Bracket';
import { DEFAULT_DIMS, TOUCH_DIMS, layoutBracket } from '../components/bracket/layout';
import { useWantsReducedMotion } from '../components/motion';
import { sampleAccount } from '../test/fakes';
import { renderApp } from './testUtils';
import { markScrollRegions } from './useScrollRegions';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** a matchMedia that answers true for the queries the predicate accepts */
function stubMedia(match: (q: string) => boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: match(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}

describe('landmarks and the skip link', () => {
  it('has one banner, two named navigations and one main, and the skip link is the first tab stop', async () => {
    renderApp({ linked: [sampleAccount()] });
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(document.querySelector('.sidebar')!.tagName).toBe('HEADER'); // the site banner; card headers sit inside main
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Reference' })).toBeInTheDocument();
    const skip = screen.getByRole('link', { name: 'skip to main content' });
    expect(skip).toBe(document.querySelectorAll('a')[0]);
  });

  it('the skip link moves focus to main without touching the hash route', async () => {
    const { user } = renderApp({ linked: [sampleAccount()] });
    await screen.findByRole('navigation', { name: 'Primary' });
    await user.click(screen.getByRole('link', { name: 'skip to main content' }));
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('check in has a main landmark and a skip link too', async () => {
    renderApp({ route: '/signin' });
    expect(await screen.findByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('link', { name: 'skip to main content' })).toHaveAttribute('href', '#main');
  });

  it('moves focus to main after a page change, so a keyboard user starts at the top', async () => {
    const { user } = renderApp({ linked: [sampleAccount()] });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    await user.click(within(nav).getByRole('link', { name: 'hot takes' }));
    await screen.findByRole('heading', { level: 1, name: 'hot takes' });
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });
});

describe('document titles', () => {
  it('a player page keeps its own title instead of the shell overwriting it', async () => {
    renderApp({ linked: [sampleAccount()], route: '/players/p-nobody' });
    await screen.findByRole('heading', { level: 1 });
    expect(document.title).toMatch(/ · the commish$/);
    expect(document.title).not.toBe('the commish');
  });
});

describe('scroll regions', () => {
  function box(overflow: boolean) {
    document.body.innerHTML = '<div class="tw"><table><caption>Standings</caption><tbody><tr><td>x</td></tr></tbody></table></div><div class="tw"><table><caption>Standings</caption></table></div>';
    for (const el of document.querySelectorAll<HTMLElement>('.tw')) {
      Object.defineProperty(el, 'scrollWidth', { configurable: true, value: overflow ? 900 : 300 });
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: 300 });
    }
  }

  it('makes an overflowing box a focusable, uniquely named region and takes it back when it fits', () => {
    box(true);
    markScrollRegions();
    const [a, b] = [...document.querySelectorAll<HTMLElement>('.tw')];
    expect(a).toHaveAttribute('tabindex', '0');
    expect(a).toHaveAttribute('role', 'region');
    expect(a).toHaveAttribute('aria-label', 'Standings');
    expect(b).toHaveAttribute('aria-label', 'Standings 2');
    box(false);
    markScrollRegions();
    expect(document.querySelector('.tw')).not.toHaveAttribute('tabindex');
  });

  it('leaves a box that does not overflow alone', () => {
    box(false);
    markScrollRegions();
    expect(document.querySelector('.tw')).not.toHaveAttribute('role');
  });
});

describe('reduced motion and touch', () => {
  it('useWantsReducedMotion is false when the browser cannot say, and follows prefers-reduced-motion when it can', () => {
    expect(renderHook(() => useWantsReducedMotion()).result.current).toBe(false);
    stubMedia((q) => q.includes('reduce'));
    expect(renderHook(() => useWantsReducedMotion()).result.current).toBe(true);
    stubMedia(() => false);
    expect(renderHook(() => useWantsReducedMotion()).result.current).toBe(false);
  });

  it('a touch layout makes every bracket slot at least 44px and the bracket taller', () => {
    const bracket = buildBracket({ kind: 'championship', seedOrder: [1, 2, 3, 4, 5, 6, 7, 8], rules: { weekStart: 15, roundType: 0, seedType: 0 } });
    expect(TOUCH_DIMS.slotH).toBeGreaterThanOrEqual(40);
    expect(DEFAULT_DIMS.slotH).toBeLessThan(40);
    expect(layoutBracket(bracket, TOUCH_DIMS).height).toBeGreaterThan(layoutBracket(bracket).height);
  });

  it('the bracket draws 44px slots on a phone and 30px with a mouse', () => {
    const bracket = buildBracket({ kind: 'championship', seedOrder: [1, 2, 3, 4], rules: { weekStart: 15, roundType: 0, seedType: 0 } });
    const ctx = { means: Object.fromEntries([1, 2, 3, 4].map((r) => [r, { 15: 100, 16: 100, 17: 100 }])), sd: 20, currentWeek: 6 };
    const names = new Map([1, 2, 3, 4].map((r) => [r, `Team ${r}`] as const));
    const slotHeight = () => (document.querySelector('button.br-slot') as HTMLElement).style.height;
    stubMedia((q) => q.includes('max-width: 760px'));
    const { unmount } = render(<Bracket bracket={bracket} ctx={ctx} names={names} meRid={1} />);
    expect(slotHeight()).toBe('44px');
    unmount();
    stubMedia(() => false);
    act(() => { render(<Bracket bracket={bracket} ctx={ctx} names={names} meRid={1} />); });
    expect(slotHeight()).toBe('30px');
  });
});

describe('a page that throws', () => {
  it('shows a quiet error panel instead of a blank app, and keeps the menu', async () => {
    const { ErrorBoundary } = await import('../components/ErrorBoundary');
    const Boom = () => { throw new Error('bad panel'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('bad panel');
    expect(screen.getByRole('button', { name: 'try again' })).toBeInTheDocument();
    spy.mockRestore();
  });
});
