// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handModel } from '../test-helpers.ts';
import type { HandPlayer } from '../test-helpers.ts';
import type { Pos } from '../types.ts';
import { DEPTH_WEIGHT, POWER_WEIGHTS, groupTier, rateTeams } from './ratings.ts';

/* Four teams, slots QB RB WR TE FLEX, weeks 5..8 (four weeks) and two playoff weeks (9, 10). Constant weekly values. */
const lineup = (rid: number, v: { qb: number; rb: [number, number]; wr: [number, number]; te: number }): HandPlayer[] => [
  { pid: `${rid}qb`, pos: 'QB' as Pos, mu: v.qb, owner: rid },
  { pid: `${rid}rb1`, pos: 'RB' as Pos, mu: v.rb[0], owner: rid }, { pid: `${rid}rb2`, pos: 'RB' as Pos, mu: v.rb[1], owner: rid },
  { pid: `${rid}wr1`, pos: 'WR' as Pos, mu: v.wr[0], owner: rid }, { pid: `${rid}wr2`, pos: 'WR' as Pos, mu: v.wr[1], owner: rid },
  { pid: `${rid}te`, pos: 'TE' as Pos, mu: v.te, owner: rid },
];

const model = handModel({
  cur: 5, last: 8, slots: ['QB', 'RB', 'WR', 'TE', 'FLEX'],
  teams: [
    { rid: 1, wins: 1, pf: 100 }, { rid: 2, wins: 4, pf: 200 }, { rid: 3, wins: 3, pf: 150 }, { rid: 4, wins: 0, pf: 50 },
  ],
  players: [
    ...lineup(1, { qb: 20, rb: [16, 12], wr: [14, 10], te: 8 }),
    ...lineup(2, { qb: 18, rb: [14, 10], wr: [12, 9], te: 7 }),
    ...lineup(3, { qb: 15, rb: [12, 6], wr: [10, 5], te: 6 }),
    ...lineup(4, { qb: 10, rb: [8, 4], wr: [7, 3], te: 3 }),
  ],
});
const by = (r: ReturnType<typeof rateTeams>, rid: number) => r.teams.find((t) => t.rid === rid)!;

describe('rest-of-season strength', () => {
  const r = rateTeams({ model });
  it('is the sum over the remaining regular-season weeks of the best lineup, and the playoff weeks separately', () => {
    // team 1 weekly: QB 20 + RB 16 + WR 14 + TE 8 + FLEX 12 (RB2 beats WR2 10) = 70
    expect(r.weeks).toEqual([5, 6, 7, 8]);
    expect(r.playoffWeeks).toEqual([9, 10]);
    expect(by(r, 1).rosPts).toBe(280);
    expect(by(r, 2).rosPts).toBe(244); // 18+14+12+7+10
    expect(by(r, 3).rosPts).toBe(196); // 15+12+10+6+6
    expect(by(r, 4).rosPts).toBe(128); // 10+8+7+3+4
    expect(by(r, 1).playoffPts).toBe(140);
    expect(by(r, 4).playoffPts).toBe(64);
    expect([1, 2, 3, 4].map((x) => by(r, x).rosRank)).toEqual([1, 2, 3, 4]);
  });
  it('a bye week costs the team that week\'s points', () => {
    const m = handModel({
      cur: 5, last: 8, slots: ['QB'], teams: [{ rid: 1 }, { rid: 2 }],
      players: [{ pid: 'a', pos: 'QB', mu: 10, owner: 1, bye: [6] }, { pid: 'b', pos: 'QB', mu: 10, owner: 2 }],
    });
    const x = rateTeams({ model: m });
    expect(by(x, 1).rosPts).toBe(30);
    expect(by(x, 2).rosPts).toBe(40);
  });
});

