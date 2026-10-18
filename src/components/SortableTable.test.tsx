import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SortableTable } from './SortableTable';
import type { Column } from './useSort';

afterEach(cleanup);

interface Row { name: string; pts: number }
const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({ name: `p${String(i).padStart(2, '0')}`, pts: i }));
const columns: Column<Row>[] = [
  { key: 'name', header: 'player', value: (r) => r.name },
  { key: 'pts', header: 'points', numeric: true, value: (r) => r.pts },
];

describe('SortableTable pageSize', () => {
  it('draws a first page and grows by a page on “show more”', async () => {
    const user = userEvent.setup();
    render(<SortableTable caption="Demo" columns={columns} rows={rows} rowKey={(r) => r.name} pageSize={15} />);
    const table = screen.getByRole('table', { name: 'Demo' });
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 15);
    expect(screen.getByText('showing 15 of 40')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'show 15 more' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 30);
    await user.click(screen.getByRole('button', { name: 'show 10 more' }));
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 40);
    expect(screen.queryByRole('button', { name: /show/ })).not.toBeInTheDocument();
  });

  it('sorts all the rows, then takes the first page (so the best row is never hidden by the cut)', async () => {
    const user = userEvent.setup();
    render(<SortableTable caption="Demo" columns={columns} rows={rows} rowKey={(r) => r.name} pageSize={5} initialSort={{ key: 'name', dir: 'asc' }} />);
    await user.click(screen.getByRole('button', { name: /^points/ }));
    const first = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(first).toHaveTextContent('p39');
  });

  it('shows every row when there is no page size', () => {
    render(<SortableTable caption="Demo" columns={columns} rows={rows} rowKey={(r) => r.name} />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(41);
  });
});
