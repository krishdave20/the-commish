import { describe, expect, it } from 'vitest';
import { buildView, diffSnapshots } from '../../engine/live';
import type { RawChange } from '../../engine/live';
import { ctx, games, snapshot } from '../../engine/live/test-helpers';
import { gapOf, liveStarter, sortMatchups, topStarters } from './aroundSort';
import { playsFromChanges, topPlays } from './drivePlays';
import { resolveWeek } from './weekParam';
import { centerScrollLeft, weekList } from './weekRange';

describe('which week', () => {
  it('reads ?week=N, clamped to the weeks that have happened', () => {
    expect(resolveWeek('3', 6, false)).toBe(3);
    expect(resolveWeek('6', 6, false)).toBe(6);
    expect(resolveWeek('99', 6, false)).toBe(6);
    expect(resolveWeek('1', 6, true)).toBe(1);
  });

  it('still reads the old "now" and "last"', () => {
    expect(resolveWeek('now', 6, true)).toBe(6);
    expect(resolveWeek('last', 6, false)).toBe(5);
    expect(resolveWeek('last', 1, false)).toBe(1);
  });

  it('opens on last week’s finals on an off-day and on this week otherwise', () => {
    expect(resolveWeek(null, 6, true)).toBe(5);
    expect(resolveWeek(null, 6, false)).toBe(6);
    expect(resolveWeek(null, 1, true)).toBe(1);
  });

  it('ignores nonsense', () => {
    for (const raw of ['', 'abc', '0', '-2', '2.5']) expect(resolveWeek(raw, 6, false)).toBe(6);
  });
});

describe('the week chips', () => {
  it('lists weeks 1 to the current week', () => {
    expect(weekList(6)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(weekList(0)).toEqual([]);
    expect(weekList(30)).toHaveLength(22);
  });

  it('scrolls a chip to the middle of the row, never past either end', () => {
    // a 300 px row in 900 px of chips, 44 px chips
    const box = { width: 300, scrollWidth: 900 };
    expect(centerScrollLeft(box, { left: 450, width: 44 })).toBe(450 - 128);
    expect(centerScrollLeft(box, { left: 0, width: 44 })).toBe(0);
    expect(centerScrollLeft(box, { left: 880, width: 44 })).toBe(600);
    // everything fits: no scrolling
    expect(centerScrollLeft({ width: 300, scrollWidth: 300 }, { left: 100, width: 44 })).toBe(0);
  });
});

describe('sorting the cards', () => {
  const c = ctx();
  // matchup 1: icemen lead by 7 with games live; matchup 2: a 50-point gap, all over
  const view = buildView(c, snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2, q3: 30, r3: 20, w3: 10, q4: 5, r4: 3, w4: 2 }, [...games('live', 0.5).slice(0, 3), ...games('final').slice(3)]));
  const ids = (list: ReturnType<typeof sortMatchups>) => list.map((m) => m.id);

  it('puts the closest first, or the biggest', () => {
    expect(ids(sortMatchups(view.matchups, 'closest', false))).toEqual([1, 2]);
    expect(ids(sortMatchups(view.matchups, 'biggest', false))).toEqual([2, 1]);
    expect(gapOf(view.matchups[0]!, false)).toBe(12);
  });

  it('puts the matchups with starters live first, then those still to come, then the finished ones', () => {
    const mixed = buildView(c, snapshot({ q3: 30, r3: 20, w3: 10, q4: 5, r4: 3, w4: 2 }, [...games('pre').slice(0, 2), ...games('final').slice(2)]));
    // matchup 1 has not started, matchup 2 is over
    expect(ids(sortMatchups(mixed.matchups, 'live', false))).toEqual([1, 2]);
    expect(mixed.matchups.map((m) => [m.started, m.final])).toEqual([[false, false], [true, true]]);
    expect(ids(sortMatchups(view.matchups, 'live', false))[0]).toBe(1);
    const liveOver = buildView(c, snapshot({ q1: 10, q3: 30 }, [...games('final').slice(0, 3), ...games('live', 0.5).slice(3)]));
    expect(ids(sortMatchups(liveOver.matchups, 'live', false))[0]).toBe(2);
  });

  it('measures the gap by the projections before anyone has scored', () => {
    const pre = buildView(c, snapshot({}, games('pre')));
    expect(gapOf(pre.matchups[0]!, true)).toBeCloseTo(1, 5);
  });

  it('shows each team’s two best starters, by points', () => {
    const m = view.matchups[1]!;
    expect(topStarters(m.a).map((p) => p.name)).toEqual(['Tom Thrower', 'Rob Rusher']);
  });

  it('calls out a live starter, preferring one whose unit is on the field', () => {
    expect(liveStarter(view.matchups[0]!)?.state).toBe('live');
    expect(liveStarter(buildView(c, snapshot({}, games('final'))).matchups[0]!)).toBeNull();
    // both teams of matchup 1 have the ball somewhere: the QB on the team with possession is on the field, the other is not
    const live = games('live', 0.5).map((g) => (g.home === 'AAA' ? { ...g, situation: { possession: 'AAA', yardLine: 30, territory: 'AAA', down: 1, distance: '10', downText: '1st & 10', redZone: false, homeTimeouts: 3, awayTimeouts: 3 } } : g));
    const v = buildView(c, snapshot({ q1: 1, q2: 30 }, live));
    // Walt Wideout (AAA is q1's team: Alex Arm) is on the field; the opponent's 30-point quarterback is not
    expect(liveStarter(v.matchups[0]!)?.name).toBe('Alex Arm');
  });
});

