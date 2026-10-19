import { afterEach, describe, expect, it } from 'vitest';
import type { NflGame } from '../../engine/live';
import { sampleLeague } from '../../test/fakes';
import { kickoffsOf, liveMatchOf, settingsOf } from './build';
import { applyNowParam, currentNow, isNowOverridden, nowParamFromLocation, parseNow, resetNowOverride } from './nowOverride';

afterEach(() => {
  resetNowOverride();
  window.history.replaceState(null, '', '/');
});

const H = 3_600_000;
const game = (id: string, kickoff: number | null, state: NflGame['state'] = 'pre'): NflGame =>
  ({ id, home: 'H', away: 'A', kickoff, state, quarter: '', clock: '', homeScore: null, awayScore: null, elapsed: 0 });

describe('the preview clock (?now=)', () => {
  it('parses a local date and time, a bare date and a full ISO string; rejects the rest', () => {
    expect(parseNow('2026-10-20T20:00')).toBe(new Date(2026, 9, 20, 20, 0).getTime());
    expect(parseNow('2026-10-20 20:00')).toBe(new Date(2026, 9, 20, 20, 0).getTime());
    expect(parseNow('2026-10-20')).not.toBeNull();
    expect(parseNow('2026-10-20T20:00:00Z')).toBe(Date.UTC(2026, 9, 20, 20, 0));
    for (const bad of ['', 'live', 'tuesday', '2026-13-45T99:99', null, undefined]) expect(parseNow(bad as string)).toBeNull();
  });

  it('sets the clock, runs on from there, and `live` or an empty value goes back to the real one', async () => {
    const real = Date.now();
    expect(isNowOverridden()).toBe(false);
    expect(applyNowParam('2026-10-20T20:00')).toBe(true);
    expect(isNowOverridden()).toBe(true);
    const at = new Date(2026, 9, 20, 20, 0).getTime();
    expect(currentNow()).toBeGreaterThanOrEqual(at);
    expect(currentNow()).toBeLessThan(at + 5000);
    expect(applyNowParam('2026-10-20T20:00')).toBe(false); // nothing changed
    expect(applyNowParam(null)).toBe(false); // no param: leave it
    expect(isNowOverridden()).toBe(true);
    expect(applyNowParam('live')).toBe(true);
    expect(isNowOverridden()).toBe(false);
    expect(Math.abs(currentNow() - real)).toBeLessThan(5000);
    applyNowParam('2026-10-20T20:00');
    expect(applyNowParam('')).toBe(true);
    expect(isNowOverridden()).toBe(false);
  });

  it('survives moving between pages (kept for the tab) and reads the query from the page address, before or inside the hash', () => {
    applyNowParam('2026-10-20T20:00');
    expect(window.sessionStorage.getItem('wr.moments.now')).toContain('startedAt');
    window.history.replaceState(null, '', '/?now=2026-10-21T10:00');
    expect(nowParamFromLocation()).toBe('2026-10-21T10:00');
    window.history.replaceState(null, '', '/#/waivers?now=2026-10-22T17:00');
    expect(nowParamFromLocation()).toBe('2026-10-22T17:00');
    window.history.replaceState(null, '', '/#/waivers');
    expect(nowParamFromLocation()).toBeNull();
  });
});

describe('league settings → moments settings', () => {
  it('reads the waiver and trade settings Sleeper sends, and leaves out what it does not', () => {
    const league = { ...sampleLeague, settings: { ...sampleLeague.settings, waiver_day_of_week: 2, waiver_type: 2, daily_waivers: 0, waiver_clear_days: 2, trade_deadline: 11, playoff_week_start: 15 } };
    expect(settingsOf(league)).toEqual({ waiverDayOfWeek: 2, waiverType: 2, dailyWaivers: 0, waiverClearDays: 2, tradeDeadline: 11, playoffWeekStart: 15 });
    expect(settingsOf(sampleLeague)).toMatchObject({ waiverDayOfWeek: undefined, tradeDeadline: undefined, playoffWeekStart: 15 });
    expect(settingsOf(null)).toEqual({});
  });
});

describe('games → kickoffs', () => {
  const now = 100 * H;
  it('keeps the feed’s state, drops games with no time, and ends a game the feed forgot to close after five hours', () => {
    const out = kickoffsOf([game('a', now + H), game('b', now - H, 'live'), game('c', null), game('d', now - 6 * H, 'live'), game('e', now - 6 * H, 'final')], now);
    expect(out.map((g) => [g.id, g.state])).toEqual([['a', 'pre'], ['b', 'live'], ['d', 'final'], ['e', 'final']]);
  });

  it('on the preview clock the state comes from the kickoff time alone', () => {
    const out = kickoffsOf([game('a', now + H, 'final'), game('b', now - H, 'pre'), game('c', now - 4 * H, 'live')], now, true);
    expect(out.map((g) => g.state)).toEqual(['pre', 'live', 'final']);
  });
});

describe('the live matchup', () => {
  const starter = (name: string, state: string) => ({ name, pos: 'WR', state });
  const team = (name: string, actual: number, ss: ReturnType<typeof starter>[]) => ({ name, actual, starters: ss });

  it('lists the starters still to play and carries the live odds', () => {
    const m = {
      a: team('icemen', 95, [starter('a', 'final'), starter('b', 'live'), starter('c', 'pre'), starter('d', 'idle')]),
      b: team('killa', 58.8, [starter('e', 'final')]), winA: 0.8, started: true, final: false,
    };
    expect(liveMatchOf(m as never)).toEqual({
      mine: { name: 'icemen', pts: 95, left: [{ name: 'b', pos: 'WR' }, { name: 'c', pos: 'WR' }], top: null },
      theirs: { name: 'killa', pts: 58.8, left: [], top: null }, winP: 0.8, started: true, final: false, finalAt: null,
    });
    expect(liveMatchOf(null)).toBeNull();
  });

  it('names the top scorer, the week, and when the last game ended (the latest kickoff plus a game)', () => {
    const p = (name: string, actual: number, kickoff: number | null) => ({ name, pos: 'WR', state: 'final', actual, game: kickoff === null ? null : { kickoff } });
    const m = {
      a: { name: 'icemen', actual: 30, starters: [p('a', 8.4, 1000), p('b', 21.6, 5 * H)] },
      b: { name: 'killa', actual: 12, starters: [p('c', 12, 2 * H)] }, winA: 1, started: true, final: true,
    };
    const out = liveMatchOf(m as never, 7)!;
    expect(out.mine.top).toEqual({ name: 'b', pts: 21.6 });
    expect(out.theirs.top).toEqual({ name: 'c', pts: 12 });
    expect(out.week).toBe(7);
    expect(out.finalAt).toBe(5 * H + 3.5 * H);
  });
});
