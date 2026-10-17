import type { KeyboardEvent } from 'react';
import { useSort } from './useSort';
import type { Column, SortState } from './useSort';

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** accessible table name */
  caption: string;
  initialSort?: SortState | null;
  rowClassName?: (row: T) => string | undefined;
  /** makes rows focusable; Enter or Space on a row calls it */
  onRowActivate?: (row: T) => void;
}

/** A table with sortable column headers. Headers are buttons (Enter and Space work) and carry aria-sort. */
export function SortableTable<T>({ columns, rows, rowKey, caption, initialSort = null, rowClassName, onRowActivate }: Props<T>) {
  const { sorted, toggle, ariaSort, sort } = useSort(rows, columns, initialSort);

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowActivate?.(row);
    }
  }

  return (
    <div className="tw">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false && !!c.value;
              return (
                <th
                  key={c.key} scope="col" className={c.numeric ? 'n' : undefined}
                  aria-sort={sortable ? ariaSort(c.key) : undefined}
                >
                  {sortable ? (
                    <button type="button" className="th-btn" onClick={() => toggle(c.key)}>
                      {c.header}
                      <span className="sort-ind" aria-hidden="true">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={[onRowActivate ? 'click' : '', rowClassName?.(row) ?? ''].filter(Boolean).join(' ') || undefined}
              tabIndex={onRowActivate ? 0 : undefined}
              onClick={onRowActivate ? () => onRowActivate(row) : undefined}
              onKeyDown={onRowActivate ? (e) => onRowKey(e, row) : undefined}
            >
              {columns.map((c) => {
                const cls = [c.numeric ? 'n' : '', c.className ?? ''].filter(Boolean).join(' ') || undefined;
                return <td key={c.key} className={cls}>{c.render ? c.render(row) : (c.value?.(row) ?? '')}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
