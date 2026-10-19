import { describe, expect, it } from 'vitest';
import { buildView } from '../live/derive.ts';
import type { RawChange } from '../live/feed.ts';
import { ctx as liveCtx, game, snapshot } from '../live/test-helpers.ts';
import {
  BIG_MOMENT, activityKind, activityTitle, bigMomentText, bigMoments, buildActivities, compactText, countdownText, draftData, kickoffData, matchupData, playerLine,
  recapData, shortName, stateKey, urgency, waiversData,
} from './activity.ts';
import { moments, ongoing } from './index.ts';
import { at, ctx, model, starters, week7 } from './test-helpers.ts';
import type { Moment } from './types.ts';
import type { DraftLiveInfo } from './activity.ts';

const H = 3_600_000, MIN = 60_000;
const NOW = at('2026-10-22T17:00');

const moment = (over: Partial<Moment> = {}): Moment => ({
  id: 'x', kind: 'take', priority: 50, title: 'a thing', detail: 'a detail', action: { label: 'go', to: '/x' }, pages: [], ...over,
});

describe('which activity a moment belongs to', () => {
  it('maps each moment to one of the five activities, or a generic one', () => {
    const k = (kind: Moment['kind']) => activityKind(moment({ kind }));
    expect(['live-matchup', 'monday-night'].map((x) => k(x as Moment['kind']))).toEqual(['matchup', 'matchup']);
    expect(['game-day', 'final-check'].map((x) => k(x as Moment['kind']))).toEqual(['kickoff', 'kickoff']);
    expect(k('waivers-tonight')).toBe('waivers');
    expect(['draft-clock', 'draft-countdown'].map((x) => k(x as Moment['kind']))).toEqual(['draft', 'draft']);
    expect(['final-whistle', 'week-recap'].map((x) => k(x as Moment['kind']))).toEqual(['recap', 'recap']);
    expect(k('trade-deadline')).toBe('generic');
  });

  it('keeps one activity per kind, the highest-priority moment leading, in priority order', () => {
    const list = [
      moment({ id: 'monday-night', kind: 'monday-night', priority: 94, live: true, pill: { text: 'a · b · 50%', bar: 0.5 } }),
      moment({ id: 'live-matchup', kind: 'live-matchup', priority: 92, live: true }),
      moment({ id: 'waivers-tonight', kind: 'waivers-tonight', priority: 86, countdownTo: NOW + H, label: 'waivers' }),
      moment({ id: 'trade-deadline', kind: 'trade-deadline', priority: 64, countdownTo: NOW + H, label: 'deadline' }),
    ];
    const out = buildActivities(list);
    expect(out.map((a) => a.id)).toEqual(['matchup', 'waivers', 'generic:trade-deadline']);
    expect(out[0]!.moment.id).toBe('monday-night');
  });
});

describe('words', () => {
  it('shortens a name to the last name, minus a suffix; a team defense keeps its name', () => {
    expect(shortName('Ja’Marr Chase')).toBe('chase');
    expect(shortName('Kenneth Walker III')).toBe('walker');
    expect(shortName('Marvin Harrison Jr.')).toBe('harrison');
    expect(shortName('Madonna')).toBe('madonna');
    expect(shortName('PIT D/ST', 'DEF')).toBe('pit d/st');
  });

  it('writes a player line: the name, whether his unit is on the field, the down and spot while it is, the clock', () => {
    const g = game({
      home: 'PIT', away: 'CIN', state: 'live', quarter: '3', clock: '8:12', elapsed: 0.55,
      situation: { possession: 'CIN', yardLine: 34, territory: 'PIT', down: 2, distance: '7', downText: '2nd & 7', redZone: false, homeTimeouts: 3, awayTimeouts: 2 },
    });
    expect(playerLine({ name: 'Ja’Marr Chase', pos: 'WR', nfl: 'CIN', game: g })).toEqual({ line: 'chase · on offense · 2nd & 7 at pit 34 · q3 8:12', lead: 'chase · on offense · 2nd & 7 at pit 34', clock: 'q3 8:12', onField: true });
    // his team does not have the ball: off the field, and no down (it is the other side's drive)
    expect(playerLine({ name: 'Tee Higgins', pos: 'WR', nfl: 'PIT', game: g })).toEqual({ line: 'higgins · off the field · q3 8:12', lead: 'higgins · off the field', clock: 'q3 8:12', onField: false });
    // a defense is on the field while the other team has the ball
    expect(playerLine({ name: 'PIT D/ST', pos: 'DEF', nfl: 'PIT', game: g }).onField).toBe(true);
    // no ball position (a break between drives, a replay): just the clock
    expect(playerLine({ name: 'Ja’Marr Chase', pos: 'WR', nfl: 'CIN', game: game({ home: 'PIT', away: 'CIN', state: 'live', quarter: '2', clock: '0:41', elapsed: 0.4 }) }))
      .toEqual({ line: 'chase · q2 0:41', lead: 'chase', clock: 'q2 0:41', onField: null });
    expect(playerLine({ name: 'Ja’Marr Chase', pos: 'WR', nfl: 'CIN', game: game({ home: 'PIT', away: 'CIN', state: 'live', quarter: 'H', elapsed: 0.5 }) }).line).toBe('chase · halftime');
  });
});

