import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClinchMark, MarkLegend } from './ClinchMark';
import { Drawer } from './Drawer';
import { MatchupGrade } from './MatchupGrade';
import { OddsCell } from './OddsCell';
import { ScenarioBanner } from './ScenarioBanner';
import { Segmented } from './Segmented';
import { SortableTable } from './SortableTable';
import { TierPill } from './TierPill';
import { formatOdds, ordinal, signedPct } from '../app/format';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Pretend the viewer has no reduced-motion preference. */
function allowMotion() {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('no-preference'), media: q, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

describe('format helpers', () => {
  it('shows >99% and <1% at the ends', () => {
    expect([1, 0.999, 0.996, 0.995, 0.5, 0.004, 0.0001, 0].map(formatOdds)).toEqual(['100%', '>99%', '>99%', '100%', '50%', '<1%', '<1%', '0%']);
  });
  it('signs and ordinals', () => {
    expect([0.031, -0.02, 0.001].map(signedPct)).toEqual(['+3', '−2', '±0']);
    expect([1, 2, 3, 4, 11, 12, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '21st', '22nd']);
  });
});

describe('Segmented', () => {
  function Harness() {
    const [v, setV] = useState('all');
    return (
      <>
        <Segmented label="Division" value={v} onChange={setV} options={[
          { value: 'all', label: 'All teams' }, { value: 'n', label: 'North' }, { value: 's', label: 'South' },
        ]} />
        <output>{v}</output>
      </>
    );
  }

  it('marks the chosen option and changes on click', async () => {
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Division' });
    expect(within(group).getByRole('radio', { name: 'All teams' })).toBeChecked();
    await userEvent.click(within(group).getByRole('radio', { name: 'North' }));
    expect(within(group).getByRole('radio', { name: 'North' })).toBeChecked();
  });

  it('moves with arrow keys, wraps, and supports Home and End', async () => {
    render(<Harness />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'All teams' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'North' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'North' })).toBeChecked();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'All teams' })).toBeChecked(); // wrapped
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'South' })).toBeChecked();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'All teams' })).toBeChecked();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'South' })).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('s');
  });

  it('only the chosen option is in the tab order', () => {
    render(<Harness />);
    const tabbable = screen.getAllByRole('radio').filter((r) => r.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });
});

describe('OddsCell', () => {
  const tone = (v: number) => {
    const { container, unmount } = render(<OddsCell value={v} />);
    const out = {
      tone: container.querySelector('.oddcell')!.getAttribute('data-tone'),
      bar: container.querySelector('.bar')!.className,
      text: container.querySelector('.oddcell span')!.textContent,
    };
    unmount();
    return out;
  };

  it('is green from 65%, gold from 35%, red below', () => {
    expect(tone(0.65)).toMatchObject({ tone: 'ok', bar: 'bar' });
    expect(tone(0.9)).toMatchObject({ tone: 'ok', bar: 'bar' });
    expect(tone(0.649)).toMatchObject({ tone: 'warn', bar: 'bar gold' });
    expect(tone(0.35)).toMatchObject({ tone: 'warn', bar: 'bar gold' });
    expect(tone(0.349)).toMatchObject({ tone: 'bad', bar: 'bar red' });
    expect(tone(0)).toMatchObject({ tone: 'bad', bar: 'bar red' });
  });

  it('shows >99% and <1% near the ends', () => {
    expect(tone(0.997).text).toBe('>99%');
    expect(tone(0.002).text).toBe('<1%');
    expect(tone(0.74).text).toBe('74%');
  });

  it('draws the bar at its final width at once with reduced motion', () => {
    const { container } = render(<OddsCell value={0.4} />);
    expect(container.querySelector<HTMLElement>('.bar > i')!.style.width).toBe('40%');
  });

  it('grows the bar from zero when motion is allowed', async () => {
    allowMotion();
    const { container } = render(<OddsCell value={0.4} />);
    const bar = container.querySelector<HTMLElement>('.bar > i')!;
    expect(bar.style.width).toBe('0%');
    await waitFor(() => expect(bar.style.width).toBe('40%'));
  });
});

