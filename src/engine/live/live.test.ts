import { afterEach, describe, expect, it, vi } from 'vitest';
import { winProb } from '../league.ts';
import {
  BLOWOUT_MARGIN, INITIAL_LIVE, NAIL_MARGIN, buildView, createPoller, diffSnapshots, elapsedFraction, gameStatusText, liveReducer, liveSd,
  liveWinProb, nextKickoff, parseScores, playerLive, pointsAt, pollPlan, replaySource, scoringChunks, weekPhase, winSeries, backoffDelay,
  rowsFromMatchups, liveSource, gamesFromSchedule, GAME_MIN, restDelay, MAX_REST_MS,
} from './index.ts';
import type { NflGame } from './index.ts';
import { ctx, game, games, row, snapshot } from './test-helpers.ts';

afterEach(() => { vi.useRealTimers(); });

describe('game clock', () => {
  it('turns a quarter and a clock into the share of the game played', () => {
    expect(elapsedFraction('', '15:00')).toBe(0);
    expect(elapsedFraction('1', '15:00')).toBe(0);
    expect(elapsedFraction('1', '7:30')).toBeCloseTo(0.125);
    expect(elapsedFraction('2', '0:00')).toBeCloseTo(0.5);
    expect(elapsedFraction('H', '')).toBe(0.5);
    expect(elapsedFraction('4', '3:00')).toBeCloseTo(57 / 60);
    expect(elapsedFraction('F', '00:00')).toBe(1);
    expect(elapsedFraction('F/OT', '')).toBe(1);
    expect(elapsedFraction('OT', '4:00')).toBeGreaterThan(0.95);
    expect(elapsedFraction('banana', '')).toBeNull();
    // a quarter with no readable clock counts as half of that quarter
    expect(elapsedFraction('3', 'x')).toBeCloseTo((30 + 7.5) / 60);
  });

  it('parses Sleeper scores rows (status, quarter, clock, kickoff)', () => {
    const rows = [
      { game_id: 'g1', status: 'in_game', start_time: 1792355100000, metadata: { home_team: 'KC', away_team: 'LAC', home_score: 9, away_score: 0, quarter: '1', time_remaining: '7:21', is_in_progress: true } },
      { game_id: 'g2', status: 'complete', metadata: { home_team: 'ATL', away_team: 'CHI', home_score: 23, away_score: 31, quarter: 'F', time_remaining: '00:00', date_time: '2026-10-18T17:00:00+00:00' } },
      { game_id: 'g3', status: 'pre_game', metadata: { home_team: 'GB', away_team: 'DAL', quarter: '', time_remaining: '15:00', date_time: '2026-10-19T00:20:00+00:00' } },
      { game_id: 'g4', status: 'pre_game', metadata: null },
    ];
    const g = parseScores(rows);
    expect(g).toHaveLength(3);
    const byId = Object.fromEntries(g.map((x) => [x.id, x]));
    expect(byId.g1).toMatchObject({ state: 'live', quarter: '1', clock: '7:21', homeScore: 9, awayScore: 0, kickoff: 1792355100000 });
    expect(byId.g1!.elapsed).toBeCloseTo(7.65 / 60);
    expect(byId.g2).toMatchObject({ state: 'final', elapsed: 1, clock: '', kickoff: Date.parse('2026-10-18T17:00:00Z') });
    expect(byId.g3).toMatchObject({ state: 'pre', elapsed: 0, homeScore: null });
    expect(gameStatusText(byId.g1!)).toBe('q1 7:21');
    expect(gameStatusText(byId.g2!)).toBe('final');
    expect(gameStatusText(byId.g3!)).toBe('');
    expect(gameStatusText(game({ home: 'A', away: 'B', state: 'live', quarter: 'H' }))).toBe('halftime');
  });

  it('falls back to the schedule statuses with no clock', () => {
    const g = gamesFromSchedule([
      { week: 6, home: 'KC', away: 'LAC', status: 'in_progress' }, { week: 6, home: 'GB', away: 'DAL', status: 'pre_game' },
      { week: 5, home: 'GB', away: 'DAL', status: 'complete' },
    ], 6);
    expect(g.map((x) => [x.state, x.elapsed])).toEqual([['live', null], ['pre', 0]]);
  });
});