/* ---------- the live matchup ---------- */

function liveView(opts: { final?: boolean } = {}) {
  const sit = { possession: 'BBB', yardLine: 34, territory: 'AAA', down: 2, distance: '7', downText: '2nd & 7', redZone: false, homeTimeouts: 3, awayTimeouts: 2 };
  // AAA (home) v BBB: live in the third; CCC v DDD: over; everyone else not started
  const games = opts.final
    ? ['AAA', 'CCC', 'EEE', 'GGG', 'III', 'KKK'].map((home, i) => game({ home, away: ['BBB', 'DDD', 'FFF', 'HHH', 'JJJ', 'LLL'][i]!, state: 'final', kickoff: 1000 + i, elapsed: 1 }))
    : [
      game({ home: 'AAA', away: 'BBB', state: 'live', quarter: '3', clock: '8:12', elapsed: 0.6, kickoff: 1000, situation: sit }),
      game({ home: 'CCC', away: 'DDD', state: 'final', elapsed: 1, kickoff: 2000 }),
      game({ home: 'EEE', away: 'FFF', state: 'pre', kickoff: 3000 }), game({ home: 'GGG', away: 'HHH', state: 'pre', kickoff: 3000 }),
      game({ home: 'III', away: 'JJJ', state: 'pre', kickoff: 3000 }), game({ home: 'KKK', away: 'LLL', state: 'pre', kickoff: 3000 }),
    ];
  const pts: Record<string, number> = opts.final
    ? { q1: 18.4, r1: 9.1, w1: 21, q2: 12, r2: 8, w2: 9 }
    : { q1: 12.5, r1: 8.2, w1: 21, q2: 15 };
  return buildView(liveCtx(), snapshot(pts, games));
}

describe('the live matchup activity', () => {
  it('has both teams, the win chance, the minutes played, who is on the field, and the counts', () => {
    const d = matchupData(liveView())!;
    expect(d.me.name).toBe('icemen');
    expect(d.opp.name).toBe('killa k');
    expect(d.me.score).toBeCloseTo(41.7, 5);
    expect(d.opp.score).toBe(15);
    expect(d.me.stack).toHaveLength(2);
    expect(d.me.projected).toBeGreaterThan(d.me.score);
    expect(d.winP).toBeGreaterThan(0.5);
    // a third of my starters' minutes are played (one final, one 60% through, one to come), theirs one third as well
    expect(d.progress).toBeGreaterThan(0.2);
    expect(d.progress).toBeLessThan(0.7);
    expect(d.counts).toEqual({ yet: 0, live: 2, done: 1 });
    // both of my live starters (AAA and BBB play each other): the one with the ball first
    expect(d.nowPlaying.map((p) => p.line)).toEqual(['runner · on offense · 2nd & 7 at aaa 34 · q3 8:12', 'arm · off the field · q3 8:12']);
    expect(d.nowPlaying[0]!.onField).toBe(true);
    expect(d.final).toBe(false);
  });

  it('shows at most three players on the field', () => {
    // the whole lineup on one live game
    const view = buildView(liveCtx(), snapshot({ q1: 1, r1: 2, w1: 3 }, [
      game({ home: 'AAA', away: 'CCC', state: 'live', quarter: '2', clock: '3:00', elapsed: 0.4 }), game({ home: 'BBB', away: 'DDD', state: 'live', quarter: '2', clock: '3:00', elapsed: 0.4 }),
    ]));
    expect(matchupData(view)!.nowPlaying.length).toBeLessThanOrEqual(3);
  });

  it('names my newest scoring change from the feed, and only mine', () => {
    const feed: RawChange[] = [
      { id: 'a', at: 9000, clock: 9000, rid: 2, pid: 'q2', matchupId: 1, delta: 8, total: 15 },
      { id: 'b', at: 8000, clock: 8000, rid: 1, pid: 'r1', matchupId: 1, delta: 6.4, total: 8.2 },
      { id: 'c', at: 7000, clock: 7000, rid: 1, pid: 'q1', matchupId: 1, delta: 1.2, total: 12.5 },
    ];
    expect(matchupData(liveView(), feed)!.lastPlay).toEqual({ name: 'Rex Runner', delta: 6.4, at: 8000 });
    expect(matchupData(liveView(), [])!.lastPlay).toBeNull();
  });

  it('is null with no view, and reads as final when every starter is done', () => {
    expect(matchupData(null)).toBeNull();
    const d = matchupData(liveView({ final: true }))!;
    expect(d.final).toBe(true);
    expect(d.progress).toBe(1);
    expect(d.nowPlaying).toEqual([]);
  });

  it('the compact line is the one the pill reads', () => {
    const view = liveView();
    const a = buildActivities([moment({ id: 'live-matchup', kind: 'live-matchup', live: true, pill: { text: 'ignored', bar: 0.5 } })], { ctx: null, view, changes: [], draft: null })[0]!;
    expect(compactText(a, NOW)).toMatch(/^icemen 41\.7 · 15\.0 · \d+%$/);
    // without a view it falls back to the moment's own pill
    const b = buildActivities([moment({ id: 'live-matchup', kind: 'live-matchup', live: true, pill: { text: 'icemen 95.0 · 58.8 · 80%', bar: 0.8 } })])[0]!;
    expect(compactText(b, NOW)).toBe('icemen 95.0 · 58.8 · 80%');
  });
});

