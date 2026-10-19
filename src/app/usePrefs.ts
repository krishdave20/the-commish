import { useSyncExternalStore } from 'react';
import { DEFAULT_PREFS, PREFS_EVENT, loadPrefs } from './prefs';
import type { Prefs } from './prefs';

let cached: Prefs | null = null;
let cachedKey = '';
function snapshot(): Prefs {
  // useSyncExternalStore wants the same object until the value changes
  const next = loadPrefs();
  const key = JSON.stringify(next);
  if (cached === null || key !== cachedKey) { cached = next; cachedKey = key; }
  return cached;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener('storage', cb); };
}

/** The device's small preferences, live: re-renders when savePrefs runs anywhere in the app. */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFS);
}
