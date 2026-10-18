import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'wr.ticker.v1';
const listeners = new Set<() => void>();
/** kept when storage is blocked, so the choice lasts until the page closes */
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try { return window.localStorage.getItem(KEY) === 'collapsed'; } catch { return false; }
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Whether the ticker is folded away, remembered on this device. The shell and the ticker share one value. */
export function useTickerCollapsed(): [boolean, (v: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((v: boolean) => {
    memory = v;
    try { window.localStorage.setItem(KEY, v ? 'collapsed' : 'open'); memory = null; } catch { /* not saved: memory holds it */ }
    for (const l of listeners) l();
  }, []);
  return [collapsed, set];
}
