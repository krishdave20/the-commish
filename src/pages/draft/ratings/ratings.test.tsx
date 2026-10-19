import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SleeperLeague } from '../../../data';
import { PICKS, mount } from '../grades/testKit';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const dynasty = (l: SleeperLeague) => { l.settings = { ...l.settings, type: 2 }; };
const heads = (t: HTMLElement) => within(t).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''));
const route = '/draft?tab=ratings';

describe('draft room: team ratings', () => {
  it('opens on a headline strip: your power rating and rank, your biggest need and surplus', async () => {
    mount({ route });
    await screen.findByRole('table', { name: 'Team power ratings' });
    const strip = screen.getByRole('group', { name: 'your team rating' });
    expect(within(strip).getByText('your power rating')).toBeInTheDocument();
    expect(within(strip).getByText(/^\d+(st|nd|rd|th) of 6 · record says \d+(st|nd|rd|th)$/)).toBeInTheDocument();
    expect(within(strip).getByText('biggest need')).toBeInTheDocument();
    expect(within(strip).getByText('biggest surplus')).toBeInTheDocument();
    // the need links to the trade block
    expect(within(strip).getByRole('link', { name: 'trade block →' })).toHaveAttribute('href', '/trades');
  });

  it('lists every team with power, ros strength, record, roster vs record and the position chips; the rest are behind more columns', async () => {
    const { user } = mount({ route });
    const table = await screen.findByRole('table', { name: 'Team power ratings' });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(heads(table)).toEqual(['#', 'team', 'power', 'ros strength', 'record', 'roster vs record', 'position groups']);
    const first = within(table).getAllByRole('row')[1]!;
    // a thin bar and the number
    expect(first.querySelector('.pw .bar > i')).not.toBeNull();
    // qb rb wr te, each with a tier word
    for (const g of ['qb', 'rb', 'wr', 'te']) expect(within(first).getByText(g)).toBeInTheDocument();
    expect(within(first).getAllByText(/elite|strong|average|thin/)).toHaveLength(4);
    // the delta says what the roster and the record say
    expect(first.textContent).toMatch(/roster \d+(st|nd|rd|th) · record \d+(st|nd|rd|th)/);
    await user.click(screen.getByRole('button', { name: 'more columns: team power ratings' }));
    expect(heads(table)).toEqual(expect.arrayContaining(['playoff weeks', 'depth', 'points for', 'biggest need', 'biggest surplus']));
    // a redraft league has no dynasty columns
    expect(heads(table)).not.toContain('dynasty value');
    expect(heads(table)).not.toContain('26 & under');
  });

  it('a team opens its position breakdown, with a way to the trade block', async () => {
    const { user } = mount({ route });
    const table = await screen.findByRole('table', { name: 'Team power ratings' });
    await user.click(within(table).getAllByRole('row')[1]!);
    const dialog = await screen.findByRole('dialog');
    const groups = within(dialog).getByRole('region', { name: /^Position groups for / });
    expect(within(groups).getAllByRole('listitem')).toHaveLength(5); // qb, rb, wr, te and flex
    expect(within(dialog).getByText('power rating')).toBeInTheDocument();
    expect(within(dialog).getByText('ros strength')).toBeInTheDocument();
    expect(within(dialog).getByText('roster vs record')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('link', { name: /trade block/ })[0]).toHaveAttribute('href', '/trades');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a dynasty league adds the dynasty value and youth share to more columns', async () => {
    const { user } = mount({ route, league: dynasty });
    const table = await screen.findByRole('table', { name: 'Team power ratings' });
    await user.click(screen.getByRole('button', { name: 'more columns: team power ratings' }));
    await waitFor(() => expect(heads(table)).toEqual(expect.arrayContaining(['dynasty value', '26 & under'])));
    const first = within(table).getAllByRole('row')[1]!;
    expect(within(first).getAllByRole('cell').length).toBeGreaterThan(8);
  });

  it('is in the tab list, and uses the model\'s teams (all six)', async () => {
    mount({ route });
    const table = await screen.findByRole('table', { name: 'Team power ratings' });
    expect(within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[1]!.textContent)).toHaveLength(6);
    expect(PICKS).toHaveLength(24);
  });
});
