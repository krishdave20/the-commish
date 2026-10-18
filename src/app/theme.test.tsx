/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_COLOR, THEME_EVENT, THEME_KEY, applyTheme, loadThemePref, nextThemePref, readToken, resetThemeMemory, resolveTheme, saveThemePref,
} from './theme';
import { useTheme } from './useTheme';

/** a matchMedia whose dark answer can be flipped, with the change listeners the hook needs */
function fakeSystem(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('prefers-color-scheme: dark') ? dark : false,
    media: q,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return { flip(next: boolean) { dark = next; listeners.forEach((cb) => cb()); } };
}

function metas() {
  document.head.innerHTML = `
    <meta name="theme-color" content="${THEME_COLOR.light}" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="${THEME_COLOR.dark}" media="(prefers-color-scheme: dark)">`;
  return Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((m) => m as HTMLMetaElement);
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  resetThemeMemory();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
});

describe('theme preference', () => {
  it('defaults to following the system, with no data-theme on the page', () => {
    fakeSystem(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe('system');
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('resolves system from the media query and follows a change of the system appearance', () => {
    const sys = fakeSystem(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe('dark');
    act(() => sys.flip(false));
    expect(result.current.resolved).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('an override is persisted, applied as data-theme, and wins over the system', () => {
    fakeSystem(true);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setPref('light'));
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(result.current.pref).toBe('light');
    expect(result.current.resolved).toBe('light');

    act(() => result.current.setPref('dark'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(result.current.resolved).toBe('dark');

    act(() => result.current.setPref('system'));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(result.current.resolved).toBe('dark'); // the (dark) system again
  });

  it('a stored override is read back by a fresh mount', () => {
    fakeSystem(false);
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe('dark');
    expect(result.current.resolved).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores a junk stored value', () => {
    window.localStorage.setItem(THEME_KEY, 'sepia');
    expect(loadThemePref()).toBe('system');
  });

  it('cycles system, light, dark and back', () => {
    expect(nextThemePref('system')).toBe('light');
    expect(nextThemePref('light')).toBe('dark');
    expect(nextThemePref('dark')).toBe('system');
    fakeSystem(false);
    const { result } = renderHook(() => useTheme());
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) { act(() => result.current.cycle()); seen.push(result.current.pref); }
    expect(seen).toEqual(['light', 'dark', 'system', 'light']);
  });

  it('every hook follows a change made anywhere (the THEME_EVENT)', () => {
    fakeSystem(false);
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    act(() => a.result.current.setPref('dark'));
    expect(b.result.current.pref).toBe('dark');
    expect(THEME_EVENT).toBe('wr-theme');
  });

  it('keeps the browser chrome colour in step: both metas follow an override and are restored for the system', () => {
    const [light, dark] = metas();
    applyTheme('dark');
    expect(light!.content).toBe(THEME_COLOR.dark);
    expect(dark!.content).toBe(THEME_COLOR.dark);
    applyTheme('light');
    expect(light!.content).toBe(THEME_COLOR.light);
    expect(dark!.content).toBe(THEME_COLOR.light);
    applyTheme('system');
    expect(light!.content).toBe(THEME_COLOR.light);
    expect(dark!.content).toBe(THEME_COLOR.dark);
  });

  it('survives blocked storage: reads fall back to the system, and a choice lasts for the session', () => {
    fakeSystem(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadThemePref()).toBe('system');
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe('system');
    expect(() => act(() => result.current.setPref('dark'))).not.toThrow();
    expect(result.current.pref).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(loadThemePref()).toBe('dark');
    expect(() => saveThemePref('light')).not.toThrow();
    expect(loadThemePref()).toBe('light');
  });

  it('resolves without a matchMedia (jsdom, server) as light', () => {
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('reads a token off the page, with a fallback', () => {
    document.documentElement.style.setProperty('--probe', ' #123456 ');
    expect(readToken('--probe')).toBe('#123456');
    expect(readToken('--nope', '#000')).toBe('#000');
    document.documentElement.style.removeProperty('--probe');
  });
});

describe('the pre-paint script in index.html', () => {
  const html = readFileSync(`${process.cwd()}/index.html`, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;

  function run() { new Function(script)(); }

  it('uses the same storage key and chrome colours as theme.ts', () => {
    expect(script).toContain(`'${THEME_KEY}'`);
    expect(script).toContain(`'${THEME_COLOR.dark}'`);
    expect(script).toContain(`'${THEME_COLOR.light}'`);
    expect(html).toContain('<meta name="color-scheme" content="light dark"');
    expect(html).toContain(`content="${THEME_COLOR.light}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${THEME_COLOR.dark}" media="(prefers-color-scheme: dark)"`);
  });

  it('applies a stored override, and the chrome colour, and leaves system alone', () => {
    const [light, dark] = metas();
    window.localStorage.setItem(THEME_KEY, 'dark');
    run();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect([light!.content, dark!.content]).toEqual([THEME_COLOR.dark, THEME_COLOR.dark]);

    document.documentElement.removeAttribute('data-theme');
    window.localStorage.setItem(THEME_KEY, 'system');
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    window.localStorage.setItem(THEME_KEY, 'junk');
    run();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(run).not.toThrow();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