describe('the plays on the drive chart', () => {
  const c = ctx();
  const first = snapshot({ q1: 0 }, games('live', 0.5), { at: 10, clock: 10 });
  const second = snapshot({ q1: 6.4, q2: 3 }, games('live', 0.55), { at: 20, clock: 20 });

  it('turns each scoring update into a play with the game as it stood then', () => {
    const changes = diffSnapshots(first, second);
    const rows = playsFromChanges(changes, c, [first, second], 1, 2);
    const chase = rows.find((r) => r.play.name === 'alex arm')!;
    expect(chase.play).toMatchObject({ points: 6.4, side: 'me', where: 'aaa vs bbb · q3 7:30' });
    expect(rows.find((r) => r.play.name === 'quinn quarterback')!.play.side).toBe('opp');
  });

  it('files the rest of the league as “other”, and keeps the newest 60', () => {
    const rows = playsFromChanges([{ id: 'x', at: 20, clock: 20, rid: 3, pid: 'q3', matchupId: 2, delta: 2, total: 2 } satisfies RawChange], c, [second], 1, 2);
    expect(rows[0]!.play.side).toBe('other');
    const many = Array.from({ length: 90 }, (_, i) => ({ id: `c${i}`, at: 20, clock: 20 + i, rid: 1, pid: 'q1', matchupId: 1, delta: 1, total: i }));
    expect(playsFromChanges(many, c, [second], 1, 2)).toHaveLength(60);
  });

  it('has no game text when no snapshot was kept for that poll', () => {
    const rows = playsFromChanges([{ id: 'x', at: 99, clock: 99, rid: 1, pid: 'q1', matchupId: 1, delta: 2, total: 2 }], c, [second], 1, 2);
    expect(rows[0]!.play.where).toBe('');
  });

  it('shows a finished week’s top scoring starters when there is nothing to replay, in kickoff order', () => {
    const view = buildView(c, snapshot({ q1: 12, r1: 5, w1: 6, q2: 30, r2: 3, w2: 2, q3: 8, r3: 8, w3: 8, q4: 1, r4: 1, w4: 1 }, games('final')));
    const rows = topPlays(view, 1, 2, 3);
    expect(rows).toHaveLength(3);
    // the three biggest scores are q2's 30, q1's 12 and r3 / w3 / q3's 8; shown by when their games started
    expect(rows.map((r) => r.play.points).sort((a, b) => b - a)[0]).toBe(30);
    const times = rows.map((r) => r.play.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times.slice().sort((a, b) => a - b));
    expect(rows.every((r) => r.play.where.endsWith('final'))).toBe(true);
    expect(rows.find((r) => r.play.name === 'quinn quarterback')!.play.side).toBe('opp');
  });
});