describe('a big moment for my team', () => {
  const c = (rid: number, pid: string, delta: number, at: number): RawChange => ({ id: `${at}-${rid}-${pid}`, at, clock: at, rid, pid, matchupId: 1, delta, total: delta });

  it('is a jump of six points or more between two polls, in my score only', () => {
    expect(BIG_MOMENT).toBe(6);
    expect(bigMoments([c(1, 'r1', 6.4, 100)], 1, 0)).toEqual([{ at: 100, delta: 6.4, pid: 'r1', players: 1 }]);
    expect(bigMoments([c(1, 'r1', 5.9, 100)], 1, 0)).toEqual([]);
    expect(bigMoments([c(2, 'r2', 12, 100)], 1, 0)).toEqual([]);
  });

  it('adds up a poll (a touchdown and the two-point try are one jump), names the biggest scorer and counts the movers', () => {
    const out = bigMoments([c(1, 'q1', 1.2, 100), c(1, 'r1', 6, 100), c(1, 'w1', 0.4, 100)], 1, 0);
    expect(out[0]).toMatchObject({ delta: 7.6, pid: 'r1', players: 3 });
    expect(bigMomentText(out[0]!, 'Rex Runner')).toBe('+7.6 · runner +2');
    expect(bigMomentText({ at: 1, delta: 6.4, pid: 'r1', players: 1 }, 'Ja’Marr Chase')).toBe('+6.4 · chase');
  });

  it('ignores polls already seen, and a score correction that went down', () => {
    expect(bigMoments([c(1, 'r1', 6.4, 100)], 1, 100)).toEqual([]);
    expect(bigMoments([c(1, 'r1', -7, 200)], 1, 0)).toEqual([]);
    expect(bigMoments([c(1, 'r1', 6.4, 100), c(1, 'q1', 9, 200)], 1, 50).map((b) => b.at)).toEqual([200, 100]);
  });
});

/* ---------- kickoff, waivers, draft, recap ---------- */

const week = (when: string) => ctx(when);

