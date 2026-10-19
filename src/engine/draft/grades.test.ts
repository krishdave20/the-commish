// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DraftPick } from '../../data/types.ts';
import type { Pos } from '../types.ts';
import { LETTER_SCALE, gradeDraft, letterSteps, playerPerformance, replacementTotals, showLetter, smoothedMedianCurve } from './grades.ts';
import type { PlayerResult } from './grades.ts';
import { letterGrade } from './mock.ts';
import type { RankedPlayer, Rankings } from './rankings.ts';

/* A hand-built draft: 3 teams, 3 rounds, snake. Slots: QB, RB, WR.
   pick:   1  2  3 | 4  5  6 | 7  8  9
   team:   1  2  3 | 3  2  1 | 1  2  3 */
const OWNER = [1, 2, 3, 3, 2, 1, 1, 2, 3];
const SPEC: Array<{ pid: string; pos: Pos; points: number; vor: number; adp: number | null; toDate: number; ros: number | null }> = [
  { pid: 'P1', pos: 'QB', points: 300, vor: 80, adp: 1, toDate: 40, ros: 60 },
  { pid: 'P2', pos: 'RB', points: 200, vor: 70, adp: 5, toDate: 10, ros: 10 },
  { pid: 'P3', pos: 'WR', points: 220, vor: 60, adp: 1.5, toDate: 30, ros: 50 },
  { pid: 'P4', pos: 'WR', points: 180, vor: 40, adp: 10, toDate: 30, ros: 40 },
  { pid: 'P5', pos: 'RB', points: 150, vor: 30, adp: 2, toDate: 25, ros: 35 },
  { pid: 'P6', pos: 'QB', points: 120, vor: -5, adp: null, toDate: 20, ros: 30 },
  { pid: 'P7', pos: 'RB', points: 100, vor: 10, adp: 20, toDate: 15, ros: 25 },
  { pid: 'P8', pos: 'WR', points: 160, vor: 25, adp: 30, toDate: 40, ros: 45 },
  { pid: 'P9', pos: 'WR', points: 90, vor: -2, adp: 8, toDate: 5, ros: null },
];

const rows: RankedPlayer[] = SPEC.map((s, i) => ({
  pid: s.pid, name: `Player ${s.pid}`, pos: s.pos, team: 'AAA', yearsExp: 3, rookie: false, points: s.points, vor: s.vor, rank: i + 1, posRank: 1, tier: 1,
  adp: s.adp, valueVsAdp: null, fc: null,
}));
const rankings: Rankings = {
  mode: 'redraft', adpField: 'adp_ppr', teams: 3, slots: ['QB', 'RB', 'WR'], replacement: {}, starters: {}, rows, byPid: Object.fromEntries(rows.map((r) => [r.pid, r])),
};
const picks: DraftPick[] = OWNER.map((rid, i) => ({ round: Math.floor(i / 3) + 1, pick_no: i + 1, player_id: SPEC[i]!.pid, roster_id: rid }));
const performance: Record<string, PlayerResult> = Object.fromEntries(SPEC.map((s) => [s.pid, { toDate: s.toDate, ros: s.ros }]));
// today: P3 was traded to team 1, P9 was dropped (on nobody)
const rosters = { 1: ['P1', 'P6', 'P7', 'P3'], 2: ['P2', 'P5', 'P8'], 3: ['P4'] };

const run = (over: Partial<Parameters<typeof gradeDraft>[0]> = {}) => gradeDraft({ rankings, picks, performance, rosters, expectRadius: 1, ...over });
const team = (g: ReturnType<typeof run>, rid: number) => g.teams.find((t) => t.rosterId === rid)!;
const pick = (g: ReturnType<typeof run>, n: number) => g.picks.find((p) => p.pickNo === n)!;

describe('the letter scale', () => {
  it('LETTER_SCALE is exactly the set of letters letterGrade can return, worst first', () => {
    const letters = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(letterGrade);
    expect([...new Set(letters)]).toEqual([...LETTER_SCALE]);
  });
  it('steps count letters up or down; showLetter uses a real minus sign', () => {
    expect(letterSteps('B-', 'A')).toBe(4);
    expect(letterSteps('A', 'B-')).toBe(-4);
    expect(letterSteps('C', 'C')).toBe(0);
    expect(showLetter('A-')).toBe('A−');
  });
});

