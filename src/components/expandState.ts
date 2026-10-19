import { useCallback, useState } from 'react';
import type { MouseEvent } from 'react';

/** Tap-to-expand rows, for tables on a phone: the row keeps the few columns that answer the question, and a tap opens the rest under it.
    The components are in RowExpand.tsx; SortableTable and the draft rankings use both. */

export type RowKey = string | number;

export function useExpanded() {
  const [open, setOpen] = useState<ReadonlySet<RowKey>>(() => new Set());
  const isOpen = useCallback((k: RowKey) => open.has(k), [open]);
  const toggle = useCallback((k: RowKey) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  }), []);
  return { isOpen, toggle };
}

/** Whether a click landed on something with a job of its own (a player link, a button, a field), which a row tap must leave alone. */
export function onOwnControl(e: MouseEvent): boolean {
  const t = e.target;
  return t instanceof Element && !!t.closest('a, button, input, select, textarea, label, summary');
}
