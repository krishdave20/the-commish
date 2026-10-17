import { useCallback, useState } from 'react';
import type { Scenario } from '../../engine';

export interface SavedScenario {
  name: string;
  odds: number;
  expW: number;
  /** average points per playoff week of the lineup */
  po: number;
  scenario: Scenario;
}

const key = (leagueId: string) => `wr.saved.${leagueId}`;

function read(leagueId: string): SavedScenario[] {
  try {
    const raw = window.localStorage.getItem(key(leagueId));
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as SavedScenario[]) : [];
  } catch {
    return [];
  }
}

/** The what-ifs a manager saved to compare, kept per league in localStorage. */
export function useSaved(leagueId: string) {
  const [list, setList] = useState<SavedScenario[]>(() => read(leagueId));
  const update = useCallback((fn: (l: SavedScenario[]) => SavedScenario[]) => {
    setList((prev) => {
      const next = fn(prev);
      try { window.localStorage.setItem(key(leagueId), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [leagueId]);
  return { list, update };
}