describe('value vs ADP', () => {
  it('is pick number − ADP: positive when the player went later than the market expected', () => {
    const g = run();
    expect(pick(g, 3).valueVsAdp).toBeCloseTo(1.5); // adp 1.5, taken 3rd: a steal by ADP
    expect(pick(g, 2).valueVsAdp).toBeCloseTo(-3); // adp 5, taken 2nd: a reach
    expect(pick(g, 8).valueVsAdp).toBeCloseTo(-22);
    expect(pick(g, 6).valueVsAdp).toBeNull(); // no ADP
  });
});

describe('draft-day grade', () => {
  const g = run();
  it('sums VOR above replacement only, the lineup, and the clipped ADP value', () => {
    expect(team(g, 1).draftDay.vor).toBe(90); // 80 + max(0,-5) + 10
    expect(team(g, 2).draftDay.vor).toBe(125); // 70 + 30 + 25
    expect(team(g, 3).draftDay.vor).toBe(100); // 60 + 40 + max(0,-2)
    expect(team(g, 1).draftDay.lineup).toBe(400); // QB 300 + RB 100, no WR
    expect(team(g, 2).draftDay.lineup).toBe(360); // RB 200 + WR 160
    expect(team(g, 3).draftDay.lineup).toBe(220); // one WR slot
    expect(team(g, 1).draftDay.adp).toBeCloseTo(-13); // 0 + (no adp) + -13
    expect(team(g, 2).draftDay.adp).toBeCloseTo(-22); // -3 + 3 - 22
    expect(team(g, 3).draftDay.adp).toBeCloseTo(-3.5);
  });
  it('ranks teams by the blended score and turns the rank percentile into a letter', () => {
    expect([1, 2, 3].map((r) => team(g, r).draftDay.rank)).toEqual([2, 1, 3]);
    expect([1, 2, 3].map((r) => team(g, r).draftDay.letter)).toEqual(['B-', 'A', 'F']);
    expect(team(g, 2).draftDay.score).toBeGreaterThan(team(g, 1).draftDay.score);
    expect(team(g, 1).draftDay.score).toBeGreaterThan(team(g, 3).draftDay.score);
    expect(team(g, 2).draftDay.percentile).toBe(1);
    expect(team(g, 1).draftDay.percentile).toBe(0.5);
  });
  it('clips one wild pick so it cannot decide the grade', () => {
    const wild = rows.map((r) => (r.pid === 'P2' ? { ...r, adp: 200 } : r));
    const g2 = run({ rankings: { ...rankings, rows: wild, byPid: Object.fromEntries(wild.map((r) => [r.pid, r])) } });
    // pick 2 with ADP 200 is -198 unclipped; clipped to -24, so team 2's total is -24 + 3 - 22
    expect(team(g2, 2).draftDay.adp).toBeCloseTo(-43);
  });
});

describe('the expectation curve', () => {
  it('is a rolling median that slides inward at the ends and never rises', () => {
    expect(smoothedMedianCurve([10, 9, 8, 20, 6, 5, 4], 1)).toEqual([9, 9, 9, 8, 6, 5, 5]);
    // the raw medians [2,2,3,9,9,9] climb: positions that break the order are pooled into their average, so the curve never rises
    const flat = smoothedMedianCurve([1, 2, 3, 9, 9, 9], 1);
    expect(flat.every((v) => Math.abs(v - 34 / 6) < 1e-9)).toBe(true);
    const mixed = smoothedMedianCurve([10, 10, 10, 0, 10, 0, 0, 0], 0); // radius 0 = the raw list: the 0 then 10 pair pools to 5
    expect(mixed).toEqual([10, 10, 10, 5, 5, 0, 0, 0]);
    expect(mixed.reduce((s, x) => s + x, 0)).toBe(40); // pooling keeps the total
    expect(smoothedMedianCurve([], 3)).toEqual([]);
    // a window wider than the list is the whole list's median everywhere
    expect(smoothedMedianCurve([3, 1, 2], 6)).toEqual([2, 2, 2]);
  });
  it('is made from this draft\'s own totals (points so far + rest of season)', () => {
    const g = run();
    expect(g.picks.map((p) => p.total)).toEqual([100, 20, 80, 70, 60, 50, 40, 85, 5]);
    expect(g.curve).toEqual([80, 80, 70, 70, 60, 50, 50, 40, 40]);
  });
});