describe('the kickoff activity', () => {
  it('names the first kickoff, my starters in that window, and anyone flagged or on a bye', () => {
    const c = week('2026-10-22T17:00');
    const withInjury = {
      ...c,
      model: model({
        starters: [
          ...starters().map((s) => (s.pid === 'wr1' ? { ...s, injury: 'Questionable' } : s)),
          { pid: 'sea', name: 'sam darnold', pos: 'QB', nfl: 'CHI', injury: '', played: false },
        ],
      }),
    };
    // BUF plays Thursday; DAL, KC, SF, CIN later; BAL, SEA and CHI have no game this week
    const list = moments(withInjury);
    const m = list.find((x) => x.kind === 'game-day')!;
    const d = kickoffData(withInjury, m)!;
    expect(d.at).toBe(at('2026-10-22T19:15'));
    expect(d.game).toBe('nyj at buf');
    // only BUF (josh allen, bills d/st) plays in the first window
    expect(d.playing.map((p) => p.name)).toEqual(['josh allen', 'bills d/st']);
    expect(d.startersTotal).toBe(7);
    expect(d.flags).toEqual([
      { pid: 'rb', name: 'derrick henry', status: 'on bye' },
      { pid: 'wr1', name: 'ceedee lamb', status: 'questionable' },
      { pid: 'wr2', name: 'jaxon smith-njigba', status: 'on bye' },
      { pid: 'sea', name: 'sam darnold', status: 'on bye' },
    ]);
  });

  it('puts games within 90 minutes in one window, and skips a starter who already played', () => {
    const c0 = week('2026-10-25T09:00');
    const c = { ...c0, schedule: { ...c0.schedule, games: week7({ tnf: 'final' }) } };
    const m = moments(c).find((x) => x.kind === 'final-check')!;
    // Sunday: KC at DEN and SF at LAR kick off together at noon; DAL at 3:25 is another window
    const d = kickoffData(c, m)!;
    expect(d.at).toBe(at('2026-10-25T12:00'));
    expect(d.playing.map((p) => p.name)).toEqual(['travis kelce']);
    const played = { ...c, model: model({ starters: starters().map((s) => (s.pid === 'te' ? { ...s, played: true, injury: 'Out' } : s)) }) };
    expect(kickoffData(played, m)!.flags.map((f) => f.pid)).not.toContain('te');
  });

  it('is null without the context', () => {
    expect(kickoffData(null, moment())).toBeNull();
  });
});

describe('the waivers activity', () => {
  it('has the top two adds, the FAAB left, and when the claims run', () => {
    const top = { pid: 'km', name: 'kyler murray', pos: 'QB', gain: 19, bid: 76, dropName: 'bench qb' };
    const second = { pid: 'tj', name: 'tyjae spears', pos: 'RB', gain: 7.2, bid: 31, dropName: 'bench rb' };
    const c = ctx('2026-10-20T20:00', { model: model({ waiver: { top, faab: true, adds: [top, second] }, faabLeft: 1320 }) });
    const m = moment({ kind: 'waivers-tonight', countdownTo: NOW + 3 * H, label: 'waivers' });
    expect(waiversData(c, m)).toEqual({ runAt: NOW + 3 * H, adds: [top, second], faab: true, faabLeft: 1320, known: true });
    // a league without bids has no FAAB left to show
    const free = ctx('2026-10-20T20:00', { model: model({ waiver: { top, faab: false }, faabLeft: 1320 }) });
    expect(waiversData(free, m)).toMatchObject({ adds: [top], faab: false, faabLeft: null });
    // the board is not worked out yet
    expect(waiversData(ctx('2026-10-20T20:00', { model: model({ waiver: null }) }), m)).toMatchObject({ adds: [], known: false });
    expect(waiversData(null, m).known).toBe(false);
  });
});

describe('the draft activity', () => {
  const info: DraftLiveInfo = {
    picksUntil: 4, nextPick: 27,
    best: [{ pid: '1', name: 'justin jefferson', pos: 'WR', team: 'MIN', tier: 1, vor: 92.4 }],
    needs: ['rb', 'te'], last: { pickNo: 23, name: 'saquon barkley', pos: 'RB', by: 'killa k im gay' },
  };

  it('reads the picks until my turn from the draft context, else from the moment', () => {
    const clock = moment({ kind: 'draft-clock', title: 'you’re on the clock in 4 picks', live: true });
    expect(draftData(null, clock, info)).toMatchObject({ mode: 'clock', picksUntil: 4, info });
    expect(draftData(null, moment({ kind: 'draft-clock', title: 'you’re on the clock', live: true }), null).picksUntil).toBe(0);
    expect(draftData(null, moment({ kind: 'draft-clock', title: 'the draft is live', live: true }), null).picksUntil).toBeNull();
    const c = ctx('2026-10-22T17:00', { draft: { status: 'drafting', startTime: null, mySlot: 9, teams: 12, picksUntilMine: 2, tierPos: null, grade: null } });
    expect(draftData(c, clock, null)).toMatchObject({ picksUntil: 2, mySlot: 9, teams: 12 });
  });

  it('compacts to "on the clock", "pick in 4", "draft paused" or a countdown', () => {
    const line = (title: string, extra: Partial<Moment> = {}) => compactText(buildActivities([moment({ kind: 'draft-clock', title, live: true, ...extra })])[0]!, NOW);
    expect(line('you’re on the clock')).toBe('on the clock');
    expect(line('you’re on the clock in 4 picks')).toBe('pick in 4');
    expect(line('you’re on the clock in 1 pick')).toBe('pick in 1');
    expect(line('the draft is live')).toBe('draft live');
    expect(line('the draft is paused')).toBe('draft paused');
    const countdown = buildActivities([moment({ kind: 'draft-countdown', title: 'the draft starts in 3d 4h', countdownTo: NOW + 76 * H, label: 'draft' })])[0]!;
    expect(compactText(countdown, NOW)).toBe('draft 3d 4h');
  });
});

