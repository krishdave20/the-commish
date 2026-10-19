import { describe, expect, it } from 'vitest';
import { at, ctx, week7, week8 } from '../../engine/moments/test-helpers';
import { moments } from '../../engine/moments';
import type { LiveMatch, MomentCtx } from '../../engine/moments';
import { ALERT_GAP_MS, EMPTY_MEMORY, bigCandidate, candidatesFrom, decide, leadWords } from './alerts';
import type { AlertCandidate, AlertMemory } from './alerts';

const MIN = 60_000;
const candidates = (c: MomentCtx) => candidatesFrom(moments(c), c.now.getTime());
const kinds = (c: MomentCtx) => candidates(c).map((x) => x.kind);

const draftCtx = (picksUntilMine: number | null): Partial<MomentCtx> => ({
  phase: 'drafting', model: null, prep: null,
  draft: { status: 'drafting', startTime: null, mySlot: 3, teams: 12, picksUntilMine, tierPos: null, grade: null },
});
const live = (o: Partial<LiveMatch> = {}): LiveMatch => ({
  mine: { name: 'icemen', pts: 112.3, left: [] }, theirs: { name: 'killa', pts: 98, left: [] }, winP: 1, started: true, final: true, week: 7, finalAt: at('2026-10-25T16:30'), ...o,
});

describe('which moments become alerts', () => {
  it('waivers in 1 hour: only inside the last hour before the run (Wednesday 2:00 am)', () => {
    expect(kinds(ctx('2026-10-20T20:00'))).not.toContain('waivers'); // six hours out
    const c = candidates(ctx('2026-10-21T01:00'));
    expect(c.find((x) => x.kind === 'waivers')).toMatchObject({ title: 'waivers in 1 hour', to: '/waivers' });
    expect(candidates(ctx('2026-10-21T01:40')).find((x) => x.kind === 'waivers')!.title).toBe('waivers in 20 minutes');
    expect(kinds(ctx('2026-10-21T02:05'))).not.toContain('waivers'); // the run has happened
  });

  it('kickoff in 30 minutes: Thursday night game day and the Sunday final check', () => {
    expect(kinds(ctx('2026-10-22T18:00'))).not.toContain('kickoff');
    expect(candidates(ctx('2026-10-22T18:45')).find((x) => x.kind === 'kickoff')).toMatchObject({ title: 'kickoff in 30 minutes', to: '/team' });
    // Sunday: before the inactives the countdown is to the inactives, not the kickoff
    expect(kinds(ctx('2026-10-25T10:20'))).not.toContain('kickoff');
    expect(candidates(ctx('2026-10-25T11:40')).find((x) => x.kind === 'kickoff')!.title).toBe('kickoff in 20 minutes');
  });

  it("you're on the clock: only the clock itself, not 'in 4 picks'", () => {
    expect(kinds(ctx('2026-08-23T19:30', draftCtx(4)))).not.toContain('clock');
    expect(candidates(ctx('2026-08-23T19:30', draftCtx(0))).find((x) => x.kind === 'clock')).toMatchObject({ title: 'you’re on the clock', urgent: true, to: '/draft?tab=clock' });
  });

  it('the final whistle, with the score', () => {
    const games = week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final' });
    const c = candidates(ctx('2026-10-25T17:00', { schedule: { games, nextGames: week8() }, live: live() }));
    expect(c.find((x) => x.kind === 'final')).toMatchObject({ title: 'final: W 112.3–98.0', event: true, to: '/gameday?week=7' });
  });

  it('a big moment for my matchup', () => {
    const b = bigCandidate({ at: 1000, delta: 6.4, pid: 'wr', players: 2 }, "ja'marr chase");
    expect(b).toMatchObject({ key: 'big:1000', kind: 'big', title: 'big moment: +6.4 · chase +1' });
    expect(b.to).toBe('/gameday');
  });

  it('says how long in words', () => {
    expect(leadWords(60 * MIN)).toBe('1 hour');
    expect(leadWords(55 * MIN)).toBe('1 hour');
    expect(leadWords(30 * MIN)).toBe('30 minutes');
    expect(leadWords(20_000)).toBe('1 minute');
  });
});

