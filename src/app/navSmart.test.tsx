import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_KEY } from './theme';
import { MomentsContext } from './moments/momentsContext';
import type { MomentsValue } from './moments/momentsContext';
import { TabBar } from './PhoneChrome';
import { savePrefs } from './prefs';
import { createFakeAccountStore, createFakeApi, createFakeSleeper, sampleAccount } from '../test/fakes';
import { DataProvider } from './DataProvider';
import { renderApp } from './testUtils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

const phone = () => vi.stubGlobal('matchMedia', (q: string) => ({
  matches: q === '(max-width: 760px)', media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
}));
const linked = [sampleAccount()];
const TUE_8PM = new Date(2026, 9, 20, 20, 0).getTime();
const waiverMoments = (): MomentsValue => ({
  ctx: null, ongoing: [], hero: null, previewing: true, now: TUE_8PM,
  moments: [{ id: 'w', kind: 'waivers-tonight', priority: 86, title: 'waivers process tonight at 3:00 am', detail: '', action: { label: 'open', to: '/waivers' }, pages: ['waivers'] }],
});

describe('smart order in the navigation', () => {
  it('the phone tab bar takes huddle, then the next three sections in order, and "more" lists every section in that order', async () => {
    phone();
    savePrefs({ smartNav: true });
    const user = userEvent.setup();
    render(
      <DataProvider api={createFakeApi()} accounts={createFakeAccountStore(linked)} sleeper={createFakeSleeper()}>
        <MemoryRouter><MomentsContext.Provider value={waiverMoments()}><TabBar /></MomentsContext.Provider></MemoryRouter>
      </DataProvider>,
    );
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    // slot 2 is the waiver wire, with its reason for readers and on hover; then the locker room, then the next in the fixed order
    expect(within(nav).getAllByRole('link').map((a) => a.querySelector('.tb-label, .sr-only')!.textContent)).toEqual(['huddle', 'waivers', 'locker room', 'game day']);
    const wire = within(nav).getByRole('link', { name: /waiver wire/ });
    expect(wire).toHaveAttribute('title', 'up front: waivers process tonight at 3:00 am');
    expect(wire).toHaveTextContent('up front: waivers process tonight at 3:00 am');
    await user.click(within(nav).getByRole('button', { name: 'more' }));
    const all = within(screen.getByRole('navigation', { name: 'All sections' }));
    expect(all.getAllByRole('link').slice(0, 4).map((a) => a.querySelector('span')!.textContent)).toEqual(['huddle', 'waiver wire', 'locker room', 'game day']);
  });

  it('the phone slots are the fixed four when smart order is off', () => {
    phone();
    savePrefs({ smartNav: false });
    render(<MemoryRouter><MomentsContext.Provider value={waiverMoments()}><TabBar /></MomentsContext.Provider></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getAllByRole('link').map((a) => a.querySelector('.tb-label')!.textContent)).toEqual(['huddle', 'game day', 'locker room', 'playoffs']);
  });

  it('the desktop tabs follow the phase preview (?phase=pre_draft puts the draft room up front, with a dot and a reason) and stay fixed with it off', async () => {
    savePrefs({ smartNav: true });
    renderApp({ linked, route: '/?phase=pre_draft' });
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const links = within(nav).getAllByRole('link');
    expect(links[0]).toHaveTextContent('huddle');
    expect(links[1]).toHaveTextContent('draft room');
    expect(links[1]).toHaveAttribute('data-up', 'true');
    expect(links[1]).toHaveTextContent(/up front:/);
    expect(links[1].querySelector('.nav-up')).not.toBeNull();
    expect(links.at(-1)).toHaveTextContent('front office');
    cleanup();
    savePrefs({ smartNav: false });
    renderApp({ linked, route: '/?phase=pre_draft' });
    const fixed = within(await screen.findByRole('navigation', { name: 'Primary' })).getAllByRole('link');
    expect(fixed[1]).toHaveTextContent('game day');
    expect(document.querySelector('.nav-up')).toBeNull();
  });
});

describe('the appearance switch', () => {
  const choose = (name: string) => screen.getByRole('radio', { name });

  it('shows the current choice in the header, and light and dark set data-theme while auto removes the override', async () => {
    const user = userEvent.setup();
    renderApp({ linked });
    const group = await screen.findByRole('radiogroup', { name: 'Appearance' });
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['light', 'dark', 'auto']);
    expect(choose('auto')).toHaveAttribute('aria-checked', 'true');
    await user.click(choose('dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(choose('dark')).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    await user.click(choose('light'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await user.click(choose('auto'));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('is at the top of the more sheet on a phone', async () => {
    phone();
    const user = userEvent.setup();
    renderApp({ linked });
    await user.click(await screen.findByRole('button', { name: 'more' }));
    const sheet = await screen.findByRole('dialog', { name: 'more' });
    await user.click(within(sheet).getByRole('radio', { name: 'dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('is in the front office too, next to the smart order setting', async () => {
    const user = userEvent.setup();
    renderApp({ linked, route: '/settings' });
    const section = (await screen.findByRole('heading', { level: 2, name: 'appearance' })).closest('details')!;
    expect(section).toHaveAttribute('open');
    await user.click(within(section).getByRole('radio', { name: 'dark' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    const smart = within(section).getByRole('radiogroup', { name: 'Smart order' });
    expect(within(smart).getByRole('radio', { name: 'smart order: on' })).toHaveAttribute('aria-checked', 'true');
    await user.click(within(smart).getByRole('radio', { name: 'smart order: off' }));
    expect(JSON.parse(window.localStorage.getItem('wr.prefs.v1')!).smartNav).toBe(false);
  });
});
