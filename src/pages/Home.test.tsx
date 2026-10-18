import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../app/testUtils';
import { sampleAccount } from '../test/fakes';
import { buildStandings } from './standings';
import { sampleBundle } from '../test/fakes';

describe('Home', () => {
  it('opens with a slim strip of your figures; the league panel and the standings table are not on the page', async () => {
    renderApp({ linked: [sampleAccount()] });
    const strip = await screen.findByRole('group', { name: 'your season' });
    expect(within(strip).getByText('record')).toBeInTheDocument();
    // the league's rules moved to the front office, the standings to the playoff picture
    expect(screen.queryByRole('heading', { name: 'Sample League', level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'League standings' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Phase: /)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the playoff picture/ })).toHaveAttribute('href', '/race');
  });

  it('shows my record, with my team and place, as the first figure', async () => {
    renderApp({ linked: [sampleAccount()] });
    const strip = await screen.findByRole('group', { name: 'your season' });
    const record = within(strip).getByText('record').closest('.kpi')!;
    expect(record).toHaveTextContent('4–2');
    expect(record).toHaveTextContent('Sunday Scaries, 2nd of 6');
  });
});

describe('buildStandings', () => {
  it('sorts by wins then points for, falls back to the display name and marks my team', () => {
    const rows = buildStandings(sampleBundle(), 'u1');
    expect(rows.map((r) => r.teamName)).toEqual([
      'Reed Between the Lines', 'Sunday Scaries', 'Fourth and Long',
      'Jordan Hale', // no team_name: falls back to the display name
      'Quinn Tessential', 'Hail Mary Club',
    ]);
    const mine = rows[1]!;
    expect(mine).toMatchObject({ isMine: true, rank: 2, wins: 4, losses: 2, manager: 'Sam Sample', division: 'North' });
    expect(mine.pf).toBeCloseTo(612.4);
    expect(mine.pa).toBeCloseTo(540.1);
    expect(rows[0]!.division).toBe('North');
    expect(rows[2]!.division).toBe('South');
  });

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
