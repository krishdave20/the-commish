/* Time-zone-aware calendar helpers for the moments engine. Pure: every function takes the instant and the zone, nothing reads the clock.
   The browser's Intl does the zone arithmetic (no date library), so daylight saving time is handled by the platform. */

const H = 3_600_000;
export const HOUR = H;
export const DAY = 24 * H;

export interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DAY_NAMES = ['', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Calendar parts of an instant in a zone. `weekday` is ISO: 1 = Monday … 7 = Sunday. */
export function zonedParts(ms: number, tz: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(ms)) out[p.type] = p.value;
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour) % 24, minute: Number(out.minute), second: Number(out.second), weekday: WEEKDAYS[out.weekday ?? ''] ?? 1,
  };
}

/** The instant at which the wall clock in `tz` reads the given date and time (day and month overflow roll over like Date.UTC). */
export function zonedToMs(year: number, month: number, day: number, hour: number, minute: number, tz: string): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  // two passes settle on the right offset even across a daylight saving change
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, tz);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += wall - shown;
  }
  return guess;
}

/** Midnight at the start of the local day that contains `ms`, plus `plusDays` days. */
export function startOfDay(ms: number, tz: string, plusDays = 0): number {
  const p = zonedParts(ms, tz);
  return zonedToMs(p.year, p.month, p.day + plusDays, 0, 0, tz);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of an instant in a zone. */
export const weekdayOf = (ms: number, tz: string): number => zonedParts(ms, tz).weekday;
export const dayName = (weekday: number): string => DAY_NAMES[weekday] ?? '';

/** The first instant strictly after `after` at which the wall clock in `tz` reads `hour:minute` on ISO weekday `weekday`. */
export function nextWeekdayAt(after: number, weekday: number, hour: number, minute: number, tz: string): number {
  const p = zonedParts(after, tz);
  const ahead = (weekday - p.weekday + 7) % 7;
  let t = zonedToMs(p.year, p.month, p.day + ahead, hour, minute, tz);
  if (t <= after) t = zonedToMs(p.year, p.month, p.day + ahead + 7, hour, minute, tz);
  return t;
}

/** The last instant at or before `at` (inclusive) that is `hour:minute` on ISO weekday `weekday` in `tz`. */
export function prevWeekdayAt(at: number, weekday: number, hour: number, minute: number, tz: string): number {
  const p = zonedParts(at, tz);
  const back = (p.weekday - weekday + 7) % 7;
  let t = zonedToMs(p.year, p.month, p.day - back, hour, minute, tz);
  if (t > at) t = zonedToMs(p.year, p.month, p.day - back - 7, hour, minute, tz);
  return t;
}

const clean = (s: string) => s.replace(/[  ]/g, ' ').toLowerCase();

/** "7:15 pm" (the viewer's zone), or "2:00 am". */
export function formatClock(ms: number, tz: string): string {
  return clean(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms));
}

/** "thursday 7:15 pm". */
export function formatDayClock(ms: number, tz: string): string {
  return `${dayName(weekdayOf(ms, tz))} ${formatClock(ms, tz)}`;
}

/** "tue oct 20, 8:00 pm" for the preview note. */
export function formatStamp(ms: number, tz: string): string {
  return clean(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms)).replace(/^(\w+), /, '$1 ');
}

/** When an event is, in plain words relative to now: "tonight at 2:00 am" is how the waivers read in the evening before. Rules:
    - the same local day: "today at 1:00 pm", or "tonight at 7:15 pm" when it is 5 pm or later;
    - the early hours of the next day while it is still evening now: "tonight at 2:00 am";
    - the next local day: "tomorrow at 1:00 pm"; later: "thursday at 7:15 pm". */
export function whenWords(now: number, at: number, tz: string): string {
  const clock = formatClock(at, tz);
  const today = startOfDay(now, tz), tomorrow = startOfDay(now, tz, 1), after = startOfDay(now, tz, 2);
  const hour = zonedParts(at, tz).hour;
  const nowHour = zonedParts(now, tz).hour;
  if (at >= today && at < tomorrow) return `${hour >= 17 ? 'tonight' : 'today'} at ${clock}`;
  if (at >= tomorrow && at < after) return hour < 6 && nowHour >= 17 ? `tonight at ${clock}` : `tomorrow at ${clock}`;
  return `${dayName(weekdayOf(at, tz))} at ${clock}`;
}

/** "3d 4h", "3h 12m", "12m" or "under a minute" for a span in ms (minutes are floored). */
export function spanWords(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  if (total < 1) return 'under a minute';
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A ticking countdown. `precise` shows seconds ("1:42:10", "12:05"); otherwise hours and minutes ("3h 12m"), days over a day ("2d 4h"). */
export function clockWords(ms: number, precise: boolean): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (!precise) return spanWords(s * 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (s >= 24 * 3600) return spanWords(s * 1000);
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
