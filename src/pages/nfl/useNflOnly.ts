import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'wr.nfl.only.v1';
const listeners = new Set<() => void>();
/** kept when storage is blocked, so the choice lasts until the page closes */
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try { return window.localStorage.getItem(KEY) === 'on'; } catch { return false; }
}
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** "nfl only": hides every fantasy overlay on the nfl page (owners, your-players counts, the fantasy sections of a game). Remembered on this device. */
export function useNflOnly(): [boolean, (v: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback((v: boolean) => {
    memory = v;
    try { window.localStorage.setItem(KEY, v ? 'on' : 'off'); memory = null; } catch { /* not saved: memory holds it */ }
    for (const l of listeners) l();
  }, []);
  return [on, set];
}