describe('the recap activity', () => {
  const finalCtx = (over: Partial<ReturnType<typeof ctx>> = {}) => ctx('2026-10-26T23:00', {
    live: { mine: { name: 'icemen', pts: 112.3, left: [], top: { name: 'caleb williams', pts: 31.2 } }, theirs: { name: 'killa k im gay', pts: 98, left: [] }, winP: 1, started: true, final: true, week: 7, finalAt: NOW },
    previous: { week: 7, playoffPct: 0.66 }, model: model({ playoffPct: 0.74 }), ...over,
  });

  it('has the result, my top scorer and the odds before and after', () => {
    const d = recapData(finalCtx(), null)!;
    expect(d).toEqual({ week: 7, verdict: 'W', mine: 112.3, theirs: 98, oppName: 'killa k im gay', top: { name: 'caleb williams', pts: 31.2 }, odds: { from: 0.66, to: 0.74 } });
    const a = buildActivities([moment({ id: 'final-whistle', kind: 'final-whistle', glance: true })], { ctx: finalCtx(), view: null, changes: [], draft: null })[0]!;
    expect(compactText(a, NOW)).toBe('W 112.3–98.0');
    expect(activityTitle(a)).toBe('final');
  });

  it('leaves out the odds when the first look at the week was not kept, and reads a loss and a tie', () => {
    expect(recapData(finalCtx({ previous: null }), null)!.odds).toBeNull();
    expect(recapData(finalCtx({ previous: { week: 6, playoffPct: 0.5 } }), null)!.odds).toBeNull();
    const lost = finalCtx({ live: { mine: { name: 'icemen', pts: 80, left: [] }, theirs: { name: 'killa', pts: 90, left: [] }, winP: 0, started: true, final: true } });
    expect(recapData(lost, null)!.verdict).toBe('L');
    const tied = finalCtx({ live: { mine: { name: 'icemen', pts: 90, left: [] }, theirs: { name: 'killa', pts: 90, left: [] }, winP: 0.5, started: true, final: true } });
    expect(recapData(tied, null)!.verdict).toBe('T');
  });

  it('takes the top scorer from the live view when the context has none, and the result from the model when the live layer is off', () => {
    const noTop = finalCtx({ live: { mine: { name: 'icemen', pts: 112.3, left: [] }, theirs: { name: 'killa', pts: 98, left: [] }, winP: 1, started: true, final: true, week: 7 } });
    expect(recapData(noTop, liveView({ final: true }))!.top).toEqual({ name: 'Walt Wideout', pts: 21 });
    const fromModel = ctx('2026-10-26T23:00', { live: null, model: model({ lastResult: { week: 7, mine: 120, theirs: 100, oppName: 'killa' } }) });
    expect(recapData(fromModel, null)).toMatchObject({ week: 7, verdict: 'W', mine: 120, theirs: 100, top: null });
    expect(recapData(ctx('2026-10-26T23:00', { live: null }), null)).toBeNull();
  });
});

