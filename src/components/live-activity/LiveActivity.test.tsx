import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MomentsContext } from '../../app/moments/momentsContext';
import type { MomentsValue } from '../../app/moments/momentsContext';
import { resetNowOverride } from '../../app/moments/nowOverride';
import type { Moment } from '../../engine/moments';
import { LiveActivity } from './LiveActivity';

const H = 3_600_000, MIN = 60_000;
const NOW = new Date(2026, 9, 22, 17, 0, 0).getTime();

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetNowOverride();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

const kickoff = (over: Partial<Moment> = {}): Moment => ({
  id: 'game-day', kind: 'game-day', priority: 88, title: 'game day starts tonight at 7:15 pm', detail: '2 of your 6 starters play thursday · your lineup is optimal',
  action: { label: 'check your lineup', to: '/team' }, countdownTo: NOW + H + 42 * MIN + 10_000, label: 'kickoff', precise: true, pages: ['team'], ...over,
});
const waivers = (over: Partial<Moment> = {}): Moment => ({
  id: 'waivers-tonight', kind: 'waivers-tonight', priority: 86, title: 'waivers process tonight at 2:00 am',
  detail: 'your top add is kyler murray (+19.0 lineup lift), bid $76', action: { label: 'open the waiver wire', to: '/waivers' },
  countdownTo: NOW + 3 * H + 12 * MIN, label: 'waivers', pages: ['waivers'], ...over,
});
const live = (bar = 0.8, over: Partial<Moment> = {}): Moment => ({
  id: 'live-matchup', kind: 'live-matchup', priority: 92, live: true, title: 'icemen leads killa k im gay 95.0 to 58.8', detail: '80% to win · 3 of your starters left, 1 of theirs',
  action: { label: 'open game day', to: '/gameday' }, pill: { text: `icemen 95.0 · 58.8 · ${Math.round(bar * 100)}%`, bar }, pages: ['gameday'], ...over,
});
const clock = (title = 'you’re on the clock'): Moment => ({
  id: 'draft-clock', kind: 'draft-clock', priority: 99, live: true, title, detail: 'your pick is up', action: { label: 'make your pick', to: '/draft?tab=clock' },
  pill: { text: title }, label: 'on the clock', pages: ['draft'],
});

function value(ongoing: Moment[], previewing = false): MomentsValue {
  return { ctx: null, moments: ongoing, ongoing, hero: null, now: NOW, previewing };
}
const tree = (v: MomentsValue) => (
  <MemoryRouter><MomentsContext.Provider value={v}><LiveActivity /></MomentsContext.Provider></MemoryRouter>
);

