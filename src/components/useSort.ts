import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type SortDir = 'asc' | 'desc';
export interface SortState { key: string; dir: SortDir }

export interface Column<T> {
  key: string;
  header: string;
  /** right-aligned, tabular numbers; sorts high to low on the first click */
  numeric?: boolean;
  /** default true; false renders a plain header */
  sortable?: boolean;
  /** the value to sort by (and to show when there is no render) */
  value?: (row: T) => number | string | null | undefined;
  render?: (row: T) => ReactNode;
  className?: string;
  /** a secondary column: hidden until "more columns" is on (needs a `tableId` on the table) */
  more?: boolean;
}

function compare(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/** Sort state and the sorted rows. Clicking the same column flips the direction; empty values always sort last. */
export function useSort<T>(rows: T[], columns: Column<T>[], initial: SortState | null = null) {
  const [sort, setSort] = useState<SortState | null>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.value) return rows;
    const get = col.value;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((r1, r2) => {
      const a = get(r1);
      const b = get(r2);
      const aNone = a === null || a === undefined || a === '';
      const bNone = b === null || b === undefined || b === '';
      if (aNone || bNone) return aNone === bNone ? 0 : aNone ? 1 : -1;
      return sign * compare(a, b);
    });
  }, [rows, columns, sort]);

  function toggle(key: string) {
    const col = columns.find((c) => c.key === key);
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: col?.numeric ? 'desc' : 'asc' };
    });
  }

  function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
    if (sort?.key !== key) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  return { sorted, sort, toggle, ariaSort };
}
