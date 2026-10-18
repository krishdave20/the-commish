/* The debug clock. `?now=2026-10-20T20:00` (local time of the browser) makes the moments, the huddle sentence and the live activity think
   it is that moment; the clock then keeps running from there. `?now=live` (or `?now=`) goes back to the real clock. It works in the
   production build too, on purpose: the owner can preview a week on the real site. The choice is kept in sessionStorage so it survives
   moving between pages (a hash route drops its query) and ends with the tab. Only the clock changes: the data is today's. */
const KEY = 'wr.moments.now';
export const NOW_EVENT = 'wr-now';

interface Override { at: number; startedAt: number }
let current: Override | null | undefined;

/** "2026-10-20T20:00" (local), or a full ISO string, as epoch ms; null for anything else. */
export function parseNow(raw: string | null | undefined): number | null {
  const v = (raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v)) return null;
  const t = Date.parse(v.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

function read(): Override | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Override>) : null;
    return v && typeof v.at === 'number' && typeof v.startedAt === 'number' ? { at: v.at, startedAt: v.startedAt } : null;
  } catch {
    return null;
  }
}

function load(): Override | null {
  if (current === undefined) current = typeof window === 'undefined' ? null : read();
  return current;
}

/** Apply a `now` query value: a time sets the override, `live` or an empty value clears it, null (no param) changes nothing.
    Returns whether the clock changed; `notify` false skips the change event. */
export function applyNowParam(raw: string | null, notify = true): boolean {
  if (raw === null) return false;
  const t = parseNow(raw);
  const next = t === null ? null : { at: t, startedAt: Date.now() };
  const prev = load();
  if ((prev?.at ?? null) === (next?.at ?? null)) return false;
  current = next;
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next)); else window.sessionStorage.removeItem(KEY);
  } catch { /* storage blocked: the preview lasts until the page reloads */ }
  // not while rendering (the first read of a page load): a listener's setState would land in the middle of another component's render
  if (notify) try { window.dispatchEvent(new Event(NOW_EVENT)); } catch { /* no window */ }
  return true;
}

/** The first page load may carry `?now=` before the hash (`/?now=…#/`) as well as inside it (`#/?now=…`). */
export function nowParamFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const outer = new URLSearchParams(window.location.search).get('now');
  if (outer !== null) return outer;
  const h = window.location.hash;
  const q = h.indexOf('?');
  return q >= 0 ? new URLSearchParams(h.slice(q + 1)).get('now') : null;
}

/** The time the app should act on: the real clock, or the preview clock running on from the chosen instant. */
export function currentNow(): number {
  const o = load();
  return o ? o.at + (Date.now() - o.startedAt) : Date.now();
}

export const isNowOverridden = (): boolean => load() !== null;

/** Test helper: forget everything held in memory. */
export function resetNowOverride(): void {
  current = undefined;
  try { window.sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