describe('live projection of a player', () => {
  it('is the actual points once the game is final', () => {
    expect(playerLive(14.2, 18, game({ home: 'A', away: 'B', state: 'final' }))).toMatchObject({ state: 'final', projection: 14.2, remaining: 0 });
  });
  it('is the projection before kickoff', () => {
    expect(playerLive(0, 18, game({ home: 'A', away: 'B', state: 'pre' }))).toMatchObject({ state: 'pre', projection: 18, remaining: 1 });
  });
  it('is actual plus the projection for the share left while the game is on', () => {
    const p = playerLive(6, 18, game({ home: 'A', away: 'B', state: 'live', elapsed: 0.25 }));
    expect(p).toMatchObject({ state: 'live', remaining: 0.75, assumed: false });
    expect(p.projection).toBeCloseTo(6 + 18 * 0.75);
  });
  it('assumes half the game is left when the clock is unreadable, and says so', () => {
    const p = playerLive(6, 18, game({ home: 'A', away: 'B', state: 'live', elapsed: null }));
    expect(p).toMatchObject({ remaining: 0.5, assumed: true });
    expect(p.projection).toBeCloseTo(15);
  });
  it('has nothing left for a player without a game (a bye)', () => {
    expect(playerLive(0, 0, null)).toMatchObject({ state: 'idle', projection: 0, remaining: 0 });
  });
});

