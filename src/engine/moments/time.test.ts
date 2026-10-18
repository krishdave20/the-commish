import { describe, expect, it } from 'vitest';
import { clockWords, dayName, formatClock, nextWeekdayAt, prevWeekdayAt, spanWords, startOfDay, weekdayOf, whenWords, zonedParts, zonedToMs, HOUR } from './time.ts';
import { lastWaiverRun, nextWaiverRun, waiverSchedule } from './waivers.ts';
import { TZ, at } from './test-helpers.ts';

describe('zones', () => {
  it('reads calendar parts in a zone, with ISO weekdays', () => {
    const t = Date.UTC(2026, 9, 21, 7, 0); // Wed 3:00 am Eastern = 2:00 am Central
    expect(zonedParts(t, 'America/New_York')).toMatchObject({ year: 2026, month: 10, day: 21, hour: 3, minute: 0, weekday: 3 });
    expect(zonedParts(t, TZ)).toMatchObject({ day: 21, hour: 2, weekday: 3 });
    expect(zonedParts(Date.UTC(2026, 9, 25, 5, 0), TZ).weekday).toBe(7); // Sunday 12:00 am central
    expect(dayName(4)).toBe('thursday');
  });

  it('round-trips wall time to instant, across a daylight saving change', () => {
    expect(zonedToMs(2026, 10, 21, 2, 0, TZ)).toBe(Date.UTC(2026, 9, 21, 7, 0));
    // US clocks fell back on Sunday Nov 1, 2026: noon that day is UTC-6, noon the day before is UTC-5
    expect(zonedToMs(2026, 11, 1, 12, 0, TZ)).toBe(Date.UTC(2026, 10, 1, 18, 0));
    expect(zonedToMs(2026, 10, 31, 12, 0, TZ)).toBe(Date.UTC(2026, 9, 31, 17, 0));
    // day overflow rolls over like Date.UTC
    expect(zonedToMs(2026, 10, 32, 0, 0, TZ)).toBe(zonedToMs(2026, 11, 1, 0, 0, TZ));
    expect(weekdayOf(at('2026-10-20T20:00'), TZ)).toBe(2);
  });

  it('finds the start of a local day and the next or previous weekday at a time', () => {
    expect(startOfDay(at('2026-10-20T20:00'), TZ)).toBe(at('2026-10-20T00:00'));
    expect(startOfDay(at('2026-10-20T20:00'), TZ, 1)).toBe(at('2026-10-21T00:00'));
    const wed3 = nextWeekdayAt(at('2026-10-20T20:00'), 3, 3, 0, 'America/New_York');
    expect(wed3).toBe(at('2026-10-21T02:00'));
    // already past this week's: next week's
    expect(nextWeekdayAt(at('2026-10-21T02:00'), 3, 3, 0, 'America/New_York')).toBeGreaterThan(at('2026-10-27T00:00'));
    expect(prevWeekdayAt(at('2026-10-21T10:00'), 3, 3, 0, 'America/New_York')).toBe(at('2026-10-21T02:00'));
    expect(prevWeekdayAt(at('2026-10-21T01:00'), 3, 3, 0, 'America/New_York')).toBe(at('2026-10-14T02:00'));
  });

  it('keeps 3:00 am Eastern across the end of daylight saving time', () => {
    // Saturday Oct 31 noon → Wednesday Nov 4 3:00 am EST = 08:00 UTC (a week earlier it was 07:00 UTC)
    expect(nextWeekdayAt(at('2026-10-31T12:00'), 3, 3, 0, 'America/New_York')).toBe(Date.UTC(2026, 10, 4, 8, 0));
  });
});

describe('words', () => {
  it('says when something happens relative to now', () => {
    const now = at('2026-10-20T20:00');
    expect(whenWords(now, at('2026-10-21T02:00'), TZ)).toBe('tonight at 2:00 am');
    expect(whenWords(now, at('2026-10-20T23:30'), TZ)).toBe('tonight at 11:30 pm');
    expect(whenWords(at('2026-10-22T10:00'), at('2026-10-22T13:00'), TZ)).toBe('today at 1:00 pm');
    expect(whenWords(at('2026-10-22T10:00'), at('2026-10-23T13:00'), TZ)).toBe('tomorrow at 1:00 pm');
    expect(whenWords(at('2026-10-20T10:00'), at('2026-10-22T19:15'), TZ)).toBe('thursday at 7:15 pm');
    expect(formatClock(at('2026-10-22T19:15'), TZ)).toBe('7:15 pm');
  });

  it('formats spans and ticking countdowns', () => {
    expect(spanWords(3 * 86_400_000 + 4 * HOUR + 12 * 60_000)).toBe('3d 4h');
    expect(spanWords(3 * HOUR + 12 * 60_000 + 59_000)).toBe('3h 12m');
    expect(spanWords(30_000)).toBe('under a minute');
    expect(clockWords(HOUR + 42 * 60_000 + 10_000, true)).toBe('1:42:10');
    expect(clockWords(12 * 60_000 + 5_000, true)).toBe('12:05');
    expect(clockWords(3 * HOUR + 12 * 60_000, false)).toBe('3h 12m');
    expect(clockWords(2 * 86_400_000 + 5 * HOUR, true)).toBe('2d 5h');
    expect(clockWords(-5, true)).toBe('0:00');
  });
});

describe('waiver timing from the league settings', () => {
  it('reads Sleeper’s waiver_day_of_week from Monday (the real league’s 2 ran on Wednesday at 3:05 am Eastern)', () => {
    expect(waiverSchedule({ waiverDayOfWeek: 2, waiverType: 2 })).toEqual({ weekday: 3, hour: 3, source: 'settings', faab: true });
    expect(waiverSchedule({ waiverDayOfWeek: 0 }).weekday).toBe(1);
    expect(waiverSchedule({ waiverDayOfWeek: 6 }).weekday).toBe(7);
    expect(waiverSchedule({ waiverDayOfWeek: 1, waiverType: 0 }).faab).toBe(false);
  });

  it('falls back to Wednesday morning when the setting is missing, odd or the league has daily waivers', () => {
    for (const s of [{}, { waiverDayOfWeek: 9 }, { waiverDayOfWeek: -1 }, { waiverDayOfWeek: 1.5 }, { waiverDayOfWeek: 4, dailyWaivers: 1 }]) {
      expect(waiverSchedule(s)).toMatchObject({ weekday: 3, hour: 3, source: 'fallback' });
    }
  });

  it('finds the next and last run in Eastern time, shown to the viewer in their own zone', () => {
    const sch = waiverSchedule({ waiverDayOfWeek: 2 });
    expect(nextWaiverRun(at('2026-10-20T20:00'), sch)).toBe(at('2026-10-21T02:00'));
    expect(lastWaiverRun(at('2026-10-21T10:00'), sch)).toBe(at('2026-10-21T02:00'));
    expect(formatClock(nextWaiverRun(at('2026-10-20T20:00'), sch), TZ)).toBe('2:00 am');
    expect(formatClock(nextWaiverRun(at('2026-10-20T20:00'), sch), 'America/New_York')).toBe('3:00 am');
    expect(formatClock(nextWaiverRun(at('2026-10-20T20:00'), sch), 'America/Los_Angeles')).toBe('12:00 am');
  });
});

describe('stamps', () => {
  it('writes the preview clock as "tue oct 20, 8:00 pm"', async () => {
    const { formatStamp } = await import('./time.ts');
    expect(formatStamp(at('2026-10-20T20:00'), TZ)).toBe('tue oct 20, 8:00 pm');
  });
});
