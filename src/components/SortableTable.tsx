import { Fragment, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MoreColumns } from './MoreColumns';
import { DetailRow, ExpandCell } from './RowExpand';
import { onOwnControl, useExpanded } from './expandState';
import { usePhone } from './useMediaQuery';
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
  const phone = usePhone();
  // a phone shows only the columns marked `essential`; a tap on a row opens the others under it (no sideways scrolling)
  const essential = all.filter((c) => c.essential);
  const compact = phone && essential.length > 0 && essential.length < all.length;
  const hasMore = !compact && !!tableId && all.some((c) => c.more);
  const more = useMoreColumns(hasMore ? tableId : undefined, defaultMore);
  const columns = compact ? essential : hasMore && !more.on ? all.filter((c) => !c.more) : all;
  const tucked = compact ? all.filter((c) => !c.essential) : [];
  const { sorted, toggle, ariaSort, sort } = useSort(rows, all, initialSort);
  const expanded = useExpanded();
  const base = useId();

  /** what a row tap does: open the details on a phone, else the page's own action */
  const tap = (row: T) => (compact ? expanded.toggle(rowKey(row)) : onRowActivate?.(row));
  const interactive = compact || !!onRowActivate;
  // what a row is called, for the button that opens it: the first text column ("team", "player"), not the rank
  const nameCol = all.find((c) => !c.numeric && c.value) ?? all[0];
  const name = (row: T): string => String(nameCol?.value?.(row) ?? '');

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, row: T) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tap(row);
    }
  }

  return (
    <>
    {hasMore && <MoreColumns on={more.on} onToggle={more.toggle} label={caption.toLowerCase()} />}
    <div className="tw" data-compact={compact ? 'true' : undefined}>
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
            {compact && <th scope="col" className="xc"><span className="sr-only">details</span></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map((row) => {
            const k = rowKey(row);
            const open = compact && expanded.isOpen(k);
            const detail = `${base}-${k}`;
            return (
              <Fragment key={k}>
                <tr
                  className={[interactive ? 'click' : '', open ? 'xopen' : '', rowClassName?.(row) ?? ''].filter(Boolean).join(' ') || undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={interactive ? (e) => { if (!(compact && onOwnControl(e))) tap(row); } : undefined}
                  onKeyDown={interactive ? (e) => onRowKey(e, row) : undefined}
                >
                  {columns.map((c) => {
                    const cls = [c.numeric ? 'n' : '', c.className ?? ''].filter(Boolean).join(' ') || undefined;
                    return <td key={c.key} className={cls}>{c.render ? c.render(row) : (c.value?.(row) ?? '')}</td>;
                  })}
                  {compact && <ExpandCell open={open} controls={detail} label={`${open ? 'hide' : 'show'} details for ${name(row)}`} onToggle={() => expanded.toggle(k)} />}
                </tr>
                {open && (
                  <DetailRow id={detail} colSpan={columns.length + 1} items={tucked.map((c) => ({ label: c.header, value: c.render ? c.render(row) : (c.value?.(row) ?? '') }))}>
                    {onRowActivate && <button type="button" className="btn xrow-act" onClick={() => onRowActivate(row)}>open {name(row) || 'details'}</button>}
                  </DetailRow>
                )}
              </Fragment>
            );
          })}
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