describe('live win probability', () => {
  it('matches the engine before anyone plays', () => {
    expect(liveWinProb(110, 100, 20, 1, 1)).toBeCloseTo(winProb(110, 100, 20), 10);
  });
  it('is 1, 0 or a coin flip once everything is final', () => {
    expect(liveWinProb(101, 100, 20, 0, 0)).toBe(1);
    expect(liveWinProb(99, 100, 20, 0, 0)).toBe(0);
    expect(liveWinProb(100, 100, 20, 0, 0)).toBe(0.5);
  });
  it('shrinks the spread with the starter-minutes left', () => {
    expect(liveSd(20, 1, 1)).toBe(20);
    expect(liveSd(20, 0.25, 0.25)).toBeCloseTo(10);
    expect(liveSd(20, 0, 0)).toBe(0);
    // the same lead is worth more with less time left
    const early = liveWinProb(105, 100, 20, 0.9, 0.9), late = liveWinProb(105, 100, 20, 0.1, 0.1);
    expect(late).toBeGreaterThan(early);
  });
  it('rises with the lead', () => {
    let last = -1;
    for (let lead = -40; lead <= 40; lead += 5) {
      const p = liveWinProb(100 + lead, 100, 20, 0.6, 0.4);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });
});

describe('derived stats', () => {
  it('builds a matchup with live projections, win chances and counts, my team on the left', () => {
    const gs = games('live', 0.5).map((g) => g);
    // every game is half over; my starters scored 10 / 5 / 6
    const snap = snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, gs);
    const v = buildView(ctx(), snap);
    const m = v.mine!;
    expect(m.a.isMe).toBe(true);
    expect(m.a.actual).toBe(21);
    expect(m.b.actual).toBe(9);
    // projection = actual + mu × 0.5 for each starter
    expect(m.a.projection).toBeCloseTo(21 + (20 + 15 + 12) * 0.5);
    expect(m.a.preProjection).toBe(47);
    expect(m.a.remaining).toBeCloseTo(0.5);
    expect(m.winA).toBeGreaterThan(0.7);
    expect(m.preWinA).toBeCloseTo(winProb(47, 46, 20), 6);
    expect(m.a.live).toBe(3);
    expect(m.left).toBe(6);
    expect(v.counts).toEqual({ yet: 0, live: 12, done: 0 });
  });

  it('is final with 1 and 0 when every game is over', () => {
    const v = buildView(ctx(), snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, games('final')));
    expect(v.mine!.final).toBe(true);
    expect(v.mine!.winA).toBe(1);
    expect(v.counts).toEqual({ yet: 0, live: 0, done: 12 });
  });

  it('flags an upset alert: pre-game chance under 35% and ahead now', () => {
    // team 4 (mu 33) against team 3 (mu 40): not an underdog by enough; make team 4 a big underdog
    const c = ctx({ mu: { ...ctx().mu, q4: 2, r4: 2, w4: 2 } });
    const winning = buildView(c, snapshot({ q4: 20, r4: 10, w4: 10, q3: 5, r3: 5, w3: 5 }, games('live')));
    const m = winning.matchups.find((x) => x.a.rid === 3 || x.b.rid === 3)!;
    expect(Math.min(m.preWinA, 1 - m.preWinA)).toBeLessThan(0.35);
    expect(m.tags).toContain('upset alert');
    expect(winning.upsets).toHaveLength(1);
    // behind, the underdog is not an alert
    const losing = buildView(c, snapshot({ q4: 1, r4: 1, w4: 1, q3: 5, r3: 5, w3: 5 }, games('live')));
    expect(losing.upsets).toHaveLength(0);
    // nothing scored yet: no alert
    expect(buildView(c, snapshot({}, games('pre'))).upsets).toHaveLength(0);
  });

  it('names one nail-biter: the closest matchup with players left, within the margin', () => {
    const snap = snapshot({ q1: 10, r1: 5, w1: 6, q2: 10, r2: 3, w2: 5, q3: 30, r3: 20, w3: 10, q4: 10, r4: 5, w4: 5 }, games('live'));
    const v = buildView(ctx(), snap);
    expect(v.nailBiter?.id).toBe(1);
    expect(Math.abs(v.nailBiter!.margin)).toBeLessThanOrEqual(NAIL_MARGIN);
    expect(v.matchups.filter((m) => m.tags.includes('nail-biter'))).toHaveLength(1);
    // a close game with nobody left is not a nail-biter
    const done = buildView(ctx(), snapshot({ q1: 10, r1: 5, w1: 6, q2: 10, r2: 3, w2: 5 }, games('final')));
    expect(done.nailBiter).toBeNull();
  });

  it('names the biggest blowout from the margin threshold', () => {
    const snap = snapshot({ q3: 40, r3: 30, w3: 20, q4: 2, r4: 1, w4: 1, q1: 20, r1: 10, w1: 10, q2: 15, r2: 10, w2: 10 }, games('final'));
    const v = buildView(ctx(), snap);
    expect(v.blowout?.id).toBe(2);
    expect(Math.abs(v.blowout!.margin)).toBeGreaterThanOrEqual(BLOWOUT_MARGIN);
    expect(v.matchups.find((m) => m.id === 1)!.tags).not.toContain('blowout');
  });

  it('ranks the top five starters as game balls', () => {
    const v = buildView(ctx(), snapshot({ q1: 30, r1: 5, w1: 6, q2: 4, r2: 25, w2: 2, q3: 12, r3: 40, w3: 8 }, games('final')));
    expect(v.gameBalls.map((b) => [b.name, b.points])).toEqual([
      ['Rob Rusher', 40], ['Alex Arm', 30], ['Ray Rusher', 25], ['Tom Thrower', 12], ['Will Winger', 8],
    ]);
    expect(v.gameBalls[1]!.isMe).toBe(true);
  });

  it('counts bench points left on the sideline: best lineup minus what was started', () => {
    // team 1 benched a 22-point WR while starting a 6-point one; team 3 benched a 4 behind a 10
    const snap = snapshot({ q1: 10, r1: 5, w1: 6, b1: 22, q3: 10, r3: 5, w3: 10, b3: 4 }, games('final'));
    const bench = buildView(ctx(), snap).bench;
    const t1 = bench.find((b) => b.rid === 1)!;
    expect(t1).toMatchObject({ started: 21, best: 37, left: 16, isMe: true });
    expect(t1.top).toEqual({ name: 'Backup Wideout', points: 22, pid: 'b1', pos: 'WR', nfl: 'CCC' });
    expect(bench.find((b) => b.rid === 3)!.left).toBe(0);
    expect(bench[0]!.rid).toBe(1);
  });

  it('guesses game states from points when no game feed answers', () => {
    const snap = snapshot({ q1: 10 }, [], { gamesKnown: false });
    const v = buildView(ctx(), snap);
    const q1 = v.mine!.a.starters.find((s) => s.pid === 'q1')!;
    expect(q1).toMatchObject({ state: 'live', assumed: true });
    expect(v.mine!.a.starters.find((s) => s.pid === 'r1')!.state).toBe('pre');
    expect(v.assumed).toBe(true);
  });

  it('draws the win chance of one team across the frames', () => {
    const frames = [
      snapshot({}, games('pre'), { clock: 1 }),
      snapshot({ q1: 10, r1: 5, w1: 6 }, games('live', 0.4), { clock: 2 }),
      snapshot({ q1: 20, r1: 15, w1: 12, q2: 4 }, games('final'), { clock: 3 }),
    ];
    const s = winSeries(ctx(), frames, 1);
    expect(s.map((x) => x.clock)).toEqual([1, 2, 3]);
    expect(s[0]!.p).toBeCloseTo(winProb(47, 46, 20));
    expect(s[2]!.p).toBe(1);
    // seen from the other side it is the complement
    expect(winSeries(ctx(), frames, 2)[1]!.p).toBeCloseTo(1 - s[1]!.p, 8);
  });
});