describe('position-fair hindsight', () => {
  it('replacementTotals: the N-th best drafted total at the position, the lowest when fewer were drafted, none without a slot', () => {
    const players = [{ pos: 'QB', total: 100 }, { pos: 'QB', total: 50 }, { pos: 'RB', total: 60 }, { pos: 'RB', total: 40 }, { pos: 'RB', total: 20 }, { pos: 'K', total: 9 }];
    expect(replacementTotals(players, { QB: 2, RB: 2, K: 3 })).toEqual({ QB: 50, RB: 40, K: 9 });
    expect(replacementTotals(players, { QB: 1 })).toEqual({ QB: 100 });
  });
  it('measures each total against a replacement player at his position before comparing it with the slot\'s expectation', () => {
    const g = run({ rankings: { ...rankings, starters: { QB: 2, RB: 2, WR: 3 } } });
    expect(g.replacement).toEqual({ QB: 50, RB: 40, WR: 70 });
    expect(g.picks.map((p) => p.value)).toEqual([50, 0, 10, 0, 20, 0, 0, 15, 0]); // never below zero: under replacement is worth nothing
    expect(g.curve).toEqual([10, 10, 5, 5, 0, 0, 0, 0, 0]); // raw medians 10,10,0,10,0,...: the 0, 10 pair pools to 5
    expect(g.picks.map((p) => p.overExp)).toEqual([40, -10, 5, -5, 20, 0, 0, 15, 0]);
    expect(g.picks[0]!.total).toBe(100); // the raw points are still the raw points
  });
  it('reads replacement level from the whole player pool when it is given (free agents included)', () => {
    const pool = [
      { pos: 'QB', total: 100 }, { pos: 'QB', total: 90 }, { pos: 'QB', total: 80 }, { pos: 'QB', total: 70 }, // the 2nd best QB in the league: 90
      { pos: 'RB', total: 300 }, { pos: 'RB', total: 10 }, // 2 starters at RB: the second is 10
    ];
    const g = run({ rankings: { ...rankings, starters: { QB: 2, RB: 2, WR: 3 } }, pool });
    expect(g.replacement).toEqual({ QB: 90, RB: 10 }); // no WR in the pool: no WR replacement
    expect(g.picks[0]!.value).toBe(10); // P1: 100 − 90
    expect(g.picks[2]!.value).toBe(80); // P3 (WR): no baseline, value = total
  });
  it('without starting slots there is no adjustment (value = total)', () => {
    const g = run();
    expect(g.replacement).toEqual({});
    expect(g.picks.every((p) => p.value === p.total)).toBe(true);
  });
});

describe('hindsight grade', () => {
  const g = run();
  it('points over expectation per pick, and summed per team', () => {
    expect(g.picks.map((p) => p.overExp)).toEqual([20, -60, 10, 0, 0, 0, -10, 45, -35]);
    expect(team(g, 1).hindsight.overExp).toBe(10);
    expect(team(g, 2).hindsight.overExp).toBe(-15);
    expect(team(g, 3).hindsight.overExp).toBe(-25);
    expect(team(g, 1).hindsight.total).toBe(190);
  });
  it('ranks and letters teams by it, and reports the move from the draft-day grade', () => {
    expect([1, 2, 3].map((r) => team(g, r).hindsight.rank)).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((r) => team(g, r).hindsight.letter)).toEqual(['A', 'B-', 'F']);
    expect(team(g, 1)).toMatchObject({ rankChange: 1, steps: 4 }); // B- → A
    expect(team(g, 2)).toMatchObject({ rankChange: -1, steps: -4 }); // A → B-
    expect(team(g, 3)).toMatchObject({ rankChange: 0, steps: 0 });
  });
  it('returns the teams best hindsight first', () => {
    expect(g.teams.map((t) => t.rosterId)).toEqual([1, 2, 3]);
  });
});

describe('still rostered', () => {
  const g = run();
  it('kept = still on the drafting team; traded = on another team; dropped = on none', () => {
    expect(pick(g, 1).status).toBe('kept');
    expect(pick(g, 3)).toMatchObject({ status: 'traded', ownerRid: 1 });
    expect(pick(g, 9)).toMatchObject({ status: 'dropped', ownerRid: 0 });
    expect(team(g, 1)).toMatchObject({ kept: 3, traded: 0, dropped: 0 });
    expect(team(g, 3)).toMatchObject({ kept: 1, traded: 1, dropped: 1 });
  });
});

