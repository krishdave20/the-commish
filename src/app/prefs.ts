/* Small per-device preferences, kept in localStorage under one key.
   Every access is wrapped: storage can be blocked or full, and the app must still work. */
export const PREFS_KEY = 'wr.prefs.v1';

export interface Prefs {
  /** refresh stale data automatically when the app opens */
  autoRefresh: boolean;
  /** optional URL of a version.json the owner can type in */
  updateUrl: string;
}

export const DEFAULT_PREFS: Prefs = { autoRefresh: true, updateUrl: '' };

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    return {
      autoRefresh: typeof parsed?.autoRefresh === 'boolean' ? parsed.autoRefresh : DEFAULT_PREFS.autoRefresh,
      updateUrl: typeof parsed?.updateUrl === 'string' ? parsed.updateUrl : DEFAULT_PREFS.updateUrl,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
  return next;
}