describe('the scoring feed', () => {
  const a = snapshot({ q1: 10, r1: 5 }, games('live'), { at: 1000 });
  const b = snapshot({ q1: 16.4, r1: 5, w1: 3 }, games('live'), { at: 2000 });

  it('diffs two polls into per-starter changes, biggest first', () => {
    const d = diffSnapshots(a, b);
    expect(d.map((c) => [c.pid, c.delta, c.total])).toEqual([['q1', 6.4, 16.4], ['w1', 3, 3]]);
    expect(d[0]).toMatchObject({ rid: 1, matchupId: 1, at: 2000 });
  });
  it('sees a points correction (negative change) too', () => {
    const d = diffSnapshots(b, a);
    expect(d.find((c) => c.pid === 'q1')!.delta).toBe(-6.4);
  });
  it('ignores bench players and a different week', () => {
    const c = snapshot({ q1: 10, r1: 5, b1: 9 }, games('live'), { at: 2000 });
    expect(diffSnapshots(a, c)).toEqual([]);
    expect(diffSnapshots(a, { ...b, week: 7 })).toEqual([]);
  });

  it('the reducer keeps no change for the first poll, then the newest changes first, and the frames', () => {
    let s = liveReducer(INITIAL_LIVE, { type: 'polled', snapshot: a });
    expect(s.changes).toEqual([]);
    expect(s.polls).toBe(1);
    s = liveReducer(s, { type: 'polled', snapshot: b });
    expect(s.changes).toHaveLength(2);
    expect(s.frames).toHaveLength(2);
    s = liveReducer(s, { type: 'polled', snapshot: snapshot({ q1: 16.4, r1: 12, w1: 3 }, games('live'), { at: 3000 }) });
    expect(s.changes[0]).toMatchObject({ pid: 'r1', delta: 7 });
    expect(s.changes).toHaveLength(3);
    // failures count up and a good poll clears them
    s = liveReducer(s, { type: 'failed', message: 'down' });
    expect(s).toMatchObject({ failures: 1, error: 'down' });
    expect(liveReducer(s, { type: 'polled', snapshot: a })).toMatchObject({ failures: 0, error: null });
  });

  it('starts over when the week changes', () => {
    let s = liveReducer(INITIAL_LIVE, { type: 'polled', snapshot: a });
    s = liveReducer(s, { type: 'polled', snapshot: b });
    s = liveReducer(s, { type: 'polled', snapshot: { ...a, week: 5 } });
    expect(s.frames).toHaveLength(1);
    expect(s.changes).toEqual([]);
  });
});

