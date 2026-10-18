import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../../app/testUtils';
import { sampleAccount } from '../../../test/fakes';
import type { HingeSide, HingeStarter } from '../../../engine/hinges';
import { HeadToHeadTable, HingesTable } from './index';
import { pairStarters, slotShare } from './pairing';
import { hingesOf } from '../../../engine/hinges';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const starter = (o: Partial<HingeStarter> & { pid: string; pos: string; mu: number }): HingeStarter => ({
  slot: o.pos, name: o.pid, nfl: 'AAA', state: 'pre', actual: 0, remaining: 1, opp: 'BBB', home: true, statusText: '', kickoff: null, ...o,
});
const mine: HingeSide = {
  rid: 1, name: 'icemen', isMe: true, actual: 16.5, starters: [
    starter({ pid: '4034', name: 'christian mccaffrey', pos: 'RB', mu: 20, state: 'live', actual: 6.5, remaining: 0.6, statusText: 'q2 4:10' }),
    starter({ pid: '11560', name: 'caleb williams', pos: 'QB', mu: 20, state: 'final', actual: 10, remaining: 0, statusText: 'final', home: false }),
    starter({ pid: 'KC', name: 'kc d/st', pos: 'DEF', mu: 6, nfl: 'KC', opp: 'LAC' }),
  ],
};
const theirs: HingeSide = {
  rid: 2, name: 'killa k', isMe: false, actual: 10.1, starters: [
    starter({ pid: '2', name: 'woody marks', pos: 'RB', mu: 12, state: 'final', actual: 10.1, remaining: 0, statusText: 'final' }),
    starter({ pid: '3', name: 'jordan love', pos: 'QB', mu: 21, kickoff: Date.UTC(2026, 9, 18, 20, 20) }),
    starter({ pid: 'SF', name: 'sf d/st', pos: 'DEF', mu: 5, nfl: 'SF', opp: 'ARI' }),
  ],
};

describe('pairStarters and slotShare', () => {
  it('lines up slot by slot, in the first team\'s order, and keeps a slot only one team has', () => {
    const a = [starter({ pid: 'a1', pos: 'WR', mu: 1 }), starter({ pid: 'a2', pos: 'WR', mu: 1 }), starter({ pid: 'a3', pos: 'TE', mu: 1 })];
    const b = [starter({ pid: 'b1', pos: 'WR', mu: 1 }), starter({ pid: 'b2', pos: 'K', mu: 1 })];
    expect(pairStarters(a, b).map((p) => [p.a?.pid ?? null, p.b?.pid ?? null])).toEqual([['a1', 'b1'], ['a2', null], ['a3', null], [null, 'b2']]);
  });

  it('splits the points when anybody has scored, else the projections', () => {
    expect(slotShare(starter({ pid: 'a', pos: 'WR', mu: 10, actual: 6 }), starter({ pid: 'b', pos: 'WR', mu: 10, actual: 2 }))).toEqual({ a: 0.75, basis: 'points' });
    expect(slotShare(starter({ pid: 'a', pos: 'WR', mu: 15 }), starter({ pid: 'b', pos: 'WR', mu: 5 }))).toEqual({ a: 0.75, basis: 'projection' });
    expect(slotShare(null, null)).toBeNull();
  });
});

function renderTable() {
  return render(<MemoryRouter><HeadToHeadTable mine={mine} theirs={theirs} /></MemoryRouter>);
}

describe('HeadToHead', () => {
  it('shows both starters of every slot, mirrored around the slot, with a total row', () => {
    const { container } = renderTable();
    const rows = within(container.querySelector('.h2h')!).getAllByRole('listitem');
    // three slots plus the totals row
    expect(rows).toHaveLength(4);
    const first = rows[0]!;
    expect(within(first).getByRole('link', { name: 'christian mccaffrey' })).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'woody marks' })).toBeInTheDocument();
    // my side is the first child, theirs the mirrored one
    const sides = first.querySelectorAll('.h2h-side');
    expect(sides[0]).not.toHaveAttribute('data-mirror');
    expect(sides[1]).toHaveAttribute('data-mirror', 'true');
    expect(within(sides[0] as HTMLElement).getByText('christian mccaffrey')).toBeInTheDocument();
    expect(within(sides[1] as HTMLElement).getByText('woody marks')).toBeInTheDocument();
    expect(first).toHaveTextContent('rb');
  });

  it('shows points, projection and where each game stands', () => {
    renderTable();
    // live: 6.5 so far of 6.5 + 20 × 0.6 = 18.5 projected, in q2
    expect(screen.getByText('q2 4:10')).toBeInTheDocument();
    expect(screen.getByText('proj 18.5')).toBeInTheDocument();
    expect(screen.getAllByText('final').length).toBeGreaterThanOrEqual(2);
    // not started: a kickoff time, and "@" for the visitor
    expect(screen.getByText(/@ bbb/)).toBeInTheDocument();
    expect(screen.getByText(/^(sun|mon|sat|fri|thu|tue|wed) \d{1,2}:\d{2} (am|pm)$/)).toBeInTheDocument();
  });

  it('totals the points and the projections of each side', () => {
    const { container } = renderTable();
    const total = container.querySelector('.h2h-total')!;
    expect(total).toHaveTextContent('16.5');
    expect(total).toHaveTextContent('10.1');
    // mine: 16.5 + 20 × 0.6 + 6 = 34.5 ; theirs: 10.1 + 21 + 5 = 36.1
    expect(total).toHaveTextContent('proj 34.5');
    expect(total).toHaveTextContent('proj 36.1');
  });

  it('draws a thin bar per slot: points share once anyone has scored, projection share before', () => {
    const { container } = renderTable();
    const bars = [...container.querySelectorAll<HTMLElement>('.h2h-bar')];
    expect(bars).toHaveLength(3);
    // rb: 6.5 vs 10.1
    expect(bars[0]).toHaveAttribute('data-basis', 'points');
    expect(parseFloat((bars[0]!.querySelector('.a') as HTMLElement).style.width)).toBeCloseTo((6.5 / 16.6) * 100, 1);
    // def: nobody has scored, projections 6 vs 5
    expect(bars[2]).toHaveAttribute('data-basis', 'projection');
  });

  it('puts a headshot beside each name (a monogram for a team defense) and keeps the names as the accessible names', () => {
    const { container } = renderTable();
    expect(container.querySelectorAll('img.avatar-img').length).toBe(4);
    expect(container.querySelector('img[src$="/4034.jpg"]')).toBeInTheDocument();
    expect([...container.querySelectorAll('.avatar[data-kind=monogram]')].map((a) => a.textContent)).toEqual(['KC', 'SF']);
    for (const img of container.querySelectorAll('img.avatar-img')) expect(img).toHaveAttribute('alt', '');
  });
});