const cand = (key: string, o: Partial<AlertCandidate> = {}): AlertCandidate => ({
  key, kind: 'waivers', title: key, body: '', to: '/', urgent: false, event: false, priority: 1, ...o,
});
const T0 = at('2026-10-21T01:00');

describe('the scheduler', () => {
  it('fires an alert once: the same key is not sent again', () => {
    const a = decide(EMPTY_MEMORY, [cand('waivers:1')], T0, false);
    expect(a.fire?.key).toBe('waivers:1');
    const b = decide(a.memory, [cand('waivers:1')], T0 + 11 * MIN, false);
    expect(b.fire).toBeNull();
    // a different occurrence (next week's run) is a new key
    expect(decide(b.memory, [cand('waivers:2')], T0 + 11 * MIN, false).fire?.key).toBe('waivers:2');
  });

  it('spaces alerts: at most one per ten minutes, and the waiting one goes when the gap has passed', () => {
    const a = decide(EMPTY_MEMORY, [cand('one'), cand('two')], T0, false);
    expect(a.fire?.key).toBe('one');
    const early = decide(a.memory, [cand('two')], T0 + ALERT_GAP_MS - 1, false);
    expect(early.fire).toBeNull();
    expect(early.memory.sent).not.toHaveProperty('two'); // not lost, only waiting
    expect(decide(early.memory, [cand('two')], T0 + ALERT_GAP_MS, false).fire?.key).toBe('two');
  });

  it('sends one alert per look, best first', () => {
    const d = decide(EMPTY_MEMORY, [cand('low'), cand('high', { priority: 9 })].sort((x, y) => y.priority - x.priority), T0, false);
    expect(d.fire?.key).toBe('high');
  });

  it('on the clock skips the spacing, and fires on every turn but not on every look', () => {
    const clock = cand('draft-clock', { kind: 'clock', urgent: true, event: true, priority: 9 });
    const first = decide(EMPTY_MEMORY, [cand('one')], T0, false);
    const turn = decide(first.memory, [clock], T0 + MIN, false);
    expect(turn.fire?.kind).toBe('clock');
    // still on the clock at the next look: nothing more
    expect(decide(turn.memory, [clock], T0 + 2 * MIN, false).fire).toBeNull();
    // the pick is made, then my turn comes round again (a snake draft's next pass)
    const off = decide(turn.memory, [], T0 + 3 * MIN, false);
    expect(off.memory.clockOn).toBe(false);
    expect(decide(off.memory, [clock], T0 + 4 * MIN, false).fire?.kind).toBe('clock');
  });

  it('a spaced alert does not hold the clock back, and the clock does not use up the gap', () => {
    const clock = cand('draft-clock', { kind: 'clock', urgent: true, event: true, priority: 9 });
    const clockFirst = decide(EMPTY_MEMORY, [clock], T0, false);
    expect(clockFirst.memory.lastAt).toBe(0);
    expect(decide(clockFirst.memory, [cand('one')], T0 + MIN, false).fire?.key).toBe('one');
  });

  it('what is already true on the first look is not news (final, on the clock), but a countdown inside its window is', () => {
    const clock = cand('draft-clock', { kind: 'clock', urgent: true, event: true, priority: 9 });
    const final = cand('final-whistle:/gameday?week=7:final: you won', { kind: 'final', event: true });
    const first = decide(EMPTY_MEMORY, [clock, final], T0, true);
    expect(first.fire).toBeNull();
    expect(first.memory.clockOn).toBe(true);
    expect(decide(first.memory, [clock, final], T0 + MIN, false).fire).toBeNull();
    expect(decide(EMPTY_MEMORY, [cand('kickoff:1', { kind: 'kickoff' })], T0, true).fire?.key).toBe('kickoff:1');
  });

  it('forgets old keys after a week', () => {
    const mem: AlertMemory = { sent: { old: T0 - 8 * 24 * 3600_000, fresh: T0 - 3600_000 }, lastAt: 0, clockOn: false };
    expect(Object.keys(decide(mem, [], T0, false).memory.sent)).toEqual(['fresh']);
  });
});