describe('ClinchMark and MarkLegend', () => {
  it('names each mark', () => {
    render(<>{(['x', 'y', 'd', 'e'] as const).map((m) => <ClinchMark key={m} mark={m} />)}</>);
    expect(screen.getByRole('img', { name: 'clinched a playoff spot' })).toHaveTextContent('x');
    expect(screen.getByRole('img', { name: 'clinched division' })).toHaveAttribute('title', 'clinched division');
    expect(screen.getByRole('img', { name: 'out of division race' })).toHaveClass('mark', 'd');
    expect(screen.getByRole('img', { name: 'eliminated' })).toHaveClass('mark', 'e');
  });

  it('renders a hidden placeholder for no mark', () => {
    const { container } = render(<ClinchMark mark="" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('.mark.none')).toHaveTextContent('·');
  });

  it('lists all four meanings in the legend', () => {
    render(<MarkLegend />);
    const legend = screen.getByLabelText('Clinch marks');
    for (const t of ['clinched a playoff spot', 'clinched division', 'out of division race', 'eliminated']) {
      expect(legend).toHaveTextContent(t);
    }
  });
});

describe('TierPill', () => {
  const label = (p: number) => {
    const { container, unmount } = render(<TierPill p={p} />);
    const el = container.querySelector('.pill')!;
    const out = [el.textContent, el.className];
    unmount();
    return out;
  };

  it('uses the reference thresholds', () => {
    expect(label(1)).toEqual(['Lock', 'pill solid-ok']);
    expect(label(0.99)).toEqual(['Lock', 'pill solid-ok']);
    expect(label(0.989)).toEqual(['Likely', 'pill ok']);
    expect(label(0.75)).toEqual(['Likely', 'pill ok']);
    expect(label(0.74)).toEqual(['Bubble', 'pill warn']);
    expect(label(0.35)).toEqual(['Bubble', 'pill warn']);
    expect(label(0.34)).toEqual(['Long shot', 'pill bad']);
    expect(label(0.01)).toEqual(['Long shot', 'pill bad']);
    expect(label(0.009)).toEqual(['Done', 'pill solid-bad']);
  });

  it('lets a settled status override the tier', () => {
    render(<><TierPill p={0.5} status="clinched" /><TierPill p={0.5} status="eliminated" /></>);
    expect(screen.getByText('Clinched')).toHaveClass('solid-ok');
    expect(screen.getByText('Eliminated')).toHaveClass('solid-bad');
  });
});

describe('MatchupGrade', () => {
  const grade = (dvp: number | null | undefined) => {
    const { container, unmount } = render(<MatchupGrade opponent="DAL" dvp={dvp} />);
    const dot = container.querySelector<HTMLElement>('.grade')!;
    const out = { kind: dot.dataset.grade, cls: dot.className, text: container.textContent, title: container.querySelector('.matchup')!.getAttribute('title') };
    unmount();
    return out;
  };

  it('is soft from 1.15, tough up to 0.87, average between', () => {
    expect(grade(1.15)).toMatchObject({ kind: 'soft', cls: 'grade soft', text: 'DALsoft' });
    expect(grade(1.4)).toMatchObject({ kind: 'soft' });
    expect(grade(1.149)).toMatchObject({ kind: 'mid', cls: 'grade mid', text: 'DALavg' });
    expect(grade(1)).toMatchObject({ kind: 'mid' });
    expect(grade(0.871)).toMatchObject({ kind: 'mid' });
    expect(grade(0.87)).toMatchObject({ kind: 'tough', cls: 'grade tough', text: 'DALtough' });
    expect(grade(0.5)).toMatchObject({ kind: 'tough' });
  });

  it('explains the grade and ratio in the tooltip', () => {
    expect(grade(1.22).title).toBe('soft matchup (1.22×)');
  });

  it('shows no label without data', () => {
    expect(grade(null)).toMatchObject({ kind: 'none', text: 'DAL', title: 'no data' });
  });

  it('shows a bye pill', () => {
    render(<><MatchupGrade opponent={null} dvp={1.3} /><MatchupGrade opponent="BYE" /></>);
    expect(screen.getAllByText('bye')).toHaveLength(2);
    expect(document.querySelector('.grade')).toBeNull();
  });
});