describe('HingesTable', () => {
  it('lists the starters biggest first with slot, opponent, per game, snaps and at stake', () => {
    const result = hingesOf(mine, theirs, {
      sd: 20, replacement: { RB: 8, QB: 14, DEF: 5 },
      perGame: (pid) => (pid === '4034' ? 18.3 : null), snaps: (pid) => (pid === '4034' ? 0.69 : null),
    });
    render(<MemoryRouter><HingesTable result={result} scale={20} /></MemoryRouter>);
    const table = screen.getByRole('table', { name: 'Your starters ranked by win chance at stake' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, ''))).toEqual(['slot', 'player', 'opponent', 'per game', 'snaps', 'at stake']);
    const body = within(table).getAllByRole('row').slice(1);
    // the live running back carries the most; the finished quarterback has nothing at stake
    expect(within(body[0]!).getByRole('link', { name: 'christian mccaffrey' })).toBeInTheDocument();
    expect(body[0]).toHaveTextContent('18.3');
    expect(body[0]).toHaveTextContent('69%');
    expect(body[0]).toHaveTextContent('vs bbb');
    const qb = body.find((r) => within(r).queryByRole('link', { name: 'caleb williams' }))!;
    expect(qb).toHaveTextContent('@ bbb');
    expect(qb.querySelector('.hinge-stake b')).toHaveTextContent('0');
  });
});

describe('who this week hinges on (locker room)', () => {
  const linked = [sampleAccount()];

  it('sits in the lineup tab with the stakes of each starter, biggest first', async () => {
    renderApp({ linked, route: '/team' });
    const heading = await screen.findByRole('heading', { level: 2, name: 'who this week hinges on' });
    const card = heading.closest('section')!;
    expect(card.querySelector('.hinge-line')).toHaveTextContent(/your win chance \d+%/);
    const table = within(card).getByRole('table', { name: 'Your starters ranked by win chance at stake' });
    const names = within(table).getAllByRole('link').map((a) => a.textContent);
    // no free-agent QB, so the quarterback is worth most; a free-agent WR (16) beats Walt Wideout (12), so he sits last
    expect(names).toEqual(['Alex Arm', 'Rex Runner', 'Walt Wideout']);
    const stake = (row: HTMLElement) => row.querySelector('.hinge-stake b')!.textContent!;
    const rows = within(table).getAllByRole('row').slice(1);
    expect(Number(stake(rows[0]!))).toBeGreaterThan(Number(stake(rows[1]!)));
    expect(stake(rows[2]!)).toMatch(/^−\d+$|^0$/);
  });

  it('has an info tip on how it is computed', async () => {
    const { user } = renderApp({ linked, route: '/team' });
    await screen.findByRole('heading', { level: 2, name: 'who this week hinges on' });
    const tip = screen.getByRole('button', { name: 'about who this week hinges on' });
    await user.click(tip);
    expect(screen.getByText(/median of the 12 best free agents/)).toBeVisible();
  });

  it('switches to the opponent\'s starters with the toggle', async () => {
    const { user } = renderApp({ linked, route: '/team' });
    const heading = await screen.findByRole('heading', { level: 2, name: 'who this week hinges on' });
    const card = heading.closest('section')!;
    await user.click(within(card).getByRole('radio', { name: 'opponent' }));
    const table = within(card).getByRole('table', { name: /Reed Between the Lines.s starters ranked/ });
    expect(within(table).getAllByRole('link').map((a) => a.textContent).sort()).toEqual(['Quinn Quarterback', 'Ray Rusher', 'Reed Receiver']);
    expect(within(card).getByText(/Reed Between the Lines.s win chance/)).toBeInTheDocument();
    await user.click(within(card).getByRole('radio', { name: 'you' }));
    expect(within(card).getByRole('table', { name: 'Your starters ranked by win chance at stake' })).toBeInTheDocument();
  });

  it('shows a headshot or monogram beside each name in the lineup and the roster, names unchanged', async () => {
    const { user, container } = renderApp({ linked, route: '/team' });
    const lineup = await screen.findByRole('table', { name: 'Lineup for week 5' });
    expect(lineup.querySelectorAll('.avatar').length).toBeGreaterThanOrEqual(3);
    expect(within(lineup).getByRole('link', { name: 'Alex Arm' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'roster' }));
    const roster = await screen.findByRole('table', { name: 'Roster' });
    expect(roster.querySelectorAll('.avatar').length).toBeGreaterThanOrEqual(4);
    expect(within(roster).getByRole('link', { name: 'Backup Wideout' })).toBeInTheDocument();
    expect(container.querySelectorAll('.avatar[aria-hidden="true"]').length).toBe(container.querySelectorAll('.avatar').length);
  });
});
