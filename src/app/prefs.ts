/* Small per-device preferences, kept in localStorage under one key.
   Every access is wrapped: storage can be blocked or full, and the app must still work. */
export const PREFS_KEY = 'wr.prefs.v1';

export interface Prefs {
  /** refresh stale data automatically when the app opens */
  autoRefresh: boolean;
  /** optional URL of a version.json the owner can type in */
  updateUrl: string;
  /** how the non-playoff teams' bracket works: follow the league's own Sleeper bracket ('match'), the toilet bowl (losers advance)
      or a plain consolation bracket (winners advance). Default: the toilet bowl. A device-wide choice, like the other prefs. */
  losers: LosersPref;
}

export type LosersPref = 'match' | 'toilet' | 'consolation';
export const LOSERS_PREFS: readonly LosersPref[] = ['match', 'toilet', 'consolation'];

export const DEFAULT_PREFS: Prefs = { autoRefresh: true, updateUrl: '', losers: 'toilet' };

/** Fired on `window` whenever savePrefs runs, so open pages can follow a change made elsewhere in the app. */
export const PREFS_EVENT = 'wr-prefs';

/** Kept when storage is blocked, so a choice still holds until the page closes. */
let memory: Prefs | null = null;

export function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...(memory ?? DEFAULT_PREFS) };
    const parsed = JSON.parse(raw) as Partial<Prefs> | null;
    return {
      autoRefresh: typeof parsed?.autoRefresh === 'boolean' ? parsed.autoRefresh : DEFAULT_PREFS.autoRefresh,
      updateUrl: typeof parsed?.updateUrl === 'string' ? parsed.updateUrl : DEFAULT_PREFS.updateUrl,
      losers: LOSERS_PREFS.includes(parsed?.losers as LosersPref) ? (parsed!.losers as LosersPref) : DEFAULT_PREFS.losers,
    };
  } catch {
    return { ...(memory ?? DEFAULT_PREFS) };
  }
}

export function savePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...loadPrefs(), ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    memory = null;
  } catch {
    memory = next;
    /* storage unavailable: the choice lasts until the page closes */
  }
  try {
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    /* no window: nothing is listening */
  }
  return next;
}
