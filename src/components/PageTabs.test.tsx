import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { PageTabs } from './PageTabs';

afterEach(cleanup);

const TABS = [
  { value: 'one', label: 'first' },
  { value: 'two', label: 'second' },
  { value: 'three', label: 'third' },
] as const;

function Where() {
  const l = useLocation();
  const nav = useNavigate();
  return (
    <>
      <output aria-label="location">{l.pathname}{l.search}</output>
      <button type="button" onClick={() => nav(-1)}>history back</button>
      <button type="button" onClick={() => nav(1)}>history forward</button>
      <button type="button" onClick={() => nav('/page?tab=three&x=1')}>go to third</button>
    </>
  );
}

function ui(route = '/page') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Where />
      <PageTabs tabs={TABS} label="Sections">
        {(tab) => <p>panel {tab}</p>}
      </PageTabs>
    </MemoryRouter>,
  );
}
const where = () => screen.getByLabelText('location').textContent;

describe('PageTabs', () => {
  it('shows the first tab by default, with no ?tab= in the URL', () => {
    ui();
    expect(screen.getByRole('radio', { name: 'first' })).toBeChecked();
    expect(screen.getByText('panel one')).toBeInTheDocument();
    expect(screen.queryByText('panel two')).not.toBeInTheDocument();
    expect(where()).toBe('/page');
  });

  it('is a named radio group of Segmented radios', () => {
    ui();
    const group = screen.getByRole('radiogroup', { name: 'Sections' });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  it('writes ?tab= when another tab is picked and drops it for the default', async () => {
    const user = userEvent.setup();
    ui();
    await user.click(screen.getByRole('radio', { name: 'second' }));
    expect(screen.getByText('panel two')).toBeInTheDocument();
    expect(where()).toBe('/page?tab=two');
    await user.click(screen.getByRole('radio', { name: 'first' }));
    expect(where()).toBe('/page');
  });

  it('keeps other search parameters', async () => {
    const user = userEvent.setup();
    ui('/page?phase=offseason');
    await user.click(screen.getByRole('radio', { name: 'third' }));
    expect(where()).toBe('/page?phase=offseason&tab=three');
    await user.click(screen.getByRole('radio', { name: 'first' }));
    expect(where()).toBe('/page?phase=offseason');
  });

  it('opens the tab named in the URL, and reads an unknown value as the default', () => {
    ui('/page?tab=two');
    expect(screen.getByRole('radio', { name: 'second' })).toBeChecked();
    cleanup();
    ui('/page?tab=nope');
    expect(screen.getByRole('radio', { name: 'first' })).toBeChecked();
  });

  it('follows the URL when history moves (back and forward) or a link changes it', async () => {
    const user = userEvent.setup();
    ui();
    await user.click(screen.getByRole('button', { name: 'go to third' }));
    expect(screen.getByRole('radio', { name: 'third' })).toBeChecked();
    expect(screen.getByText('panel three')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'history back' }));
    expect(where()).toBe('/page');
    expect(screen.getByRole('radio', { name: 'first' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'history forward' }));
    expect(screen.getByRole('radio', { name: 'third' })).toBeChecked();
  });

  it('replaces the history entry: switching tabs does not add a step to go back through', async () => {
    const user = userEvent.setup();
    ui();
    await user.click(screen.getByRole('radio', { name: 'second' }));
    await user.click(screen.getByRole('radio', { name: 'third' }));
    await user.click(screen.getByRole('button', { name: 'history back' }));
    // nothing before the page itself: back stays put in a one-entry memory history
    expect(where()).toBe('/page?tab=three');
  });

  it('arrow keys move between tabs and keep focus on the control', async () => {
    const user = userEvent.setup();
    ui();
    screen.getByRole('radio', { name: 'first' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'second' })).toHaveFocus();
    expect(screen.getByText('panel two')).toBeInTheDocument();
  });

  it('honours aliases and a custom default', () => {
    render(
      <MemoryRouter initialEntries={['/page?tab=live']}>
        <PageTabs tabs={TABS} label="Sections" defaultTab="three" aliases={{ live: 'two' }}>{(t) => <p>panel {t}</p>}</PageTabs>
      </MemoryRouter>,
    );
    expect(screen.getByRole('radio', { name: 'second' })).toBeChecked();
    cleanup();
    render(
      <MemoryRouter initialEntries={['/page']}>
        <Where />
        <PageTabs tabs={TABS} label="Sections" defaultTab="three">{(t) => <p>panel {t}</p>}</PageTabs>
      </MemoryRouter>,
    );
    expect(screen.getByRole('radio', { name: 'third' })).toBeChecked();
    expect(where()).toBe('/page');
  });
});
