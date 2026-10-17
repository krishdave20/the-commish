import { useCallback, useState } from 'react';

const key = (leagueId: string) => `wr.prep.${leagueId}`;

function read(leagueId: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(key(leagueId)) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** The pre-draft prep checklist's ticked items, kept per league in localStorage. */
export function usePrepChecks(leagueId: string): { done: Set<string>; toggle: (id: string) => void } {
  const [state, setState] = useState(() => ({ leagueId, ids: read(leagueId) }));
  let ids = state.ids;
  if (state.leagueId !== leagueId) { ids = read(leagueId); setState({ leagueId, ids }); }
  const toggle = useCallback((id: string) => {
    setState((prev) => {
      const cur = prev.leagueId === leagueId ? prev.ids : read(leagueId);
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try { window.localStorage.setItem(key(leagueId), JSON.stringify(next)); } catch { /* storage unavailable: ticks last until the page closes */ }
      return { leagueId, ids: next };
    });
  }, [leagueId]);
  return { done: new Set(ids), toggle };
}
