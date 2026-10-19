/* Registers the service worker and tells the page when a new one is waiting. Every call is guarded: no `navigator.serviceWorker` (jsdom, an old
   browser, a private window that blocks workers) means nothing happens, and a failed registration never reaches the app.

   Update flow: a new worker installs in the background and waits. `useSwUpdate()` turns true, the update prompt shows "a new version is ready ·
   reload", and `applyUpdate()` tells the waiting worker to take over, then reloads once it has. Registered only in a production build. */
import { useSyncExternalStore } from 'react';
import { SKIP_WAITING } from './swRoutes';

export type SwStatus = 'unsupported' | 'idle' | 'registering' | 'ready' | 'error';

interface SwState { status: SwStatus; waiting: ServiceWorker | null }
let state: SwState = { status: 'idle', waiting: null };
const listeners = new Set<() => void>();
function set(next: Partial<SwState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeSw(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
export const getSwState = (): SwState => state;

/** True when a new version is installed and waiting for the reload. */
export function useSwUpdate(): boolean {
  return useSyncExternalStore(subscribeSw, () => state.waiting !== null, () => false);
}
/** What the worker is doing: 'ready' means the app is saved for offline use. */
export function useSwStatus(): SwStatus {
  return useSyncExternalStore(subscribeSw, () => state.status, () => 'idle');
}

export function swSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !!navigator.serviceWorker;
}

/** How often an open app asks whether a newer worker exists (it also asks on load and whenever it comes back to the front). */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;

export interface RegisterOptions {
  /** the worker's URL, relative to the page (default: sw.js next to index.html, under any base path) */
  url?: string;
  /** register even when this is not a production build (tests) */
  force?: boolean;
}

/** A worker that has just installed is only offered once it has stayed in the waiting room this long. Chromium sometimes finds a copy of the same file right
    after an update and activates it at once (nothing is left open for it to wait for); that one must not flash a prompt. */
export const WAITING_SETTLE_MS = 250;

function watch(reg: ServiceWorkerRegistration) {
  // a worker already waiting from an earlier visit
  const early = reg.waiting;
  if (early && navigator.serviceWorker.controller) {
    set({ waiting: early });
    early.addEventListener('statechange', () => { if ((early.state === 'activated' || early.state === 'redundant') && state.waiting === early) set({ waiting: null }); });
  }
  reg.addEventListener('updatefound', () => {
    const next = reg.installing;
    if (!next) return;
    next.addEventListener('statechange', () => {
      // 'installed' with a controller already in charge: this is an update, and it waits for the reload
      if (next.state === 'installed' && navigator.serviceWorker.controller) {
        setTimeout(() => { if (next.state === 'installed' && (reg.waiting ?? next) === next) set({ waiting: next }); }, WAITING_SETTLE_MS);
      }
      // it took over (or was replaced): nothing is waiting any more
      if ((next.state === 'activated' || next.state === 'redundant') && state.waiting === next) set({ waiting: null });
    });
  });
  const check = () => { reg.update().catch(() => { /* offline: try again later */ }); };
  const timer = setInterval(check, UPDATE_CHECK_MS);
  const visible = () => { if (document.visibilityState === 'visible') check(); };
  document.addEventListener('visibilitychange', visible);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
}

let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registers the worker once the page has loaded (so the precache download does not compete with the first paint). Resolves to the registration,
    or null when there is no worker support, this is not a production build, or registering failed. Safe to call twice. */
export function registerServiceWorker(opts: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  if (!swSupported()) { set({ status: 'unsupported' }); return Promise.resolve(null); }
  if (!opts.force && !import.meta.env.PROD) return Promise.resolve(null);
  if (registering) return registering;
  set({ status: 'registering' });
  registering = new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve(); else window.addEventListener('load', () => resolve(), { once: true });
  })
    .then(() => {
      const url = new URL(opts.url ?? `${import.meta.env.BASE_URL}sw.js`, document.baseURI);
      // the scope is the folder the worker sits in: /the-commish/ on GitHub Pages. updateViaCache none: always ask the server for sw.js itself.
      return navigator.serviceWorker.register(url.href, { updateViaCache: 'none' });
    })
    .then((reg) => {
      watch(reg);
      // 'ready' once a worker is active: from then on the app opens offline
      if (reg.active) set({ status: 'ready' });
      else Promise.resolve(navigator.serviceWorker.ready).then(() => set({ status: 'ready' }), () => { /* stays 'registering' */ });
      return reg;
    })
    .catch(() => {
      set({ status: 'error' });
      return null;
    });
  return registering;
}

/** The "reload" of the update prompt: the waiting worker takes over, and the page reloads once it controls it. */
export function applyUpdate(reload: () => void = () => location.reload()): void {
  const waiting = state.waiting;
  if (!waiting || !swSupported()) { reload(); return; }
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    // the new worker claims the page while it is still "activating"; reloading in that moment makes Chromium look for yet another update and find
    // a copy of the same file, which would offer the same prompt again. Wait until it has finished activating.
    const sw = navigator.serviceWorker.controller;
    if (!sw || sw.state === 'activated') { reload(); return; }
    const done = () => { if (sw.state === 'activated' || sw.state === 'redundant') { sw.removeEventListener('statechange', done); reload(); } };
    sw.addEventListener('statechange', done);
  });
  waiting.postMessage({ type: SKIP_WAITING });
}

/** Test hook: forget everything (a fresh module state without re-importing). */
export function resetSwForTests(): void {
  registering = null;
  state = { status: 'idle', waiting: null };
  listeners.forEach((l) => l());
}