describe('power rating', () => {
  const r = rateTeams({ model });
  it('blends scaled ROS strength and scaled points scored 70 / 30', () => {
    expect(POWER_WEIGHTS).toEqual({ ros: 0.7, pf: 0.3 });
    // ros scaled (x − 128) ÷ 152 × 100; pf scaled (x − 50) ÷ 150 × 100
    expect(by(r, 1).power).toBeCloseTo(0.7 * 100 + 0.3 * (50 / 150) * 100, 6);
    expect(by(r, 2).power).toBeCloseTo(0.7 * ((244 - 128) / 152) * 100 + 0.3 * 100, 6);
    expect(by(r, 3).power).toBeCloseTo(0.7 * ((196 - 128) / 152) * 100 + 0.3 * (100 / 150) * 100, 6);
    expect(by(r, 4).power).toBe(0);
  });
  it('ranks by it, lists the teams best first, and every rating is in 0..100', () => {
    expect(r.teams.map((t) => t.rid)).toEqual([2, 1, 3, 4]);
    expect([2, 1, 3, 4].map((x) => by(r, x).powerRank)).toEqual([1, 2, 3, 4]);
    for (const t of r.teams) { expect(t.power).toBeGreaterThanOrEqual(0); expect(t.power).toBeLessThanOrEqual(100); }
  });
  it('the delta is the standings rank minus the power rank (positive = the roster is better than the record)', () => {
    // standings: team 2 (4 wins), 3 (3), 1 (1), 4 (0)
    expect([1, 2, 3, 4].map((x) => by(r, x).recordRank)).toEqual([3, 1, 2, 4]);
    expect([1, 2, 3, 4].map((x) => by(r, x).delta)).toEqual([1, 0, -1, 0]);
  });
  it('uses the page\'s own standings ranks when given, and points for breaks a tie in wins', () => {
    const own = rateTeams({ model, recordRank: { 1: 9, 2: 1, 3: 2, 4: 3 } });
    expect(by(own, 1).delta).toBe(9 - 2);
    const tied = handModel({ cur: 5, last: 8, slots: ['QB'], teams: [{ rid: 1, wins: 2, pf: 10 }, { rid: 2, wins: 2, pf: 30 }], players: [{ pid: 'a', pos: 'QB', mu: 10, owner: 1 }, { pid: 'b', pos: 'QB', mu: 10, owner: 2 }] });
    expect(by(rateTeams({ model: tied }), 2).recordRank).toBe(1);
  });
  it('when nothing separates the teams every rating is 50', () => {
    const flat = handModel({ cur: 5, last: 8, slots: ['QB'], teams: [{ rid: 1 }, { rid: 2 }], players: [{ pid: 'a', pos: 'QB', mu: 10, owner: 1 }, { pid: 'b', pos: 'QB', mu: 10, owner: 2 }] });
    expect(rateTeams({ model: flat }).teams.map((t) => t.power)).toEqual([50, 50]);
  });
});

describe('position groups', () => {
  const r = rateTeams({ model });
  const g = (rid: number, key: string) => by(r, rid).groups.find((x) => x.key === key)!;
  it('has a group for each position the league starts, plus FLEX', () => {
    expect(r.groups).toEqual(['QB', 'RB', 'WR', 'TE', 'FLEX']);
    expect(by(r, 1).groups.map((x) => x.key)).toEqual(['QB', 'RB', 'WR', 'TE', 'FLEX']);
    const noFlex = rateTeams({ model: handModel({ cur: 5, last: 8, slots: ['QB', 'WR'], teams: [{ rid: 1 }], players: [{ pid: 'a', pos: 'QB', mu: 1, owner: 1 }] }) });
    expect(noFlex.groups).toEqual(['QB', 'WR']);
  });
  it('starters come from the slot a player fills; depth is the best bench player at the position', () => {
    expect(g(1, 'QB').starters).toBe(80);
    expect(g(1, 'RB').starters).toBe(64);
    expect(g(1, 'FLEX').starters).toBe(48); // RB2 (12) in the flex slot, four weeks
    expect(g(1, 'WR').depth).toBe(40); // WR2 (10) on the bench, four weeks
    expect(g(1, 'RB').depth).toBe(0); // his second RB is in the flex slot
    expect(g(1, 'WR').score).toBeCloseTo(56 + DEPTH_WEIGHT * 40);
    expect(g(1, 'FLEX').score).toBe(48); // flex is rated on its starters only
  });
  it('ranks each group across the league and sets the tier from the percentile', () => {
    expect([1, 2, 3, 4].map((x) => g(x, 'QB').rank)).toEqual([1, 2, 3, 4]);
    expect([1, 2, 3, 4].map((x) => g(x, 'QB').tier)).toEqual(['elite', 'strong', 'average', 'thin']);
    expect(groupTier(0.75)).toBe('elite');
    expect(groupTier(0.74)).toBe('strong');
    expect(groupTier(0.5)).toBe('strong');
    expect(groupTier(0.25)).toBe('average');
    expect(groupTier(0.24)).toBe('thin');
  });
  it('a twelve-team league splits 3 / 3 / 3 / 3 across the tiers', () => {
    const teams = Array.from({ length: 12 }, (_, i) => ({ rid: i + 1 }));
    const players = teams.map((t) => ({ pid: `q${t.rid}`, pos: 'QB' as Pos, mu: 30 - t.rid, owner: t.rid }));
    const x = rateTeams({ model: handModel({ cur: 5, last: 8, slots: ['QB'], teams, players }) });
    const counts: Record<string, number> = {};
    for (const t of x.teams) counts[t.groups[0]!.tier] = (counts[t.groups[0]!.tier] ?? 0) + 1;
    expect(counts).toEqual({ elite: 3, strong: 3, average: 3, thin: 3 });
  });
});

