import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  DARK_QUERY, THEME_EVENT, applyTheme, loadThemePref, nextThemePref, saveThemePref, systemTheme,
  type ResolvedTheme, type ThemePref,
} from './theme';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener('storage', cb); // another tab changed it
  let mq: MediaQueryList | null = null;
  try {
    mq = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  } catch {
    mq = null;
  }
  mq?.addEventListener?.('change', cb); // the system flipped (sunset, a menu-bar toggle)
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener('storage', cb);
    mq?.removeEventListener?.('change', cb);
  };
}

export interface UseTheme {
  /** what the owner chose: system (the default), light or dark */
  pref: ThemePref;
  /** the look actually showing right now */
  resolved: ResolvedTheme;
  setPref: (pref: ThemePref) => void;
  /** system, then light, then dark, then back to system */
  cycle: () => void;
}

export function useTheme(): UseTheme {
  const pref = useSyncExternalStore(subscribe, loadThemePref, () => 'system' as ThemePref);
  const system = useSyncExternalStore(subscribe, systemTheme, () => 'light' as const);
  // keep the page in step with the stored choice (another tab, or an inline script that did not run)
  useEffect(() => applyTheme(pref), [pref]);
  const setPref = useCallback((next: ThemePref) => { saveThemePref(next); }, []);
  const cycle = useCallback(() => { saveThemePref(nextThemePref(loadThemePref())); }, []);
  return { pref, resolved: pref === 'system' ? system : pref, setPref, cycle };
}