describe('week phase and the polling plan', () => {
  const T = 10_000_000;
  const g = (state: NflGame['state'], kickoff: number | null): NflGame => game({ home: `H${kickoff}`, away: `A${kickoff}`, state, kickoff });

  it('names the phase of the week', () => {
    expect(weekPhase([], T)).toBe('unknown');
    expect(weekPhase([g('pre', T + 1), g('pre', T + 2)], T)).toBe('pre');
    expect(weekPhase([g('final', T - 9e6 + 1), g('live', T - 1)], T)).toBe('live');
    expect(weekPhase([g('final', T - 99), g('pre', T + 1e6)], T)).toBe('between');
    expect(weekPhase([g('final', T - 99), g('final', T - 98)], T)).toBe('final');
    // a game that kicked off 6 hours ago and never turned final counts as final
    expect(weekPhase([g('live', T - 6 * 3_600_000)], T)).toBe('final');
  });

  it('finds the next kickoff', () => {
    expect(nextKickoff([g('final', T - 5), g('pre', T + 500), g('pre', T + 200)], T)?.kickoff).toBe(T + 200);
    expect(nextKickoff([g('final', T - 5)], T)).toBeNull();
  });

  it('polls every 30 s while a game is on or about to start, sleeps before that and stops when all is final', () => {
    expect(pollPlan([g('live', T - 1000)], T)).toEqual({ mode: 'poll', delay: 30_000 });
    expect(pollPlan([g('pre', T + 60_000)], T)).toEqual({ mode: 'poll', delay: 30_000 });
    // 2 hours to kickoff: wake 5 minutes before, but never sleep more than 30 minutes
    expect(pollPlan([g('pre', T + 2 * 3_600_000)], T)).toEqual({ mode: 'wait', delay: 30 * 60_000 });
    expect(pollPlan([g('pre', T + 20 * 60_000)], T)).toEqual({ mode: 'wait', delay: 15 * 60_000 });
    expect(pollPlan([g('final', T - 1e6), g('final', T - 1e6)], T).mode).toBe('stop');
    expect(pollPlan([], T).mode).toBe('wait');
  });
});

describe('resting after the last game', () => {
  const T = 10_000_000;
  it('sleeps until five minutes before the next kickoff, a minute at least and three hours at most', () => {
    expect(restDelay(T + 60 * 60_000, T)).toBe(55 * 60_000);
    expect(restDelay(T + 2 * 60_000, T)).toBe(60_000);
    expect(restDelay(T + 3 * 86_400_000, T)).toBe(MAX_REST_MS);
    expect(restDelay(null, T)).toBe(MAX_REST_MS);
    expect(MAX_REST_MS).toBe(3 * 3_600_000);
  });
});

