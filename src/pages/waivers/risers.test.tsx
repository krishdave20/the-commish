import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { nvWeek } from '../../test/fakes';
import { UnmatchedTable } from '../settings/UnmatchedTable';
import { usageRisers } from './risers';
import { UsageRisers } from './UsageRisers';

afterEach(cleanup);

// weeks 1-4 before, weeks 5-6 recent (through = 6)
const rows = (pid: string, snaps: number[], tgts: number[], shares: number[]) =>
  snaps.map((s, i) => nvWeek({ pid, week: i + 1, off_snaps: s, tm_snaps: 60, snap_pct: s / 60, tgt: tgts[i]!, tgt_share: shares[i]! }));

const data = [
  ...rows('riser', [20, 22, 18, 20, 40, 48], [2, 3, 2, 2, 6, 7], [0.08, 0.1, 0.08, 0.08, 0.2, 0.22]),
  ...rows('flat', [30, 30, 30, 30, 30, 30], [4, 4, 4, 4, 4, 4], [0.15, 0.15, 0.15, 0.15, 0.15, 0.15]),
  ...rows('faller', [50, 50, 50, 50, 20, 20], [8, 8, 8, 8, 2, 2], [0.3, 0.3, 0.3, 0.3, 0.1, 0.1]),
  ...rows('thin', [0, 0, 0, 0, 8, 9], [0, 0, 0, 0, 3, 3], [0, 0, 0, 0, 0.1, 0.1]), // 17 snaps in the window: under the minimum
  ...rows('rostered', [10, 10, 10, 10, 50, 50], [1, 1, 1, 1, 9, 9], [0.05, 0.05, 0.05, 0.05, 0.3, 0.3]),
  nvWeek({ pid: 'newbie', week: 6, off_snaps: 40, tm_snaps: 60, snap_pct: 0.67, tgt: 6, tgt_share: 0.2 }), // no prior weeks
];
const fa = new Set(['riser', 'flat', 'faller', 'thin', 'newbie']);

describe('usageRisers', () => {
  it('ranks free agents by the rise of the last two weeks over their earlier average', () => {
    const r = usageRisers(data, fa, 6, 'snap');
    expect(r.map((x) => x.pid)).toEqual(['riser']); // flat and faller did not rise, thin is under 20 snaps, newbie has no prior
    expect(r[0]).toMatchObject({ recentWeeks: 2, priorWeeks: 4, recentSnaps: 88 });
    expect(r[0]!.recent).toBeCloseTo((40 / 60 + 48 / 60) / 2);
    expect(r[0]!.prior).toBeCloseTo((20 + 22 + 18 + 20) / 4 / 60);
    expect(r[0]!.change).toBeGreaterThan(0.3);
  });

  it('uses target share with a target minimum', () => {
    expect(usageRisers(data, fa, 6, 'target').map((x) => x.pid)).toEqual(['riser']);
    expect(usageRisers(data, new Set(['riser', 'rostered']), 6, 'target').map((x) => x.pid)).toEqual(['rostered', 'riser']);
  });

  it('ignores weeks after `through`', () => {
    expect(usageRisers(data, fa, 4, 'snap')).toEqual([]); // the window is weeks 3 and 4 with prior 1 and 2: no rise
  });
});

describe('UsageRisers panel', () => {
  const names = new Map([['riser', { name: 'Rising Runner', pos: 'RB' }], ['flat', { name: 'Flat Fred', pos: 'WR' }]]);
  const wrap = (el: React.ReactElement) => <MemoryRouter>{el}</MemoryRouter>;

  it('says nflverse data arrives with the nightly update with none', () => {
    render(wrap(<UsageRisers weeks={null} through={null} freeAgents={names} loading={false} />));
    expect(screen.getByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });

  it('lists risers with the change and the sample size, and switches measure', async () => {
    render(wrap(<UsageRisers weeks={data} through={6} freeAgents={names} loading={false} />));
    const table = screen.getByRole('table', { name: 'Usage risers' });
    const row = within(table).getByText('Rising Runner').closest('tr')!;
    expect(row).toHaveTextContent('73.3%');
    expect(row).toHaveTextContent('+');
    expect(row).toHaveTextContent('88 snaps in 2 weeks; 4 earlier weeks');
    expect(within(table).getByRole('link', { name: 'Rising Runner' })).toHaveAttribute('href', '/players/riser');
    expect(within(table).queryByText('Flat Fred')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'target share' }));
    expect(within(screen.getByRole('table', { name: 'Usage risers' })).getByText('Rising Runner').closest('tr')).toHaveTextContent('13 targets');
  });
});

describe('UnmatchedTable', () => {
  const players = [
    { key: 'g1', gsis: 'g1', pfr: null, name: 'Mystery Man', team: 'AAA', pos: 'WR', off_snaps: 120, tgt: 14, car: 0, reason: 'no_candidate' as const, candidates: [] },
    { key: 'g2', gsis: 'g2', pfr: null, name: 'Twin One', team: 'BBB', pos: 'RB', off_snaps: 80, tgt: 3, car: 40, reason: 'ambiguous' as const, candidates: ['Twin One (111)', 'Twin Won (222)'] },
  ];

  it('lists unmatched players with the reason', () => {
    render(<UnmatchedTable players={players} matched={812} season={2026} loading={false} />);
    expect(screen.getByText(/2 nflverse players .* could not be matched to a sleeper player; 812 were matched/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Unmatched player ids' });
    const row = within(table).getByText('Twin One').closest('tr')!;
    expect(row).toHaveTextContent('RB');
    expect(row).toHaveTextContent('ambiguous');
    expect(row).toHaveTextContent('considered Twin One (111), Twin Won (222)');
    expect(within(table).getByText('Mystery Man').closest('tr')).toHaveTextContent('no candidate');
  });

  it('handles none, and no data yet', () => {
    const { rerender } = render(<UnmatchedTable players={[]} loading={false} />);
    expect(screen.getByText(/every nflverse player with snaps, targets or carries was matched/)).toBeInTheDocument();
    rerender(<UnmatchedTable players={null} loading={false} />);
    expect(screen.getByText('nflverse data arrives with the nightly update.')).toBeInTheDocument();
  });
});
