import { useCallback, useState } from 'react';
import { useMediaQuery } from './useMediaQuery';

export const COLS_KEY = 'wr.cols.v1';
const PHONE = '(max-width: 760px)';

/** Kept when storage is blocked, so a choice still holds until the page closes. */
const memory: Record<string, boolean> = {};

function readAll(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(COLS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function write(id: string, on: boolean): void {
  try {
    window.localStorage.setItem(COLS_KEY, JSON.stringify({ ...readAll(), [id]: on }));
    delete memory[id];
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
    memory[id] = on;
  }
}

/** Whether a table shows its secondary columns, remembered per table id on this device. With no saved choice a phone shows
    the minimal set; a desktop shows what `defaultOn` says (the minimal set unless a table can afford more). */
export function useMoreColumns(id: string | undefined, defaultOn = false): { on: boolean; toggle: () => void } {
  const phone = useMediaQuery(PHONE);
  const [saved, setSaved] = useState<boolean | undefined>(() => (id ? (readAll()[id] ?? memory[id]) : undefined));
  const on = saved ?? (phone ? false : defaultOn);
  const toggle = useCallback(() => {
    if (!id) return;
    setSaved(!on);
    write(id, !on);
  }, [id, on]);
  return { on, toggle };
}
