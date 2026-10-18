import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SortableTable } from './SortableTable';
import { COLS_KEY } from './useMoreColumns';
import type { Column } from './useSort';

interface Row { name: string; pts: number; team: string }
const rows: Row[] = [{ name: 'ada', pts: 12, team: 'sf' }, { name: 'bo', pts: 9, team: 'gb' }];
const columns: Column<Row>[] = [
  { key: 'name', header: 'player', value: (r) => r.name },
  { key: 'pts', header: 'points', numeric: true, value: (r) => r.pts },
  { key: 'team', header: 'team', value: (r) => r.team, more: true },
];

function table(id = 'demo', defaultMore = false) {
  return <SortableTable caption="Demo" columns={columns} rows={rows} rowKey={(r) => r.name} tableId={id} defaultMore={defaultMore} />;
}

function phone(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: on && q.includes('max-width: 760px'), media: q, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }));
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('more columns', () => {
  it('hides the secondary columns by default and shows them from the toggle', async () => {
    const user = userEvent.setup();
    render(table());
    expect(screen.queryByRole('columnheader', { name: /team/ })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /more columns/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
    expect(screen.getByText('sf')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('remembers the choice per table id in localStorage', async () => {
    const user = userEvent.setup();
    const first = render(table('one'));
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(JSON.parse(window.localStorage.getItem(COLS_KEY)!)).toEqual({ one: true });
    first.unmount();
    // a fresh mount of the same table reads it back; a table with another id is untouched
    render(table('one'));
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
    cleanup();
    render(table('two'));
    expect(screen.queryByRole('columnheader', { name: /team/ })).not.toBeInTheDocument();
  });

  it('survives blocked storage: the choice still holds until the page closes', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const first = render(table('blocked'));
    await user.click(screen.getByRole('button', { name: /more columns/ }));
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
    first.unmount();
    render(table('blocked'));
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('a desktop can default to more; a phone with no saved choice stays minimal', () => {
    phone(false);
    render(table('wide', true));
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
    cleanup();
    phone(true);
    render(table('wide-phone', true));
    expect(screen.queryByRole('columnheader', { name: /team/ })).not.toBeInTheDocument();
  });

  it('a saved choice beats the phone default', () => {
    window.localStorage.setItem(COLS_KEY, JSON.stringify({ saved: true }));
    phone(true);
    render(table('saved'));
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
  });

  it('shows no toggle when no column is secondary, and every column when the table has no id', () => {
    render(<SortableTable caption="Plain" columns={[columns[0], columns[1]]} rows={rows} rowKey={(r) => r.name} tableId="plain" />);
    expect(screen.queryByRole('button', { name: /more columns/ })).not.toBeInTheDocument();
    cleanup();
    render(<SortableTable caption="No id" columns={columns} rows={rows} rowKey={(r) => r.name} />);
    expect(screen.queryByRole('button', { name: /more columns/ })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /team/ })).toBeInTheDocument();
  });

  it('keeps sorting by a column that is hidden', () => {
    render(<SortableTable caption="Demo" columns={columns} rows={rows} rowKey={(r) => r.name} tableId="s" initialSort={{ key: 'team', dir: 'asc' }} />);
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('bo');
  });
});