describe('the poller', () => {
  function setup(opts: { hidden?: { v: boolean }; next?: (n: number) => number | null; fail?: (n: number) => boolean } = {}) {
    vi.useFakeTimers();
    const calls: boolean[] = [];
    const results: number[] = [];
    const errors: unknown[] = [];
    let n = 0;
    const poller = createPoller<number>({
      baseMs: 1000,
      isHidden: () => opts.hidden?.v ?? false,
      poll: async (manual) => { calls.push(manual); n++; if (opts.fail?.(n)) throw new Error('boom'); return n; },
      next: (r) => (opts.next ? opts.next(r) : 1000),
      onResult: (r) => results.push(r),
      onError: (e) => errors.push(e),
    });
    return { poller, calls, results, errors };
  }

  it('polls at once, then on its interval', async () => {
    const { poller, results } = setup();
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([1]);
    await vi.advanceTimersByTimeAsync(2500);
    expect(results).toEqual([1, 2, 3]);
    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(results).toHaveLength(3);
  });

  it('pauses while the tab is hidden and polls right away when it comes back', async () => {
    const hidden = { v: false };
    const { poller, results } = setup({ hidden });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    hidden.v = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(results).toEqual([1]);
    hidden.v = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([1, 2]);
    poller.stop();
  });

  it('backs off after errors (2 s, 4 s, ...) and recovers', async () => {
    expect([0, 1, 2, 3, 4, 9].map((f) => backoffDelay(1000, f))).toEqual([1000, 2000, 4000, 8000, 16000, 120000]);
    const { poller, results, errors } = setup({ fail: (n) => n === 1 || n === 2 });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(errors).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(errors).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(errors).toHaveLength(2);
    // the second failure waits 4 s
    await vi.advanceTimersByTimeAsync(3990);
    expect(results).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(results).toEqual([3]);
    // and the next one is back on the 1 s interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(results).toEqual([3, 4]);
    poller.stop();
  });

  it('stops when the plan says so, and a manual poll still works', async () => {
    const { poller, results, calls } = setup({ next: (r) => (r >= 2 ? null : 1000) });
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(results).toEqual([1, 2]);
    expect(poller.running).toBe(false);
    await poller.pollNow();
    expect(results).toEqual([1, 2, 3]);
    expect(calls[2]).toBe(true);
    poller.stop();
  });

  it('after a long rest a tab that comes back polls at once if the next poll came due, else waits out the rest', async () => {
    const hidden = { v: false };
    const { poller, results } = setup({ hidden, next: (r) => (r === 1 ? 60_000 : 1_000_000) });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([1]);
    // hidden for 30 s of a 60 s rest: back on screen it is not due yet, and it still fires on time
    hidden.v = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(30_000);
    hidden.v = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);
    expect(results).toEqual([1]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(results).toEqual([1, 2]);
    // hidden past the next due time (the next kickoff has passed): back on screen it polls right away
    hidden.v = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2_000_000);
    expect(results).toEqual([1, 2]);
    hidden.v = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(results).toEqual([1, 2, 3]);
    poller.stop();
  });

  it('does not start polling a hidden tab', async () => {
    const hidden = { v: true };
    const { poller, results } = setup({ hidden });
    poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(results).toEqual([]);
    poller.stop();
  });
});

describe('the live source', () => {
  it('reads matchups and scores forced, and falls back to the schedule', async () => {
    const m = [{ roster_id: 1, matchup_id: 1, points: 12.5, starters: ['q1', 'r1'], players: ['q1', 'r1', 'b1'], starters_points: [10, 2.5], players_points: { q1: 10, r1: 2.5, b1: 0 } }];
    const loaded = <T,>(data: T) => ({ data, asOf: 1, fromCache: false, stale: false, bytes: 1, ms: 1, status: 200 });
    const reader = {
      liveMatchups: vi.fn(async () => loaded(m)),
      scores: vi.fn(async () => { throw new Error('scores down'); }),
      schedule: vi.fn(async () => loaded([{ week: 6, home: 'KC', away: 'LAC', status: 'in_progress' }])),
    };
    const src = liveSource(reader as never, { leagueId: 'L', season: '2026', week: 6, now: () => 77 });
    const snap = await src.poll({ force: true });
    expect(reader.liveMatchups).toHaveBeenCalledWith('L', 6, { force: true });
    expect(snap).toMatchObject({ week: 6, at: 77, kind: 'live', gamesKnown: true });
    expect(snap.games[0]).toMatchObject({ state: 'live', elapsed: null });
    expect(snap.rows[0]).toMatchObject({ rid: 1, points: 12.5, startersPoints: [10, 2.5] });
    reader.schedule.mockRejectedValue(new Error('down'));
    expect((await src.poll()).gamesKnown).toBe(false);
  });

  it('builds rows from a matchup with no starters_points', () => {
    expect(rowsFromMatchups([{ roster_id: 2, matchup_id: null, points: 0, starters: ['a'], players_points: { a: 3 } }])[0]).toMatchObject({ startersPoints: [3], players: ['a'] });
  });
});

