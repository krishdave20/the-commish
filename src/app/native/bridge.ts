/* The iPhone app (ios/, docs/WEB_APP_NOTES.md "The iPhone app"). The built site runs inside a WKWebView; the Swift side injects
   `window.commishNative` before any script runs and listens for messages on `window.webkit.messageHandlers.commish`. Native talks back by
   calling `window.commishNativeReply(id, value)` (answers to `askNative`) and by firing `commish:*` events on window (pull to refresh).
   In a browser every function here is a no-op: `isNativeApp()` is false and `postNative` returns false. */
import type { NativeSnapshot } from './snapshot';

export interface NativeInfo {
  platform: 'ios';
  version: string;
  build: string;
  /** the notification permission, kept current by the app */
  notify?: 'default' | 'granted' | 'denied';
  /** a site page pushed inside the app's own navigation: the app draws the bars, so the page draws none (AppShell) */
  embedded?: boolean;
}

export interface NativeNotice { title: string; body: string; tag: string; to: string }

/** Everything the page can say to the app. */
export type NativeMessage =
  /** everything the native screens and the Live Activity draw (from the hidden feed page, NativeFeed.tsx) */
  | { type: 'snapshot'; snapshot: NativeSnapshot }
  | { type: 'haptic'; style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' }
  | { type: 'notify'; notice: NativeNotice }
  /** a pull to refresh has finished (the app stops its spinner) */
  | { type: 'refreshed' };

/** Questions with an answer: asking for the notification permission (the answer is the new permission). */
export type NativeQuestion = { type: 'notify-request' };

interface Handler { postMessage(m: unknown): void }
type NativeWindow = Window & {
  commishNative?: NativeInfo;
  commishNativeReply?: (id: number, value: unknown) => void;
  webkit?: { messageHandlers?: { commish?: Handler } };
};

const win = (): NativeWindow | null => (typeof window === 'undefined' ? null : (window as NativeWindow));

/** The app's name and version when running inside the iPhone app, else null. */
export function nativeInfo(): NativeInfo | null {
  const w = win();
  return w?.commishNative?.platform === 'ios' && w.webkit?.messageHandlers?.commish ? w.commishNative : null;
}

export const isNativeApp = (): boolean => nativeInfo() !== null;

/** A site page inside the app's navigation (no ticker, pill, top bar, tab bar or footer of its own). */
export const isEmbedded = (): boolean => nativeInfo()?.embedded === true;

/** Sends a message to the app. Returns whether there was an app to send it to; never throws. */
export function postNative(m: NativeMessage | (NativeQuestion & { id: number })): boolean {
  const h = nativeInfo() ? win()?.webkit?.messageHandlers?.commish : undefined;
  if (!h) return false;
  try { h.postMessage(m); return true; } catch { return false; }
}

let nextId = 1;
const waiting = new Map<number, (v: unknown) => void>();

/** Asks the app something and waits for the answer (null outside the app, or after `timeoutMs` with no answer). */
export function askNative<T>(q: NativeQuestion, timeoutMs = 10_000): Promise<T | null> {
  const w = win();
  if (!w || !isNativeApp()) return Promise.resolve(null);
  w.commishNativeReply ??= (id, value) => { waiting.get(id)?.(value); waiting.delete(id); };
  const id = nextId++;
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, timeoutMs);
    waiting.set(id, (v) => { clearTimeout(timer); resolve(v as T); });
    if (!postNative({ ...q, id })) { clearTimeout(timer); waiting.delete(id); resolve(null); }
  });
}

/** Marks the page as running in the app (`html[data-native="ios"]`, and `data-embedded` for a pushed page; phone.css), once at start. */
export function markNative(): void {
  if (!isNativeApp()) return;
  document.documentElement.setAttribute('data-native', 'ios');
  if (isEmbedded()) document.documentElement.setAttribute('data-embedded', '');
}
