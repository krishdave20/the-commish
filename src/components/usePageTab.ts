import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface PageTabOptions {
  /** the search parameter (default "tab") */
  param?: string;
  /** older values that still open a tab, e.g. { live: 'clock' } */
  aliases?: Record<string, string>;
}

/** The current in-page tab, kept in the `?tab=` search parameter so links and the back button work.
    The default tab is left out of the URL, other parameters are kept, and changing tab replaces the history entry
    (a tab is a view of the same place, not a new page). An unknown value reads as the default. */
export function usePageTab<T extends string>(values: readonly T[], defaultTab: T, opts: PageTabOptions = {}): [T, (tab: T) => void] {
  const { param = 'tab', aliases } = opts;
  const [params, setParams] = useSearchParams();
  const raw = params.get(param);
  const named = raw !== null && aliases?.[raw] ? aliases[raw] : raw;
  const tab = (values as readonly string[]).includes(named ?? '') ? (named as T) : defaultTab;
  const setTab = useCallback((next: T) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === defaultTab) out.delete(param); else out.set(param, next);
      return out;
    }, { replace: true });
  }, [setParams, param, defaultTab]);
  return [tab, setTab];
}