describe('the replay source', () => {
  const H = 3_600_000;
  const base = Date.parse('2026-10-11T17:00:00Z');
  const rg = [
    game({ home: 'AAA', away: 'BBB', kickoff: base }),
    game({ home: 'CCC', away: 'DDD', kickoff: base + 3 * H }),
    game({ home: 'EEE', away: 'FFF', kickoff: base + 3 * 24 * H }),
  ];
  const teamOf = (pid: string) => ctx().players[pid]?.nfl ?? null;
  const rows = [
    row(1, 1, { q1: 20, r1: 15, w1: 12 }, ['q1', 'r1', 'w1']),
    row(2, 1, { q2: 19, r2: 14, w2: 13 }, ['q2', 'r2', 'w2']),
  ];
  const matchups = rows.map((r) => ({ roster_id: r.rid, matchup_id: r.matchupId, points: r.points, starters: r.starters, players: r.players, starters_points: r.startersPoints, players_points: r.playersPoints }));

  function make() {
    let t = 0;
    const src = replaySource({ week: 5, matchups, games: rg, teamOf, now: () => t });
    const step = async (sec: number) => { t += sec * 1000; return src.poll(); };
    return { src, step };
  }

  it('splits a player\'s final points into chunks that add up exactly', () => {
    for (const total of [20, 12.34, 0.7, -2]) {
      const ch = scoringChunks('pid-' + total, total);
      expect(ch.length).toBeGreaterThanOrEqual(3);
      expect(ch.reduce((s, c) => s + c.pts, 0)).toBeCloseTo(total, 6);
      expect(pointsAt(ch, total, 1)).toBe(total);
      expect(pointsAt(ch, total, 0)).toBe(0);
    }
    expect(scoringChunks('x', 0)).toEqual([]);
    // deterministic
    expect(scoringChunks('abc', 10)).toEqual(scoringChunks('abc', 10));
  });

  it('shows nothing before a game kicks off and reveals points once it is on', async () => {
    const { step } = make();
    const first = await step(0);
    expect(first.kind).toBe('replay');
    expect(first.rows.every((r) => r.points === 0)).toBe(true);
    expect(first.games.map((g) => g.state)).toEqual(['pre', 'pre', 'pre']);
    // 10 sim minutes to the first kickoff: 10 / 6 s; after 120 s of real time (720 sim minutes) game 1 and 2 are long over
    const mid = await step(8);
    expect(mid.games[0]!.state).toBe('live');
    expect(mid.games[1]!.state).toBe('pre');
    // team 1 starters play in game AAA/BBB (q1 AAA, r1 BBB) and CCC (w1): the AAA game is on, the CCC game is not
    const r1 = mid.rows.find((r) => r.rid === 1)!;
    expect(r1.playersPoints.w1).toBe(0);
    const later = await step(40);
    expect(later.games[0]!.state).toBe('final');
    expect(later.rows.find((r) => r.rid === 1)!.playersPoints.q1).toBe(20);
  });

  it('squeezes the days between games, ends exactly at the final numbers and reports complete', async () => {
    const { src, step } = make();
    let snap = await step(0);
    let guard = 0;
    while (!snap.complete && guard++ < 1000) snap = await step(5);
    expect(snap.complete).toBe(true);
    expect(src.status().fraction).toBe(1);
    expect(snap.games.every((g) => g.state === 'final')).toBe(true);
    expect(snap.rows.map((r) => r.points)).toEqual(rows.map((r) => r.points));
    // three days apart in real life, but the replay needs well under 10 minutes at 1x
    expect(guard * 5).toBeLessThan(600);
  });

  it('pauses, changes speed, seeks and restarts', async () => {
    const { src, step } = make();
    await step(0);
    src.pause();
    const a = await step(30);
    const b = await step(30);
    expect(a.clock).toBe(b.clock);
    expect(src.status().playing).toBe(false);
    src.play();
    src.setSpeed(8);
    const c = await step(5);
    expect(c.clock).toBeGreaterThan(b.clock);
    expect(src.status().speed).toBe(8);
    src.seek(0.5);
    expect(src.status().fraction).toBeCloseTo(0.5, 1);
    src.restart();
    expect(src.status().fraction).toBe(0);
    expect(GAME_MIN).toBe(195);
  });

  it('runs through the same reducer as a real poll and feeds the drive chart', async () => {
    const { step } = make();
    let s = INITIAL_LIVE;
    for (let i = 0; i < 60; i++) s = liveReducer(s, { type: 'polled', snapshot: await step(2) });
    expect(s.changes.length).toBeGreaterThan(3);
    expect(s.changes.every((c) => c.delta !== 0)).toBe(true);
  });
});