/** Only the date is fixed, so user events run on real timers; a describe that needs to step time calls `stepTime()`. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
function stepTime() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(NOW);
}

describe('live activity: collapsed', () => {
  it('shows nothing when nothing is ongoing', () => {
    const { container } = render(tree(value([])));
    expect(container).toBeEmptyDOMElement();
    expect(document.body.dataset.la).toBeUndefined();
  });

  it('is a button named for what it says: a countdown to waivers', () => {
    render(tree(value([waivers()])));
    const pill = screen.getByRole('button', { name: 'waivers in 3h 12m' });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(pill).toHaveAttribute('aria-controls');
    // the card is folded away
    expect(screen.queryByText('your top add is kyler murray (+19.0 lineup lift), bid $76')).not.toBeVisible();
    expect(document.body.dataset.la).toBe('on');
  });

  it('a live matchup reads “icemen 95.0 · 58.8 · 80%” with a small win bar', () => {
    render(tree(value([live()])));
    const pill = screen.getByRole('button', { name: 'icemen 95.0 · 58.8 · 80%' });
    expect(pill.querySelector('.la-bar i')).toHaveStyle({ width: '80%' });
  });

  it('a kickoff countdown shows seconds: kickoff in 1:42:10', () => {
    render(tree(value([kickoff()])));
    expect(screen.getByRole('button', { name: 'kickoff in 1:42:10' })).toBeInTheDocument();
  });

  it('draft: you’re on the clock', () => {
    render(tree(value([clock()])));
    expect(screen.getByRole('button', { name: 'you’re on the clock' })).toBeInTheDocument();
  });

  it('the best ongoing moment is the one shown', () => {
    render(tree(value([live(), waivers()])));
    expect(screen.getByRole('button', { name: /icemen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /waivers in/ })).not.toBeInTheDocument();
  });

  it('marks a preview clock so nobody mistakes it for the real thing', () => {
    render(tree(value([waivers()], true)));
    expect(screen.getByText('preview')).toBeInTheDocument();
  });
});

describe('live activity: expanded', () => {
  it('opens on a tap with the detail, the countdown and the action; a second tap folds it', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    const pill = screen.getByRole('button', { name: 'waivers in 3h 12m' });
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('waivers process tonight at 2:00 am')).toBeVisible();
    expect(screen.getByText('your top add is kyler murray (+19.0 lineup lift), bid $76')).toBeVisible();
    expect(screen.getByText(/^3h 12m to waivers · /)).toBeVisible();
    expect(screen.getByRole('link', { name: 'open the waiver wire →' })).toHaveAttribute('href', '/waivers');
    // it is a disclosure, not a dialog
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(pill);
    expect(pill).toHaveAttribute('aria-expanded', 'false');
  });

  it('folds with Escape and puts focus back on the pill', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    const pill = screen.getByRole('button', { name: /waivers in/ });
    await user.click(pill);
    screen.getByRole('link', { name: /open the waiver wire/ }).focus();
    await user.keyboard('{Escape}');
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(pill).toHaveFocus();
  });

  it('folds on a tap outside, but not on a tap inside', async () => {
    const user = userEvent.setup();
    render(<div><button type="button">elsewhere</button>{tree(value([waivers()]))}</div>);
    const pill = screen.getByRole('button', { name: /waivers in/ });
    await user.click(pill);
    await user.click(screen.getByText('your top add is kyler murray (+19.0 lineup lift), bid $76'));
    expect(pill).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(pill).toHaveAttribute('aria-expanded', 'false');
  });

  it('works from the keyboard: Enter opens it, and following the action folds it', async () => {
    const user = userEvent.setup();
    render(tree(value([waivers()])));
    await user.tab();
    expect(screen.getByRole('button', { name: /waivers in/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /waivers in/ })).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(screen.getByRole('link', { name: /open the waiver wire/ })).toHaveFocus();
    await user.click(screen.getByRole('link', { name: /open the waiver wire/ }));
    expect(screen.getByRole('button', { name: /waivers in/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('a live matchup’s card keeps its win bar and links to game day', async () => {
    const user = userEvent.setup();
    render(tree(value([live()])));
    await user.click(screen.getByRole('button', { name: /icemen/ }));
    expect(screen.getByText('icemen leads killa k im gay 95.0 to 58.8')).toBeVisible();
    expect(screen.getByRole('link', { name: 'open game day →' })).toHaveAttribute('href', '/gameday');
  });
});

describe('live activity: the clock', () => {
  beforeEach(stepTime);

  it('counts down each second', () => {
    render(tree(value([kickoff()])));
    expect(screen.getByRole('button', { name: 'kickoff in 1:42:10' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('button', { name: 'kickoff in 1:42:09' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(screen.getByRole('button', { name: 'kickoff in 1:41:10' })).toBeInTheDocument();
  });

  it('a minutes countdown keeps its units (waivers in 3h 12m, then 3h 11m)', () => {
    render(tree(value([waivers()])));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('button', { name: 'waivers in 3h 11m' })).toBeInTheDocument();
  });

  it('turns urgent in the last five minutes and says “now” at zero', () => {
    render(tree(value([kickoff({ countdownTo: NOW + 5 * MIN + 2000 })])));
    const root = document.querySelector('.la')!;
    expect(root).toHaveAttribute('data-urgency', 'soon');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(root).toHaveAttribute('data-urgency', 'urgent');
    act(() => { vi.advanceTimersByTime(5 * MIN); });
    expect(screen.getByRole('button', { name: 'kickoff now' })).toBeInTheDocument();
  });

  it('stops ticking while the page is hidden, and catches up when it is back', () => {
    render(tree(value([kickoff()])));
    expect(vi.getTimerCount()).toBe(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(30_000); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(vi.getTimerCount()).toBe(1);
    expect(screen.getByRole('button', { name: 'kickoff in 1:41:40' })).toBeInTheDocument();
  });

  it('stops its timer when it goes away', () => {
    const { unmount } = render(tree(value([kickoff()])));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('live activity: motion', () => {
  beforeEach(stepTime);

  const stubMotion = (reduce: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('no-preference') ? !reduce : q.includes('reduce') ? reduce : false, media: q,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));

  it('animates when the viewer has no preference', () => {
    stubMotion(false);
    render(tree(value([kickoff()])));
    expect(document.querySelector('.la')).toHaveAttribute('data-motion', 'ok');
  });

  it('with reduced motion nothing animates, and the countdown still updates', () => {
    stubMotion(true);
    render(tree(value([kickoff()])));
    expect(document.querySelector('.la')).toHaveAttribute('data-motion', 'reduced');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: 'kickoff in 1:42:08' })).toBeInTheDocument();
  });
});

describe('live activity: dismissing', () => {
  it('hides on the × and stays hidden for that moment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    expect(screen.queryByRole('button', { name: /waivers in/ })).not.toBeInTheDocument();
    expect(document.body.dataset.la).toBeUndefined();
    // the same moment, a minute later: still gone
    rerender(tree(value([waivers({ countdownTo: NOW + 3 * H })])));
    expect(screen.queryByRole('button', { name: /waivers in/ })).not.toBeInTheDocument();
  });

  it('comes back for the next moment', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(screen.getByRole('button', { name: 'dismiss waivers' }));
    rerender(tree(value([live()])));
    expect(screen.getByRole('button', { name: /icemen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dismiss live activity' })).toBeInTheDocument();
  });

  it('a new moment starts folded even if the last one was open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree(value([waivers()])));
    await user.click(screen.getByRole('button', { name: /waivers in/ }));
    rerender(tree(value([live()])));
    expect(screen.getByRole('button', { name: /icemen/ })).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('live activity: announcements', () => {
  beforeEach(stepTime);

  const status = () => document.querySelector('[role="status"]')!;

  it('a countdown is silent', () => {
    render(tree(value([waivers()])));
    expect(status()).toHaveTextContent('');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(status()).toHaveTextContent('');
  });

  it('announces when the draft clock reaches you, once', () => {
    const { rerender } = render(tree(value([clock('you’re on the clock in 1 pick')])));
    expect(status()).toHaveTextContent('');
    rerender(tree(value([clock()])));
    expect(status()).toHaveTextContent('you’re on the clock');
    expect(status()).toHaveAttribute('aria-live', 'polite');
  });

  it('announces a lead change in the live matchup, but not each score update', () => {
    const { rerender } = render(tree(value([live(0.8)])));
    rerender(tree(value([live(0.7, { pill: { text: 'icemen 96.0 · 58.8 · 70%', bar: 0.7 } })])));
    expect(status()).toHaveTextContent('');
    rerender(tree(value([live(0.4, { title: 'icemen trails killa k im gay 96.0 to 100.8', pill: { text: 'icemen 96.0 · 100.8 · 40%', bar: 0.4 } })])));
    expect(status()).toHaveTextContent('icemen trails killa k im gay 96.0 to 100.8. icemen 96.0 · 100.8 · 40%');
  });
});
