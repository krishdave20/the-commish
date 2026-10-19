import { describe, expect, it } from 'vitest';
import { fixedOrder, navOrder } from './navOrder';
import type { NavMoment } from './navOrder';
import { NAV } from './routes';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime(); // Oct 18 2026 is a Sunday
const mo = (kind: NavMoment['kind'], title: string = kind, countdownTo?: number): NavMoment => ({ kind, title, countdownTo });
const labels = (r: ReturnType<typeof navOrder>) => r.order.map((n) => n.label);
const FIXED = NAV.map((n) => n.label);
const run = (o: Partial<Parameters<typeof navOrder>[0]>) => navOrder({ phase: 'in_season', now: at(21, 12), live: false, moments: [], sections: NAV, ...o });

describe('navOrder', () => {
  it('keeps the fixed order when nothing is going on (a Monday morning, no moments)', () => {
    const r = run({ now: at(19, 9) });
    expect(labels(r)).toEqual(FIXED);
    expect(r.promoted).toEqual({});
  });

  it('puts game day then nfl up front while games are on (Sunday 1 pm), with the reason from the live moment', () => {
    const r = run({ now: at(18, 13), live: true, moments: [mo('live-matchup', 'icemen leads killa k 95.0 to 58.8')] });
    expect(labels(r).slice(0, 3)).toEqual(['huddle', 'game day', 'nfl']);
    expect(r.promoted['/gameday']).toBe('icemen leads killa k 95.0 to 58.8');
    expect(r.promoted['/nfl']).toBe('icemen leads killa k 95.0 to 58.8');
  });

  it('also promotes game day inside two hours of kickoff on a game day, but not three hours out', () => {
    const kick = at(18, 13);
    const near = run({ now: kick - 90 * 60_000, moments: [mo('final-check', 'final lineup check', kick)] });
    expect(labels(near).slice(0, 3)).toEqual(['huddle', 'game day', 'nfl']);
    const far = run({ now: kick - 3 * 3_600_000, moments: [mo('final-check', 'final lineup check', kick)] });
    expect(far.promoted).toEqual({}); // three hours out is not yet game time
  });

  it('puts the waiver wire then the locker room up front once the waiver run is a day away (Tuesday 8 pm)', () => {
    const r = run({ now: at(20, 20), moments: [mo('waivers-tonight', 'waivers process tonight at 3:00 am')] });
    expect(labels(r).slice(0, 3)).toEqual(['huddle', 'waiver wire', 'locker room']);
    expect(r.promoted).toEqual({ '/waivers': 'waivers process tonight at 3:00 am', '/team': 'waivers process tonight at 3:00 am' });
  });

  it('puts the locker room then the waiver wire up front on lineup days (Thursday 5 pm)', () => {
    const r = run({ now: at(22, 17), moments: [mo('lineup-swap', 'swap zay flowers in')] });
    expect(labels(r).slice(0, 3)).toEqual(['huddle', 'locker room', 'waiver wire']);
    expect(r.promoted['/team']).toBe('swap zay flowers in');
    expect(run({ now: at(22, 17) }).promoted['/team']).toBe('lineup days');
  });

  it('promotes game day on Monday night before kickoff, and around the league then the playoff picture for the Tuesday recap', () => {
    const mon = run({ now: at(19, 18), moments: [mo('monday-night', 'monday night: you need 12.4')] });
    expect(labels(mon).slice(0, 2)).toEqual(['huddle', 'game day']);
    expect(Object.keys(mon.promoted)).toEqual(['/gameday']);
    const tue = run({ now: at(20, 9), moments: [mo('week-recap', 'week 6 recap')] });
    expect(labels(tue).slice(0, 3)).toEqual(['huddle', 'around the league', 'playoff picture']);
    expect(tue.promoted).toEqual({ '/league': 'week 6 recap', '/race': 'week 6 recap' });
    // tuesday evening the waiver run comes first and takes both places
    const eve = run({ now: at(20, 20), moments: [mo('waivers-tonight', 'waivers process tonight at 3:00 am'), mo('week-recap', 'week 6 recap')] });
    expect(labels(eve).slice(0, 3)).toEqual(['huddle', 'waiver wire', 'locker room']);
  });

  it('promotes the trade block in deadline week', () => {
    const r = run({ now: at(19, 9), moments: [mo('trade-deadline', 'trade deadline: best handshake deal')] });
    expect(labels(r).slice(0, 2)).toEqual(['huddle', 'trade block']);
  });

  it('follows the phase: pre-draft and drafting lead with the draft room, the offseason with the draft room then the trade block, the playoffs with the picture then game day', () => {
    expect(labels(run({ phase: 'pre_draft' })).slice(0, 3)).toEqual(['huddle', 'draft room', 'scouting report']);
    expect(labels(run({ phase: 'drafting', moments: [mo('draft-clock', 'you’re on the clock')] })).slice(0, 3)).toEqual(['huddle', 'draft room', 'scouting report']);
    expect(labels(run({ phase: 'offseason' })).slice(0, 3)).toEqual(['huddle', 'draft room', 'trade block']);
    expect(labels(run({ phase: 'postseason' })).slice(0, 3)).toEqual(['huddle', 'playoff picture', 'game day']);
    // a draft says nothing about this week's lineup, whatever day it is
    expect(run({ phase: 'pre_draft', now: at(22, 17) }).promoted['/team']).toBeUndefined();
  });

  it('always keeps huddle first and front office last, promotes at most two, and loses no section', () => {
    const all = [mo('live-matchup'), mo('monday-night'), mo('waivers-tonight'), mo('week-recap'), mo('trade-deadline'), mo('lineup-swap')];
    for (const o of [{ now: at(18, 13), live: true, moments: all }, { now: at(22, 17), moments: all }, { phase: 'offseason' as const }, { phase: 'postseason' as const, moments: all }]) {
      const r = run(o);
      expect(r.order[0]!.label).toBe('huddle');
      expect(r.order.at(-1)!.label).toBe('front office');
      expect(Object.keys(r.promoted).length).toBeLessThanOrEqual(2);
      expect([...labels(r)].sort()).toEqual([...FIXED].sort());
      // everything not promoted keeps its fixed relative order
      const rest = r.order.filter((n) => n.path !== '/' && !(n.path in r.promoted)).map((n) => n.label);
      expect(rest).toEqual(FIXED.filter((l) => rest.includes(l)));
    }
  });

  it('is the fixed order with nothing promoted when smart order is off', () => {
    const r = fixedOrder(NAV);
    expect(labels(r)).toEqual(FIXED);
    expect(r.promoted).toEqual({});
  });
});
