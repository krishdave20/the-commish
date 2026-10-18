import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MoreColumns } from './MoreColumns';
import { useMoreColumns } from './useMoreColumns';
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
  /** names this table for "more columns": columns marked `more` show only when it is on, remembered per id on this device */
  tableId?: string;
  /** whether a desktop shows the `more` columns with no saved choice (phones never do) */
  defaultMore?: boolean;
  /** draw this many rows at first (after sorting); "show more" adds as many again */
  pageSize?: number;
}

/** A table with sortable column headers. Headers are buttons (Enter and Space work) and carry aria-sort. */
export function SortableTable<T>({ columns: all, rows, rowKey, caption, initialSort = null, rowClassName, onRowActivate, tableId, defaultMore = false, pageSize }: Props<T>) {
  const [limit, setLimit] = useState(pageSize ?? Infinity);
  const hasMore = !!tableId && all.some((c) => c.more);
  const more = useMoreColumns(hasMore ? tableId : undefined, defaultMore);
  const columns = hasMore && !more.on ? all.filter((c) => !c.more) : all;
  const { sorted, toggle, ariaSort, sort } = useSort(rows, all, initialSort);

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowActivate?.(row);
    }
  }

  return (
    <>
    {hasMore && <MoreColumns on={more.on} onToggle={more.toggle} label={caption.toLowerCase()} />}
    <div className="tw">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false && !!c.value;
              return (
                <th
                  key={c.key} scope="col" className={[c.numeric ? 'n' : '', ...(c.className?.split(' ').filter((k) => k === 'hide-sm' || k === 'sticky-col') ?? [])].filter(Boolean).join(' ') || undefined}
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
          {sorted.slice(0, limit).map((row) => (
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
    {sorted.length > limit && (
      <div className="row">
        <button type="button" className="btn" onClick={() => setLimit((n) => n + (pageSize ?? n))}>show {Math.min(pageSize ?? 0, sorted.length - limit)} more</button>
        <span className="note">showing {limit} of {sorted.length}</span>
      </div>
    )}
    </>
  );
}
