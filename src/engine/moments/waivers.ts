/* When waivers process, from the league's settings.

   Checked on the real league (Oct 18, 2026, krishd20): `waiver_day_of_week: 2`, `daily_waivers: 0`, `waiver_type: 2` (FAAB), `waiver_clear_days: 2`.
   Its transactions endpoint shows every weekly claim of weeks 3 to 6 finishing on a Wednesday at 3:05 am US Eastern (status_updated), so:
   - `waiver_day_of_week` counts from Monday (0 = Monday, so 2 = Wednesday);
   - the weekly run is 3:00 am Eastern (the claims are stamped about five minutes later);
   - the time is Eastern whatever the viewer's zone, so the viewer sees it converted (2:00 am Central).
   Unverified: the clock in winter (the transactions seen were all in daylight saving time: 3:05 am EDT), and daily-waiver leagues
   (`daily_waivers: 1`, hour in `daily_waivers_hour`), which fall back to the weekly rule. With no `waiver_day_of_week` the fallback is Wednesday morning. */
import { nextWeekdayAt, prevWeekdayAt } from './time.ts';
import type { MomentSettings } from './types.ts';

export const WAIVER_TZ = 'America/New_York';
export const WAIVER_HOUR = 3;
/** Wednesday, ISO weekday */
const FALLBACK_WEEKDAY = 3;

export interface WaiverSchedule {
  /** ISO weekday 1 (Monday) … 7 (Sunday) */
  weekday: number;
  hour: number;
  /** where the day came from */
  source: 'settings' | 'fallback';
  /** FAAB: the claim has a bid */
  faab: boolean;
}

export function waiverSchedule(s: MomentSettings): WaiverSchedule {
  const d = s.waiverDayOfWeek;
  const valid = typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6;
  // daily waivers process every night: the weekly nudge still uses the weekly day, so a daily league reads like the fallback
  const fromSettings = valid && !s.dailyWaivers;
  return { weekday: fromSettings ? d + 1 : FALLBACK_WEEKDAY, hour: WAIVER_HOUR, source: fromSettings ? 'settings' : 'fallback', faab: s.waiverType === 2 };
}

/** The next waiver run after `now` (epoch ms). */
export const nextWaiverRun = (now: number, sch: WaiverSchedule): number => nextWeekdayAt(now, sch.weekday, sch.hour, 0, WAIVER_TZ);

/** The last waiver run at or before `now`. */
export const lastWaiverRun = (now: number, sch: WaiverSchedule): number => prevWeekdayAt(now, sch.weekday, sch.hour, 0, WAIVER_TZ);
