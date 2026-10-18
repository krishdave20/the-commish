/* Appearance: follow the system (the default), or force light or dark.
   The choice lives in localStorage under its own key (like the ticker's), and the page carries it as data-theme on <html> ONLY when the
   owner has overridden the system; with no attribute the media query in tokens.css decides. An inline script in index.html applies the stored
   override before the first paint, so there is no flash of the wrong theme. Every access to storage is wrapped: it can be blocked or full,
   and the app must still work (the choice then lasts until the page closes). */
export type ThemePref = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = 'wr.theme.v1';
export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark'];
export const DEFAULT_THEME: ThemePref = 'system';
/** Fired on `window` whenever the preference changes, so every toggle and hook follows. */
export const THEME_EVENT = 'wr-theme';
export const DARK_QUERY = '(prefers-color-scheme: dark)';
/** The browser chrome colour for each look (= --paper). index.html carries the same two values in its theme-color metas and pre-paint script. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f4f1eb', dark: '#171512' };

/** Kept when storage is blocked, so a choice still holds until the page closes. */
let memory: ThemePref | null = null;

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === 'string' && (THEME_PREFS as readonly string[]).includes(v);
}

export function loadThemePref(): ThemePref {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (isThemePref(raw)) return raw;
    return memory ?? DEFAULT_THEME;
  } catch {
    return memory ?? DEFAULT_THEME;
  }
}

/** The next look in the cycle system, light, dark, system. */
export function nextThemePref(pref: ThemePref): ThemePref {
  return THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]!;
}

/** What the system asks for now. Light where the browser cannot say (jsdom, server). */
export function systemTheme(): ResolvedTheme {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

/** Put the preference on the page: data-theme only for an override, and the theme-color metas to match. */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  for (const meta of Array.from(document.querySelectorAll('meta[name="theme-color"]'))) {
    // with the system in charge each meta keeps the colour for its own media query
    const own: ResolvedTheme = (meta.getAttribute('media') ?? '').includes('dark') ? 'dark' : 'light';
    meta.setAttribute('content', THEME_COLOR[pref === 'system' ? own : pref]);
  }
}

/** Remember the choice, put it on the page and tell everyone listening. */
export function saveThemePref(pref: ThemePref): ThemePref {
  try {
    window.localStorage.setItem(THEME_KEY, pref);
    memory = null;
  } catch {
    memory = pref;
    /* storage unavailable: the choice lasts until the page closes */
  }
  applyTheme(pref);
  try {
    window.dispatchEvent(new Event(THEME_EVENT));
  } catch {
    /* no window: nothing is listening */
  }
  return pref;
}

/** Test hook: forget the in-memory fallback. */
export function resetThemeMemory(): void {
  memory = null;
}

/** The value of a CSS token as the page resolves it right now (for the few places that must hand a colour to JS, such as a d3 scale).
    Read it again when the theme changes: useTheme().resolved re-renders on every switch. */
export function readToken(name: string, fallback = ''): string {
  try {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}
