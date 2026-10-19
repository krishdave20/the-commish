import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from '../components/Drawer';
import { SortableTable } from '../components/SortableTable';
import { PageTabs } from '../components/PageTabs';
import type { Column } from '../components/useSort';
import { createFakeSleeper, liveSampleModel, sampleAccount, sampleLiveMatchups, sampleLiveProjections, sampleLoadModel, sampleScores } from '../test/fakes';
import { savePrefs } from './prefs';
import { renderApp } from './testUtils';

beforeEach(() => { savePrefs({ smartNav: false }); });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

/** A phone: the width query matches, nothing else does. */
function phone() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q === '(max-width: 760px)', media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}
const linked = [sampleAccount()];

describe('the bottom tab bar', () => {
  it('is not there on a wide screen, where the top tabs stay', async () => {
    renderApp({ linked });
    await screen.findByRole('navigation', { name: 'Primary' });
    expect(document.querySelector('.tabbar')).toBeNull();
    expect(document.querySelector('.sidebar .nav')).not.toBeNull();
  });

  it('is five slots on a phone: huddle, game day, locker room, playoffs and more, with the open page marked', async () => {
    phone();
    renderApp({ linked, route: '/team' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(nav).toHaveClass('tabbar');
    expect(within(nav).getAllByRole('link').map((a) => a.querySelector('.tb-label')!.textContent)).toEqual(['huddle', 'game day', 'locker room', 'playoffs']);
    // the short label shows; the full name is what a reader hears
    expect(within(nav).getByRole('link', { name: 'playoff picture' })).toHaveAttribute('href', '/race');
    expect(within(nav).getByRole('link', { name: 'locker room' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'huddle' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('button', { name: 'more' })).not.toHaveAttribute('data-active');
    expect(nav.querySelectorAll('svg')).toHaveLength(5);
    // the top tabs and the old menu button are gone
    expect(document.querySelector('.menu-btn')).toBeNull();
  });

  it('lights "more" when the open page is not one of the four', async () => {
    phone();
    renderApp({ linked, route: '/takes' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('button', { name: 'more' })).toHaveAttribute('data-active', 'true');
  });

  it('opens every section as a sheet from "more", marks the open page, and closes on Escape', async () => {
    phone();
    const { user } = renderApp({ linked, route: '/takes' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const more = within(nav).getByRole('button', { name: 'more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    const sheet = await screen.findByRole('dialog', { name: 'more' });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const all = within(within(sheet).getByRole('navigation', { name: 'All sections' }));
    expect(all.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'huddle', 'game day', 'locker room', 'playoff picture', 'hot takes', 'nfl', 'waiver wire', 'trade block', 'scouting report', 'draft room', 'front office', 'under the hood',
    ]);
    expect(all.getByRole('link', { name: 'hot takes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('sheet-handle')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(more);
  });

  it('closes the sheet when you pick a section', async () => {
    phone();
    const { user } = renderApp({ linked });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    await user.click(within(nav).getByRole('button', { name: 'more' }));
    const sheet = await screen.findByRole('dialog', { name: 'more' });
    await user.click(within(sheet).getByRole('link', { name: 'waiver wire' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'waiver wire' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts a live dot on game day while games are on, and not otherwise', async () => {
    phone();
    const sleeper = (a: 'live' | 'pre') => createFakeSleeper({
      live: { matchups: () => sampleLiveMatchups({ t1qb: 3 }), scores: () => sampleScores({ a, b: a === 'live' ? 'final' : 'pre', kickoff: a === 'pre' ? Date.now() + 60_000 : undefined }), projections: () => sampleLiveProjections() },
    });
    const first = renderApp({ linked, sleeper: sleeper('live'), loadModel: sampleLoadModel(liveSampleModel) });
    const link = await screen.findByRole('link', { name: /^game day\s*\(live\)$/ }, { timeout: 4000 });
    expect(link.querySelector('.live-dot')).not.toBeNull();
    first.unmount();
    cleanup();
    renderApp({ linked, sleeper: sleeper('pre'), loadModel: sampleLoadModel(liveSampleModel) });
    await screen.findByRole('region', { name: 'league scores' }, { timeout: 4000 });
    expect(screen.getByRole('link', { name: 'game day' }).querySelector('.live-dot')).toBeNull();
  });

  it('keeps the score ticker inside the sticky top bar, so it is one strip and not a third bar', async () => {
    phone();
    const sleeper = createFakeSleeper({
      live: { matchups: () => sampleLiveMatchups({ t1qb: 3 }), scores: () => sampleScores({ a: 'live', b: 'final' }), projections: () => sampleLiveProjections() },
    });
    renderApp({ linked, sleeper, loadModel: sampleLoadModel(liveSampleModel) });
    const scores = await screen.findByRole('region', { name: 'league scores' }, { timeout: 4000 });
    expect(scores.closest('header.sidebar')).not.toBeNull();
  });
});

describe('the large title', () => {
  const scrollTo = (y: number) => act(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
    window.dispatchEvent(new Event('scroll'));
  });

  it('shows the team name large at the top, then collapses into the bar once the page scrolls, and comes back', async () => {
    phone();
    renderApp({ linked, loadModel: sampleLoadModel(liveSampleModel) });
    await screen.findByText('Sunday Scaries', { selector: '.tn-team' });
    const header = document.querySelector('header.sidebar')!;
    expect(header).toHaveAttribute('data-collapsed', 'false');
    scrollTo(10);
    expect(header).toHaveAttribute('data-collapsed', 'false');
    scrollTo(120);
    expect(header).toHaveAttribute('data-collapsed', 'true');
    // a little hysteresis: still collapsed just above the line, open again near the top
    scrollTo(35);
    expect(header).toHaveAttribute('data-collapsed', 'true');
    scrollTo(0);
    expect(header).toHaveAttribute('data-collapsed', 'false');
  });

  it('the collapsed bar names the team and scrolls back to the top when tapped', async () => {
    phone();
    const spy = vi.fn();
    vi.stubGlobal('scrollTo', spy);
    renderApp({ linked, loadModel: sampleLoadModel(liveSampleModel) });
    await screen.findByText('Sunday Scaries', { selector: '.tn-team' });
    scrollTo(200);
    await userEvent.click(screen.getByRole('button', { name: /scroll to top,\s*Sunday Scaries/ }));
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});

describe('a drawer on a phone is a bottom sheet', () => {
  function sheet(onClose = vi.fn()) {
    render(<Drawer open onClose={onClose} title="team details">body text</Drawer>);
    return onClose;
  }
  const drag = (to: number, from = 0) => {
    const grip = screen.getByTestId('sheet-handle');
    fireEvent.pointerDown(grip, { clientY: from, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(grip, { clientY: to, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(grip, { clientY: to, pointerId: 1, pointerType: 'touch' });
  };

  it('has a drag handle on a phone, a modal dialog, and none of it on a wide screen', () => {
    phone();
    sheet();
    expect(screen.getByRole('dialog', { name: 'team details' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('sheet-handle')).toBeInTheDocument();
    cleanup();
    vi.unstubAllGlobals();
    sheet();
    expect(screen.queryByTestId('sheet-handle')).toBeNull();
  });

  it('closes on a swipe down, and springs back from a short pull', () => {
    phone();
    const onClose = sheet();
    drag(30);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').style.transform).toBe('none');
    drag(160);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and on a tap on the backdrop, and keeps Tab inside', async () => {
    phone();
    const onClose = sheet();
    const user = userEvent.setup();
    await user.keyboard('{Tab}{Tab}{Tab}');
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('tables on a phone', () => {
  interface Row { id: number; name: string; lift: number; bid: number; drop: string }
  const rows: Row[] = [
    { id: 1, name: 'ada', lift: 4.2, bid: 12, drop: 'bob' },
    { id: 2, name: 'cy', lift: 1.1, bid: 3, drop: 'dee' },
  ];
  const columns: Column<Row>[] = [
    { key: 'name', header: 'player', essential: true, value: (r) => r.name },
    { key: 'lift', header: 'lift', essential: true, numeric: true, value: (r) => r.lift },
    { key: 'bid', header: 'bid', numeric: true, value: (r) => r.bid, render: (r) => `$${r.bid}` },
    { key: 'drop', header: 'drop', value: (r) => r.drop },
  ];
  const table = (open?: (r: Row) => void) => render(<SortableTable caption="Wire" columns={columns} rows={rows} rowKey={(r) => r.id} onRowActivate={open} />);

  it('keeps the essential columns in the row and opens the rest under it on a tap', async () => {
    phone();
    const user = userEvent.setup();
    table();
    const t = screen.getByRole('table', { name: 'Wire' });
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['player', 'lift', 'details']);
    expect(within(t).queryByText('$12')).toBeNull();
    await user.click(within(t).getByText('ada'));
    expect(within(t).getByText('$12')).toBeInTheDocument();
    expect(within(t).getByText('bob')).toBeInTheDocument();
    expect(within(t).getByRole('button', { name: 'hide details for ada' })).toHaveAttribute('aria-expanded', 'true');
    // the other row stays closed; the chevron closes this one
    expect(within(t).queryByText('dee')).toBeNull();
    await user.click(within(t).getByRole('button', { name: 'hide details for ada' }));
    expect(within(t).queryByText('bob')).toBeNull();
  });

  it('the chevron button works by keyboard and the row\'s own action moves into the details', async () => {
    phone();
    const open = vi.fn();
    const user = userEvent.setup();
    table(open);
    const t = screen.getByRole('table', { name: 'Wire' });
    await user.click(within(t).getByText('cy'));
    expect(open).not.toHaveBeenCalled();
    await user.click(within(t).getByRole('button', { name: 'open cy' }));
    expect(open).toHaveBeenCalledWith(rows[1]);
  });

  it('shows every column on a wide screen', () => {
    table();
    const t = screen.getByRole('table', { name: 'Wire' });
    expect(within(t).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['player', 'lift', 'bid', 'drop']);
  });
});

describe('in-page tabs on a phone', () => {
  it('are one scrollable, sticky strip that never wraps (phone.css)', () => {
    const css = readFileSync(`${process.cwd()}/src/styles/phone.css`, 'utf8');
    const rule = css.match(/\.tabs > \.seg \{[^}]*\}/)![0];
    expect(rule).toMatch(/position: sticky/);
    expect(rule).toMatch(/top: var\(--top-h\)/);
    expect(rule).toMatch(/flex-wrap: nowrap/);
    expect(rule).toMatch(/overflow-x: auto/);
  });

  it('keep the chosen tab in view by scrolling the strip itself', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/p']}>
        <PageTabs tabs={[{ value: 'a', label: 'aaa' }, { value: 'b', label: 'bbb' }, { value: 'c', label: 'ccc' }]} label="Sections">{(t) => <p>{t}</p>}</PageTabs>
      </MemoryRouter>,
    );
    const strip = screen.getByRole('radiogroup', { name: 'Sections' });
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 900 });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 300 });
    const c = screen.getByRole('radio', { name: 'ccc' });
    Object.defineProperty(c, 'offsetLeft', { configurable: true, value: 600 });
    Object.defineProperty(c, 'offsetWidth', { configurable: true, value: 60 });
    await user.click(c);
    expect(strip.scrollLeft).toBe(600 - (300 - 60) / 2);
  });
});
