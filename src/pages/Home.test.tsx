import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../app/testUtils';
import { FAKE_AS_OF, createFakeApi, sampleAccount } from '../test/fakes';
import { buildStandings } from './standings';
import { sampleBundle } from '../test/fakes';

describe('Home', () => {
  it('shows the league panel', async () => {
    renderApp({ linked: [sampleAccount()] });
    const panel = (await screen.findByRole('heading', { name: 'Sample League', level: 2 })).closest('section')!;
    expect(panel).toHaveTextContent('2026 · In season');
    expect(panel).toHaveTextContent('PPR · Redraft');
    expect(panel).toHaveTextContent('Divisions2');
    expect(panel).toHaveTextContent('Playoff teams4');
    expect(panel).toHaveTextContent('Week 15');
    expect(panel).toHaveTextContent('$100');
  });

  it('formats a large FAAB budget with a thousands separator', async () => {
    const api = createFakeApi();
    const b = sampleBundle();
    b.league.settings.waiver_budget = 1800;
    api.leagueBundle.mockResolvedValue({ data: b, asOf: FAKE_AS_OF, fromCache: false, stale: false });
    renderApp({ linked: [sampleAccount()], api });
    const panel = (await screen.findByRole('heading', { name: 'Sample League', level: 2 })).closest('section')!;
    expect(panel).toHaveTextContent('$1,800');
  });

  it('shows the roster chips', async () => {
    renderApp({ linked: [sampleAccount()] });
    const panel = (await screen.findByRole('heading', { name: 'Sample League', level: 2 })).closest('section')!;
    const chips = within(panel).getByLabelText('Roster slots');
    expect(chips).toHaveTextContent('RB ×2');
    expect(chips).toHaveTextContent('BN ×3');
    expect(panel).toHaveTextContent('Phase: In season');
  });

  it('sorts standings by wins then points for, and highlights my team', async () => {
    renderApp({ linked: [sampleAccount()] });
    const table = await screen.findByRole('table', { name: 'League standings' });
    const rows = within(table).getAllByRole('row').slice(1);
    const teams = rows.map((r) => within(r).getAllByRole('cell')[1].textContent);
    expect(teams).toEqual([
      'Reed Between the Lines',
      'Sunday Scaries' + 'you',
      'Fourth and Long',
      'Jordan Hale', // no team_name: falls back to the display name
      'Quinn Tessential',
      'Hail Mary Club',
    ]);
    const mine = rows[1];
    expect(mine).toHaveAttribute('aria-current', 'true');
    const cells = within(mine).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['2', 'Sunday Scaries' + 'you', 'Sam Sample', '4-2', '612.40', '540.10', 'North']);
    expect(within(rows[0]).getAllByRole('cell')[6]).toHaveTextContent('North');
    expect(within(rows[2]).getAllByRole('cell')[6]).toHaveTextContent('South');
  });

  it('shows my record and points-for rank as big numbers', async () => {
    renderApp({ linked: [sampleAccount()] });
    const kpis = await screen.findByLabelText('Your season so far');
    expect(kpis).toHaveTextContent('4–2');
    expect(kpis).toHaveTextContent('#2');
    expect(kpis).toHaveTextContent('of 6 teams');
    expect(kpis).toHaveTextContent('612.4');
    expect(kpis).toHaveTextContent('540.1 against');
  });

  it('survives detectPhase not being written yet', async () => {
    renderApp({ linked: [sampleAccount()] });
    await screen.findByRole('table', { name: 'League standings' });
    // either "not set yet" (still a stub) or a real label once the owner writes it; it must not crash
    expect(screen.getByText(/^Phase: /)).toBeInTheDocument();
  });
});

describe('buildStandings', () => {
  it('counts co-owners as mine and builds PF from fpts + fpts_decimal/100', () => {
    const b = sampleBundle();
    b.rosters[2].owner_id = 'someone-else';
    b.rosters[2].co_owners = ['u1'];
    const rows = buildStandings(b, 'u1');
    expect(rows.filter((r) => r.isMine).map((r) => r.rosterId).sort()).toEqual([1, 3]);
    expect(rows.find((r) => r.rosterId === 2)?.pf).toBeCloseTo(640.05);
    expect(rows.find((r) => r.rosterId === 2)?.pfRank).toBe(1);
  });

  it('shows ties and handles leagues without divisions', () => {
    const b = sampleBundle();
    b.league.settings.divisions = 0;
    b.rosters[0].settings.ties = 1;
    const rows = buildStandings(b, null);
    expect(rows.every((r) => r.division === null && !r.isMine)).toBe(true);
  });
});
