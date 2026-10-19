/* Installing the app. Chrome, Edge and Android fire `beforeinstallprompt` once the page qualifies; the event is kept and its prompt is shown when the
   owner taps "install". Safari on iPhone and iPad has no such event: the way in is Share → Add to Home Screen, so the section says that instead.
   `watchInstall()` starts listening at app start (the event can arrive long before front office is opened). */
import { useSyncExternalStore } from 'react';

/** The non-standard event Chromium fires (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export type InstallMode =
  /** running as an installed app (or just installed) */
  | 'installed'
  /** the browser offered an install prompt: show the button */
  | 'prompt'
  /** iPhone or iPad: show the Share → Add to Home Screen steps */
  | 'ios'
  /** nothing to offer (a browser with no install flow, or the page does not qualify yet) */
  | 'unavailable';

interface InstallState { deferred: BeforeInstallPromptEvent | null; installed: boolean }
let state: InstallState = { deferred: null, installed: false };
const listeners = new Set<() => void>();
function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Running as an installed app: a standalone (or fullscreen, or minimal-ui) display mode, or iOS's own flag. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches)) return true;
  } catch { /* no matchMedia */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone, iPod or iPad (an iPad that asks for the desktop site reports a Mac with a touch screen). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

let watching = false;
/** Start listening for `beforeinstallprompt` and `appinstalled`. Safe to call twice. */
export function watchInstall(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the event: the prompt is shown from the install button, not by the browser's own mini bar
    set({ deferred: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => set({ deferred: null, installed: true }));
}

export function installMode(s: InstallState = state): InstallMode {
  if (s.installed || isStandalone()) return 'installed';
  if (s.deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'unavailable';
}

/** Shows the browser's install prompt. Resolves to what the owner chose, or null when there was nothing to show. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  const ev = state.deferred;
  if (!ev) return null;
  set({ deferred: null }); // an event can be used once
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') set({ installed: true });
    return outcome;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** The install state for the UI: the mode, and a function that opens the browser's prompt. Re-renders when the browser offers a prompt or the app gets installed. */
export function useInstall(): { mode: InstallMode; install: () => Promise<'accepted' | 'dismissed' | null> } {
  // the snapshot is the state object itself (stable until something changes); the mode is worked out from it each render, so a change of display mode shows up too
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return { mode: installMode(s), install: promptInstall };
}

/** Test hook. */
export function resetInstallForTests(): void {
  state = { deferred: null, installed: false };
  watching = false;
  listeners.forEach((l) => l());
}
