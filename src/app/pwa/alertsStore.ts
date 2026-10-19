/* The alerts switch and the scheduler's memory, on this device. Its own keys, so the shared prefs stay untouched. Every access is wrapped:
   storage can be blocked, and the app must still work (the choice then lasts until the page closes). */
import { useSyncExternalStore } from 'react';
import { EMPTY_MEMORY } from './alerts';
import type { AlertMemory } from './alerts';

export const ALERTS_KEY = 'wr.alerts.v1';
export const ALERTS_MEMORY_KEY = 'wr.alerts.mem.v1';
export const ALERTS_EVENT = 'wr-alerts';

/** Kept only when a write to storage failed: the choice (and the scheduler's memory) then lasts until the page closes. */
let enabledMemory: boolean | null = null;
let schedulerMemory: AlertMemory | null = null;

export function loadAlertsEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(ALERTS_KEY);
    return raw === null ? (enabledMemory ?? false) : raw === 'on';
  } catch {
    return enabledMemory ?? false;
  }
}

export function saveAlertsEnabled(on: boolean): void {
  try { window.localStorage.setItem(ALERTS_KEY, on ? 'on' : 'off'); enabledMemory = null; } catch { enabledMemory = on; /* storage unavailable */ }
  try { window.dispatchEvent(new Event(ALERTS_EVENT)); } catch { /* no window */ }
}

export function loadAlertMemory(): AlertMemory {
  try {
    const raw = window.localStorage.getItem(ALERTS_MEMORY_KEY);
    if (!raw) return schedulerMemory ?? EMPTY_MEMORY;
    const p = JSON.parse(raw) as Partial<AlertMemory> | null;
    return {
      sent: p && typeof p.sent === 'object' && p.sent !== null ? (p.sent as Record<string, number>) : {},
      lastAt: typeof p?.lastAt === 'number' ? p.lastAt : 0,
      clockOn: p?.clockOn === true,
    };
  } catch {
    return schedulerMemory ?? EMPTY_MEMORY;
  }
}

export function saveAlertMemory(m: AlertMemory): void {
  try { window.localStorage.setItem(ALERTS_MEMORY_KEY, JSON.stringify(m)); schedulerMemory = null; } catch { schedulerMemory = m; /* storage unavailable */ }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(ALERTS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(ALERTS_EVENT, cb); window.removeEventListener('storage', cb); };
}

/** Whether the owner switched alerts on (live). */
export function useAlertsEnabled(): boolean {
  return useSyncExternalStore(subscribe, loadAlertsEnabled, () => false);
}
