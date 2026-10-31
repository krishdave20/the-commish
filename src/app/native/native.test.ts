import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildView } from '../../engine/live/derive';
import { ctx as liveCtx, game, snapshot } from '../../engine/live/test-helpers';
import { buildActivities } from '../../engine/moments';
import type { Moment } from '../../engine/moments';
import { nativeActivity, samePayload } from './activityPayload';
import { askNative, isNativeApp, markNative, postNative } from './bridge';

const H = 3_600_000;
const NOW = Date.parse('2026-10-22T17:00:00Z');
const moment = (over: Partial<Moment> = {}): Moment => ({
  id: 'x', kind: 'take', priority: 50, title: 'a thing', detail: 'a detail', action: { label: 'go', to: '/x' }, pages: [], ...over,
});

function liveView() {
  const sit = { possession: 'BBB', yardLine: 34, territory: 'AAA', down: 2, distance: '7', downText: '2nd & 7', redZone: false, homeTimeouts: 3, awayTimeouts: 2 };
  return buildView(liveCtx(), snapshot({ q1: 12.5, r1: 8.2, w1: 21, q2: 15 }, [
    game({ home: 'AAA', away: 'BBB', state: 'live', quarter: '3', clock: '8:12', elapsed: 0.6, kickoff: 1000, situation: sit }),
    game({ home: 'CCC', away: 'DDD', state: 'final', elapsed: 1, kickoff: 2000 }),
    game({ home: 'EEE', away: 'FFF', state: 'pre', kickoff: 3000 }), game({ home: 'GGG', away: 'HHH', state: 'pre', kickoff: 3000 }),
    game({ home: 'III', away: 'JJJ', state: 'pre', kickoff: 3000 }), game({ home: 'KKK', away: 'LLL', state: 'pre', kickoff: 3000 }),
  ]));
}

describe('the Live Activity payload', () => {
  it('carries the live matchup in the pill’s words, with what the app needs to refresh it in the background', () => {
    const view = liveView();
    const [a] = buildActivities([moment({ id: 'live-matchup', kind: 'live-matchup', priority: 92, live: true, action: { label: 'game day', to: '/gameday' } })], {
      ctx: null, view, changes: [], draft: null,
    });
    const p = nativeActivity(a!, NOW, { view, leagueId: 'L1', sd: 25 });
    expect(p.kind).toBe('matchup');
    expect(p.title).toBe('live matchup');
    expect(p.compact).toMatch(/^icemen 41\.7 · 15\.0 · \d+%$/);
    expect(p.to).toBe('/gameday');
    expect(p.action).toBe('open game day');
    expect(p.countdown).toBeNull();
    expect(p.matchup!.me).toEqual({ name: 'icemen', score: expect.closeTo(41.7, 5), projected: expect.any(Number) });
    expect(p.matchup!.nowPlaying[0]).toBe('runner · on offense · 2nd & 7 at aaa 34 · q3 8:12');
    const r = p.matchup!.refresh!;
    expect(r).toMatchObject({ leagueId: 'L1', sd: 25, week: view.week });
    expect(r.rid).not.toBe(r.oppRid);
    expect(r.remMe).toBeGreaterThan(0);
    expect(r.remMe).toBeLessThan(1);
    // ActivityKit's 4 KB cap on a content state
    expect(JSON.stringify(p).length).toBeLessThan(4096);
  });

  it('leaves the refresh out when it cannot be done (no league id or no SD)', () => {
    const view = liveView();
    const [a] = buildActivities([moment({ kind: 'live-matchup', live: true })], { ctx: null, view, changes: [], draft: null });
    expect(nativeActivity(a!, NOW, { view, leagueId: null, sd: 25 }).matchup!.refresh).toBeNull();
    expect(nativeActivity(a!, NOW, { view, leagueId: 'L1', sd: null }).matchup!.refresh).toBeNull();
  });

  it('gives a countdown its end time, so iOS can tick it, and only while it is still to come', () => {
    const m = moment({ id: 'waivers-tonight', kind: 'waivers-tonight', countdownTo: NOW + 2 * H, label: 'waivers', action: { label: 'wire', to: '/waivers' } });
    const [a] = buildActivities([m]);
    const p = nativeActivity(a!, NOW, { view: null, leagueId: 'L1', sd: 25 });
    expect(p.countdown).toEqual({ label: 'waivers', at: NOW + 2 * H });
    expect(p.matchup).toBeNull();
    expect(p.lines).toEqual(['a detail']); // the board is not worked out: the moment's own words
    expect(nativeActivity(a!, NOW + 3 * H, { view: null, leagueId: null, sd: null }).countdown).toBeNull();
  });

  it('writes the recap’s result as the headline', () => {
    const [a] = buildActivities([moment({ kind: 'final-whistle', title: 'final: W' })], {
      ctx: { live: { final: true, week: 7, mine: { pts: 112.3, name: 'icemen', top: { name: 'Ja’Marr Chase', pts: 31.2 } }, theirs: { pts: 98, name: 'Killa K' } } } as never,
      view: null, changes: [], draft: null,
    });
    const p = nativeActivity(a!, NOW, { view: null, leagueId: null, sd: null });
    expect(p.headline).toBe('W 112.3–98.0');
    expect(p.lines).toEqual(['vs killa k', 'top scorer: chase 31.2']);
    expect(p.to).toBe('/gameday?week=7');
  });

  it('counts two payloads as the same when only the time or a countdown’s ticking text differs', () => {
    const [a] = buildActivities([moment({ kind: 'waivers-tonight', countdownTo: NOW + 2 * H, label: 'waivers', precise: true })]);
    const p1 = nativeActivity(a!, NOW, { view: null, leagueId: null, sd: null });
    const p2 = nativeActivity(a!, NOW + 1000, { view: null, leagueId: null, sd: null });
    expect(p1.compact).not.toBe(p2.compact);
    expect(samePayload(p1, p2)).toBe(true);
    expect(samePayload(p1, null)).toBe(false);
    expect(samePayload(null, null)).toBe(true);
    expect(samePayload(p1, { ...p1, lines: ['something new'] })).toBe(false);
  });
});