describe('ScenarioBanner', () => {
  it('describes the what-if and resets', async () => {
    const onReset = vi.fn();
    const onEdit = vi.fn();
    render(<ScenarioBanner what="adding Jo Doe" chip={{ text: 'playoffs 62% (+6)', tone: 'up' }} onReset={onReset} onEdit={onEdit} />);
    expect(screen.getByRole('status')).toHaveTextContent('You’re looking at a what-if: adding Jo Doe');
    expect(screen.getByText('playoffs 62% (+6)')).toHaveClass('chip', 'up');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('omits Edit when there is no handler', () => {
    render(<ScenarioBanner what="x" onReset={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});

describe('Drawer', () => {
  function Harness({ onClosed }: { onClosed?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Open team</button>
        <Drawer open={open} title="Sunday Scaries" kicker="Team" onClose={() => { setOpen(false); onClosed?.(); }}>
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </Drawer>
      </>
    );
  }

  it('is a modal dialog named by its title and takes focus', async () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open team' }));
    const dialog = screen.getByRole('dialog', { name: 'Sunday Scaries' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const onClosed = vi.fn();
    render(<Harness onClosed={onClosed} />);
    const opener = screen.getByRole('button', { name: 'Open team' });
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
  });

  it('closes from the Close button and the backdrop', async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open team' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open team' }));
    await userEvent.click(document.body.querySelector('.drawer-backdrop')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  it('keeps Tab and Shift+Tab inside the drawer', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Open team' }));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    await userEvent.tab(); // wraps to the first
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true }); // and back to the last
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Open team' })).not.toHaveFocus();
  });
});

describe('SortableTable', () => {
  interface Row { id: number; team: string; wins: number | null; pf: number }
  const rows: Row[] = [
    { id: 1, team: 'Bravo', wins: 4, pf: 600.5 },
    { id: 2, team: 'Alpha', wins: 6, pf: 580.25 },
    { id: 3, team: 'Charlie', wins: null, pf: 640 },
    { id: 4, team: 'Delta', wins: 2, pf: 500 },
  ];
  const columns = [
    { key: 'team', header: 'Team', value: (r: Row) => r.team },
    { key: 'wins', header: 'Wins', numeric: true, value: (r: Row) => r.wins },
    { key: 'pf', header: 'PF', numeric: true, value: (r: Row) => r.pf, render: (r: Row) => r.pf.toFixed(2) },
    { key: 'note', header: 'Note', sortable: false, render: () => '—' },
  ];
  const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
  const sortOf = (name: string) => screen.getByRole('columnheader', { name: new RegExp(name) }).getAttribute('aria-sort');

  it('starts unsorted with aria-sort none', () => {
    render(<SortableTable caption="Teams" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(names()).toEqual(['Bravo', 'Alpha', 'Charlie', 'Delta']);
    expect(sortOf('Team')).toBe('none');
    expect(screen.getByRole('columnheader', { name: 'Note' })).not.toHaveAttribute('aria-sort');
  });

  it('toggles aria-sort and order; numbers start high to low, text starts A to Z', async () => {
    render(<SortableTable caption="Teams" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    await userEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(sortOf('Team')).toBe('ascending');
    expect(names()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
    await userEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(sortOf('Team')).toBe('descending');
    expect(names()).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);

    await userEvent.click(screen.getByRole('button', { name: 'Wins' }));
    expect(sortOf('Wins')).toBe('descending');
    expect(sortOf('Team')).toBe('none');
    expect(names()).toEqual(['Alpha', 'Bravo', 'Delta', 'Charlie']); // empty values last
    await userEvent.click(screen.getByRole('button', { name: 'Wins' }));
    expect(sortOf('Wins')).toBe('ascending');
    expect(names()).toEqual(['Delta', 'Bravo', 'Alpha', 'Charlie']); // still last
  });

  it('sorts from the keyboard with Enter', async () => {
    render(<SortableTable caption="Teams" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    screen.getByRole('button', { name: 'PF' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(sortOf('PF')).toBe('descending');
    expect(names()).toEqual(['Charlie', 'Bravo', 'Alpha', 'Delta']);
  });

  it('right-aligns numeric cells and honours an initial sort', () => {
    render(<SortableTable caption="Teams" columns={columns} rows={rows} rowKey={(r) => r.id} initialSort={{ key: 'pf', dir: 'asc' }} />);
    expect(names()).toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie']);
    expect(sortOf('PF')).toBe('ascending');
    const cells = within(within(screen.getByRole('table')).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells[0]).not.toHaveClass('n');
    expect(cells[1]).toHaveClass('n');
    expect(cells[2]).toHaveClass('n');
    expect(cells[2]).toHaveTextContent('500.00');
    expect(screen.getByRole('columnheader', { name: /PF/ })).toHaveClass('n');
  });

  it('activates rows with Enter and click', async () => {
    const onRowActivate = vi.fn();
    render(<SortableTable caption="Teams" columns={columns} rows={rows} rowKey={(r) => r.id} onRowActivate={onRowActivate} rowClassName={(r) => (r.id === 1 ? 'me' : undefined)} />);
    const first = within(screen.getByRole('table')).getAllByRole('row')[1];
    expect(first).toHaveClass('click', 'me');
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowActivate).toHaveBeenCalledWith(rows[0]);
    await userEvent.click(within(screen.getByRole('table')).getAllByRole('row')[2]);
    expect(onRowActivate).toHaveBeenLastCalledWith(rows[1]);
  });
});
