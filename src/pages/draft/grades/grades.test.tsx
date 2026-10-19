import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PICKS, mount, picksOf } from './testKit';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section')!;
const heads = (t: HTMLElement) => within(t).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''));

describe('draft room: draft grades', () => {
  it('has the two new tabs after the existing ones', async () => {
    mount({ route: '/draft?tab=grades' });
    await screen.findByRole('table', { name: 'Draft grades by team' });
    const radios = screen.getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.parentElement?.textContent);
    expect(radios.join('|')).toMatch(/rankings.*mock draft.*on the clock.*draft grades.*team ratings/);
    expect(screen.getByRole('radio', { name: 'draft grades' })).toBeChecked();
  });

  it('opens on a headline strip: your grades, your best pick and your biggest miss', async () => {
    mount({ route: '/draft?tab=grades' });
    await screen.findByRole('table', { name: 'Draft grades by team' });
    const strip = screen.getByRole('group', { name: 'your draft' });
    expect(within(strip).getByText('your draft grade')).toBeInTheDocument();
    expect(within(strip).getByText(/^[A-DF][+−]?\s→\s[A-DF][+−]?$/)).toBeInTheDocument();
    expect(within(strip).getByText(/draft day → hindsight · \d+(st|nd|rd|th) of 6/)).toBeInTheDocument();
    expect(within(strip).getByText('your best pick')).toBeInTheDocument();
    expect(within(strip).getByText('your biggest miss')).toBeInTheDocument();
  });

  it('lists all 6 teams with the default columns; the rest are behind more columns', async () => {
    const { user } = mount({ route: '/draft?tab=grades' });
    const table = await screen.findByRole('table', { name: 'Draft grades by team' });
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(heads(table)).toEqual(['#', 'team', 'draft day', 'hindsight', 'moved', 'pts over expected', 'still rostered']);
    // the draft-day label is honest about its inputs, behind the ?
    expect(section('draft grades').textContent).toContain('draft day (approximate, using current projections and adp)');
    await user.click(screen.getByRole('button', { name: 'more columns: draft grades by team' }));
    expect(heads(table)).toEqual(expect.arrayContaining(['draft vor', 'lineup pts', 'vs adp', 'pts so far + ros', 'traded · dropped', 'mvp pick']));
    // every grade is a letter
    for (const row of within(table).getAllByRole('row').slice(1)) {
      expect(within(row).getByLabelText(/^draft day grade [A-DF][+−]?$/)).toBeInTheDocument();
      expect(within(row).getByLabelText(/^hindsight grade [A-DF][+−]?$/)).toBeInTheDocument();
    }
    expect(within(table).getByText('you')).toBeInTheDocument();
  });

  it('a team opens in a drawer with every pick, its ADP gap, points so far, rest of season and whether it is still rostered', async () => {
    const { user } = mount({
      route: '/draft?tab=grades',
      // team 2 traded its first pick to team 5, and dropped another
      tweak: (m) => {
        const mine = picksOf(m, 2);
        mine[0]!.ownerRid = 5;
        mine[1]!.ownerRid = 0;
      },
    });
    const table = await screen.findByRole('table', { name: 'Draft grades by team' });
    const row = within(table).getAllByRole('row').find((r) => /T2|Reed Between/.test(r.textContent ?? ''))!;
    await user.click(row);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { level: 2, name: 'Reed Between the Lines' })).toBeInTheDocument();
    const items = within(dialog).getAllByRole('listitem').filter((li) => li.classList.contains('dg-pick'));
    expect(items).toHaveLength(4);
    const own = PICKS.filter((p) => p.roster_id === 2);
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', `/players/${encodeURIComponent(own[0]!.player_id)}`);
    expect(items[0]).toHaveTextContent(/so far/);
    expect(items[0]).toHaveTextContent(/ros/);
    expect(items[0]).toHaveTextContent(/traded to Quinn Tessential/);
    expect(items[1]).toHaveTextContent(/dropped/);
    expect(items[2]).toHaveTextContent(/still rostered/);
    expect(within(dialog).getByText('team mvp')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the highlights as compact cards: steals, busts, the best pick of each round and the one that got away', async () => {
    mount({ route: '/draft?tab=grades' });
    await screen.findByRole('table', { name: 'Draft grades by team' });
    const hl = section('highlights');
    expect(within(hl).getByRole('heading', { name: 'biggest steals' })).toBeInTheDocument();
    expect(within(hl).getByRole('heading', { name: 'biggest busts' })).toBeInTheDocument();
    expect(within(hl).getByRole('heading', { name: 'best pick of each round' })).toBeInTheDocument();
    expect(within(hl).getByRole('heading', { name: 'the one that got away' })).toBeInTheDocument();
    // four rounds: all four fit on the card, no extra disclosure
    expect(within(hl).getAllByText(/^round [1-4] ·/)).toHaveLength(4);
  });

  it('waits for the draft: a draft that has not started shows a note, not grades', async () => {
    mount({ status: 'pre_draft', route: '/draft?tab=grades' });
    expect(await screen.findByText(/grades appear once the draft is done/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Draft grades by team' })).not.toBeInTheDocument();
  });

  it('asks for the league\'s own draft mode when the rankings on screen are for another one', async () => {
    const { user } = mount({ route: '/draft?tab=grades' });
    await screen.findByRole('table', { name: 'Draft grades by team' });
    await user.click(screen.getByRole('button', { name: 'explore startup and rookie values' }));
    await user.click(screen.getByRole('radio', { name: 'startup' }));
    expect(await screen.findByText(/another draft mode/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'show redraft values' }));
    expect(await screen.findByRole('table', { name: 'Draft grades by team' })).toBeInTheDocument();
  });
});