describe('the bridge', () => {
  type W = Window & { commishNative?: unknown; webkit?: unknown; commishNativeReply?: (id: number, v: unknown) => void };
  const w = window as W;
  afterEach(() => {
    delete w.commishNative; delete w.webkit; delete w.commishNativeReply;
    document.documentElement.removeAttribute('data-native');
    vi.useRealTimers();
  });
  const install = () => {
    const postMessage = vi.fn();
    w.commishNative = { platform: 'ios', version: '1.0', build: '1' };
    w.webkit = { messageHandlers: { commish: { postMessage } } };
    return postMessage;
  };

  it('does nothing in a browser', async () => {
    expect(isNativeApp()).toBe(false);
    expect(postNative({ type: 'refreshed' })).toBe(false);
    expect(await askNative({ type: 'notify-request' })).toBeNull();
    markNative();
    expect(document.documentElement.hasAttribute('data-native')).toBe(false);
  });

  it('needs both the injected info and the message handler', () => {
    w.commishNative = { platform: 'ios', version: '1.0', build: '1' };
    expect(isNativeApp()).toBe(false);
    install();
    expect(isNativeApp()).toBe(true);
    markNative();
    expect(document.documentElement.getAttribute('data-native')).toBe('ios');
  });

  it('posts messages and matches the app’s answer to its question', async () => {
    const post = install();
    expect(postNative({ type: 'haptic', style: 'medium' })).toBe(true);
    expect(post).toHaveBeenLastCalledWith({ type: 'haptic', style: 'medium' });
    const answer = askNative<string>({ type: 'notify-request' });
    const { id } = post.mock.lastCall![0] as { id: number };
    w.commishNativeReply!(id, 'granted');
    expect(await answer).toBe('granted');
  });

  it('gives up on a question with no answer', async () => {
    vi.useFakeTimers();
    install();
    const answer = askNative({ type: 'notify-request' }, 500);
    vi.advanceTimersByTime(600);
    expect(await answer).toBeNull();
  });
});

describe('the native screens’ snapshot', () => {
  it('puts my team first in my matchup, flipping the win chance with it', async () => {
    const { liveMatchup } = await import('./snapshot');
    const view = liveView();
    const m = view.mine!;
    const flipped = { ...m, a: m.b, b: m.a, winA: 1 - m.winA, preWinA: 1 - m.preWinA };
    const out = liveMatchup(flipped);
    expect(out.a.name).toBe('icemen');
    expect(out.winA).toBeCloseTo(m.a.isMe ? m.winA : 1 - m.winA, 10);
    expect(out.a.starters[0]).toMatchObject({ pid: expect.any(String), state: expect.stringMatching(/pre|live|final|idle/) });
  });

  it('writes a record with ties only when there are some', async () => {
    const { recordText } = await import('./snapshot');
    expect(recordText(5, 2, 0)).toBe('5–2');
    expect(recordText(5, 2, 1)).toBe('5–2–1');
  });
});