describe('biggest need and surplus', () => {
  // slots QB RB WR. A: weak QB and WR but a bench RB; B: weak RB; C: middling.
  const m = handModel({
    cur: 5, last: 8, slots: ['QB', 'RB', 'WR'], teams: [{ rid: 1 }, { rid: 2 }, { rid: 3 }],
    players: [
      { pid: 'aq', pos: 'QB', mu: 10, owner: 1 }, { pid: 'ar', pos: 'RB', mu: 20, owner: 1 }, { pid: 'ar2', pos: 'RB', mu: 15, owner: 1 }, { pid: 'aw', pos: 'WR', mu: 5, owner: 1 },
      { pid: 'bq', pos: 'QB', mu: 20, owner: 2 }, { pid: 'br', pos: 'RB', mu: 10, owner: 2 }, { pid: 'bw', pos: 'WR', mu: 15, owner: 2 },
      { pid: 'cq', pos: 'QB', mu: 15, owner: 3 }, { pid: 'cr', pos: 'RB', mu: 12, owner: 3 }, { pid: 'cw', pos: 'WR', mu: 12, owner: 3 },
    ],
  });
  const r = rateTeams({ model: m });
  it('need is the group furthest below the league', () => {
    expect(by(r, 1).need).toBe('WR');
    expect(by(r, 2).need).toBe('RB');
    expect(by(r, 3).need).toBe('RB');
  });
  it('surplus is where bench depth beats the league, never the need and never empty', () => {
    expect(by(r, 1).surplus).toBe('RB'); // a 15-point RB on the bench
    expect(by(r, 2).surplus).toBeNull();
    expect(by(r, 3).surplus).toBeNull();
  });
});

describe('dynasty columns', () => {
  it('appear only when the caller passes dynasty facts, with the value and youth ranks', () => {
    expect(rateTeams({ model }).dynasty).toBe(false);
    expect(rateTeams({ model }).teams.every((t) => t.dynasty === null)).toBe(true);
    const r = rateTeams({
      model,
      dynasty: { 1: { value: 5000, youthShare: 0.5 }, 2: { value: 9000, youthShare: 0.2 }, 3: { value: 7000, youthShare: null }, 4: { value: 1000, youthShare: 0.9 } },
    });
    expect(r.dynasty).toBe(true);
    expect([1, 2, 3, 4].map((x) => by(r, x).dynasty?.valueRank)).toEqual([3, 1, 2, 4]);
    expect([1, 2, 3, 4].map((x) => by(r, x).dynasty?.youthRank)).toEqual([2, 3, null, 1]);
    expect(by(r, 3).dynasty?.youthShare).toBeNull();
  });
});

describe('injured reserve', () => {
  it('a player on IR does not count for the weeks the model keeps him out', () => {
    const m = handModel({
      cur: 5, last: 10, slots: ['QB'], teams: [{ rid: 1 }, { rid: 2 }],
      players: [{ pid: 'a', pos: 'QB', mu: 10, owner: 1, onIr: true }, { pid: 'b', pos: 'QB', mu: 10, owner: 2 }],
    });
    // handModel's own exp has no IR rule; groups follow the model's four-week rule: back from week 9
    const x = rateTeams({ model: m });
    expect(by(x, 1).groups[0]!.starters).toBe(20); // weeks 9 and 10
    expect(by(x, 2).groups[0]!.starters).toBe(60);
  });
});