describe('highlights', () => {
  const g = run();
  it('steals and busts are the most and least points over expectation', () => {
    expect(g.steals.map((p) => p.pickNo)).toEqual([8, 1, 3]);
    expect(g.busts.map((p) => p.pickNo)).toEqual([2, 9, 7]);
  });
  it('the best pick of each round (ties go to the earlier pick)', () => {
    expect(g.bestByRound.map((b) => [b.round, b.pick.pickNo])).toEqual([[1, 1], [2, 4], [3, 8]]);
  });
  it('team MVP is the pick with the most total points; best and worst are by points over expectation', () => {
    expect(team(g, 1).mvp?.pickNo).toBe(1);
    expect(team(g, 2).mvp?.pickNo).toBe(8);
    expect(team(g, 3).mvp?.pickNo).toBe(3);
    expect(team(g, 2).best?.pickNo).toBe(8);
    expect(team(g, 2).worst?.pickNo).toBe(2);
  });
  it('the one that got away: the best same-position player another team took soon after, with more points', () => {
    expect(team(g, 1).gotAway).toBeNull(); // nobody at his positions did better right after
    expect(team(g, 2).gotAway).toMatchObject({ gap: 20 }); // RB P2 (20) vs RB P7 (40) three rounds... pick 7
    expect(team(g, 2).gotAway?.mine.pid).toBe('P2');
    expect(team(g, 2).gotAway?.theirs.pid).toBe('P7');
    expect(team(g, 3).gotAway?.mine.pid).toBe('P4'); // WR P4 (70) vs WR P8 (85): biggest gap beats P3's smaller one
    expect(team(g, 3).gotAway?.theirs.pid).toBe('P8');
    expect(team(g, 3).gotAway?.gap).toBe(15);
  });
  it('only counts players taken within the window after the pick', () => {
    const at = (w: number) => team(run({ gotAwayWindow: w }), 2).gotAway;
    expect(at(4)).toBeNull(); // pick 2's RB rival (P7) is 5 picks later
    expect(at(5)?.theirs.pid).toBe('P7');
  });
});

describe('edge cases', () => {
  it('a player missing from the rankings is still graded, named from the pick metadata', () => {
    const odd: DraftPick[] = [...picks, { round: 4, pick_no: 10, player_id: 'X1', roster_id: 1, metadata: { first_name: 'Una', last_name: 'Known', position: 'TE', team: 'ZZZ' } }];
    const g = gradeDraft({ rankings, picks: odd, performance: { ...performance, X1: { toDate: 7, ros: 3 } }, rosters, expectRadius: 1 });
    expect(g.picks[9]).toMatchObject({ name: 'Una Known', pos: 'TE', nfl: 'ZZZ', vor: 0, adp: null, total: 10 });
  });
  it('picks with no roster are ignored; an empty draft is empty', () => {
    expect(gradeDraft({ rankings, picks: [{ round: 1, pick_no: 1, player_id: 'P1', roster_id: null }], performance, rosters }).picks).toHaveLength(0);
    const empty = gradeDraft({ rankings, picks: [], performance, rosters, rosterIds: [1, 2] });
    expect(empty.teams.map((t) => t.hindsight.letter)).toHaveLength(2);
    expect(empty.steals).toEqual([]);
  });
  it('grades a team that made no picks when asked for its roster id', () => {
    const g = run({ rosterIds: [1, 2, 3, 4] });
    expect(team(g, 4).picks).toHaveLength(0);
    expect(team(g, 4).draftDay.letter).toBeDefined();
  });
});

describe('playerPerformance', () => {
  const model = {
    meta: { currentWeek: 4, lastRegularWeek: 6 },
    players: [
      { pid: 'A', pts: { 1: 10, 2: null, 3: 5, 4: 8 }, mu: { 4: 8, 5: 7, 6: 6, 7: 9, 8: 9 }, playedThisWeek: true },
      { pid: 'B', pts: { 1: 1, 2: 2, 3: 3, 4: null }, mu: { 4: 4, 5: 5, 6: 6, 7: 6 }, playedThisWeek: false },
    ],
  };
  it('a modelled player: actual points so far, projection from the current week unless he already played it, through the last regular week', () => {
    const r = playerPerformance(['A', 'B'], model);
    expect(r.A).toEqual({ toDate: 23, ros: 13 }); // 10+5+8; 7+6 (week 4 is already in toDate)
    expect(r.B).toEqual({ toDate: 6, ros: 15 }); // 1+2+3; 4+5+6
  });
  it('someone off the model is scored from the weekly stat lines, with no rest-of-season', () => {
    const extras = {
      stats: { 1: { Z: { gms_active: 1, pts_ppr: 12 } }, 2: { Z: { gms_active: 0, gp: 0, pts_ppr: 99 } }, 3: { Z: { gp: 1, pts_ppr: 3 } } },
      score: (l: Record<string, number>) => l.pts_ppr ?? 0,
    };
    expect(playerPerformance(['Z', 'nobody'], model, extras)).toEqual({ Z: { toDate: 15, ros: null }, nobody: { toDate: 0, ros: null } });
    expect(playerPerformance(['Z'], model)).toEqual({});
  });
});