describe('the compact line and the state of each activity', () => {
  const kick = (over: Partial<Moment> = {}) => buildActivities([moment({ kind: 'game-day', label: 'kickoff', precise: true, countdownTo: NOW + H + 42 * MIN + 10_000, ...over })])[0]!;
  const wait = (over: Partial<Moment> = {}) => buildActivities([moment({ kind: 'waivers-tonight', label: 'waivers', countdownTo: NOW + 5 * H + 12 * MIN, ...over })])[0]!;

  it('a countdown is its label and the time left: "kickoff 1:42:10", "waivers 5h 12m", then "now"', () => {
    expect(compactText(kick(), NOW)).toBe('kickoff 1:42:10');
    expect(compactText(wait(), NOW)).toBe('waivers 5h 12m');
    expect(countdownText(moment({ countdownTo: NOW }), NOW, 'go')).toBe('go now');
    expect(compactText(kick({ countdownTo: NOW - 1 }), NOW)).toBe('kickoff now');
    // the Sunday morning check counts to the inactives first
    expect(compactText(kick({ kind: 'final-check', label: 'inactives', countdownTo: NOW + 72 * MIN }), NOW)).toBe('inactives 1:12:00');
  });

  it('an unknown moment keeps the old wording ("deadline in 2d 4h")', () => {
    const a = buildActivities([moment({ kind: 'trade-deadline', label: 'deadline', countdownTo: NOW + 52 * H })])[0]!;
    expect(compactText(a, NOW)).toBe('deadline in 2d 4h');
    expect(compactText(buildActivities([moment({ title: 'a take' })])[0]!, NOW)).toBe('a take');
  });

  it('is urgent under five minutes and soon under half an hour', () => {
    expect(urgency(moment({ countdownTo: NOW + 4 * MIN }), NOW)).toBe('urgent');
    expect(urgency(moment({ countdownTo: NOW + 20 * MIN }), NOW)).toBe('soon');
    expect(urgency(moment({ countdownTo: NOW + 2 * H }), NOW)).toBe('calm');
    expect(urgency(moment({}), NOW)).toBe('calm');
  });

  it('the state changes when the lead changes hands, the clock reaches you, a countdown turns urgent, or the final whistle blows', () => {
    const lead = (bar: number) => buildActivities([moment({ kind: 'live-matchup', live: true, pill: { text: 'x', bar } })])[0]!;
    expect(stateKey(lead(0.8), NOW)).toBe(stateKey(lead(0.6), NOW));
    expect(stateKey(lead(0.8), NOW)).not.toBe(stateKey(lead(0.4), NOW));

    const pick = (title: string) => buildActivities([moment({ kind: 'draft-clock', title, live: true })])[0]!;
    expect(stateKey(pick('you’re on the clock in 9 picks'), NOW)).toBe(stateKey(pick('you’re on the clock in 7 picks'), NOW));
    expect(stateKey(pick('you’re on the clock in 7 picks'), NOW)).not.toBe(stateKey(pick('you’re on the clock in 3 picks'), NOW));
    expect(stateKey(pick('you’re on the clock in 3 picks'), NOW)).not.toBe(stateKey(pick('you’re on the clock'), NOW));

    expect(stateKey(wait(), NOW)).toBe(stateKey(wait({ countdownTo: NOW + 2 * H }), NOW));
    expect(stateKey(wait(), NOW)).not.toBe(stateKey(wait({ countdownTo: NOW + 4 * MIN }), NOW));
    expect(stateKey(kick({ label: 'inactives' }), NOW)).not.toBe(stateKey(kick({ label: 'kickoff' }), NOW));
  });
});

describe('what the engine says is ongoing becomes activities', () => {
  it('Thursday 5 pm: the kickoff countdown, with the waivers one behind it', () => {
    const c = week('2026-10-22T17:00');
    const list = ongoing(moments(c), c.now.getTime());
    const kinds = buildActivities(list, { ctx: c, view: null, changes: [], draft: null }).map((a) => a.kind);
    expect(kinds[0]).toBe('kickoff');
  });

  it('the final whistle and the week recap are glanced at though neither is live', () => {
    const c = week('2026-10-26T23:00');
    const done = { ...c, schedule: { ...c.schedule, games: week7({ tnf: 'final', s1: 'final', s2: 'final', s3: 'final', mnf: 'final' }) }, model: model({ lastResult: { week: 7, mine: 112.3, theirs: 98, oppName: 'killa' } }) };
    const list = ongoing(moments(done), done.now.getTime());
    expect(list.map((m) => m.kind)).toContain('final-whistle');
    const tue = { ...done, now: new Date(at('2026-10-27T09:00')) };
    expect(ongoing(moments(tue), tue.now.getTime()).map((m) => m.kind)).toContain('week-recap');
    // Tuesday afternoon the recap is a line in the plan, not an activity
    const later = { ...done, now: new Date(at('2026-10-27T15:00')) };
    expect(ongoing(moments(later), later.now.getTime()).map((m) => m.kind)).not.toContain('week-recap');
  });
});
