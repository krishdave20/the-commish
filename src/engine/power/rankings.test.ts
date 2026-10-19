// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { handModel } from '../test-helpers.ts';
import { rateTeams } from '../draft/ratings.ts';
import { bumpData } from './bump.ts';
import { topPlayers } from './players.ts';
import { buildPowerRankings, rankWeek, rosStrength } from './rankings.ts';
import { blend } from './score.ts';
import { powerRankingsReady } from './signal.ts';
import { POINTS, RIDS, league } from './test-helpers.ts';

const model = league(); // cur 5: four finished weeks, so rankings for weeks 2..5
const r = buildPowerRankings(model);
const wk = (n: number) => r.weeks.find((w) => w.week === n)!;
const rankOf = (n: number, rid: number) => wk(n).teams.find((t) => t.rid === rid)!;

describe('the set of weeks', () => {
  it('runs from week 2 (results from week 1) to the current week, oldest first', () => {
    expect(r.weeks.map((w) => w.week)).toEqual([2, 3, 4, 5]);
    expect(r.weeks.map((w) => w.through)).toEqual([1, 2, 3, 4]);
    expect(r.currentWeek).toBe(5);
  });
  it('is empty before any week is final, and has one set (no movement) after week 1', () => {
    expect(buildPowerRankings(league({ points: [], cur: 1 })).weeks).toEqual([]);
    const one = buildPowerRankings(league({ points: [POINTS[0]!], cur: 2 }));
    expect(one.weeks.map((w) => w.week)).toEqual([2]);
    expect(one.weeks[0]!.teams.every((t) => t.movement === null && t.prevRank === null)).toBe(true);
    expect(one.weeks[0]!.riser).toBeNull();
    expect(one.weeks[0]!.faller).toBeNull();
  });
  it('stops after the regular season: no roster part once it is over', () => {
    const over = buildPowerRankings(league({ cur: 10, last: 4 }));
    expect(over.weeks[over.weeks.length - 1]!.week).toBe(5);
    expect(over.weeks.every((w) => !w.hasRos)).toBe(true);
  });
  it('an unfinished current week (rows with final false) is not counted', () => {
    const m = league();
    m.history.push(
      { key: 'w5-1', week: 5, rid: 1, opp: 2, pts: 999, oppPts: 0, final: false },
      { key: 'w5-2', week: 5, rid: 2, opp: 1, pts: 0, oppPts: 999, final: false },
    );
    const again = buildPowerRankings(m);
    expect(again.weeks[3]!.through).toBe(4);
    expect(again.weeks[3]!.teams.map((t) => t.rid)).toEqual(r.weeks[3]!.teams.map((t) => t.rid));
    expect(again.weeks[3]!.teams[0]!.record).toEqual(r.weeks[3]!.teams[0]!.record);
  });
});

describe('past weeks leave the roster part out; the current week has it', () => {
  it('only the current week counts ros', () => {
    for (const w of r.weeks.slice(0, -1)) {
      expect(w.hasRos).toBe(false);
      for (const t of w.teams) { expect(t.raw.ros).toBeNull(); expect(t.scaled.ros).toBeNull(); expect(t.ranks.ros).toBeNull(); }
    }
    const now = wk(5);
    expect(now.hasRos).toBe(true);
    for (const t of now.teams) { expect(t.raw.ros).not.toBeNull(); expect(t.scaled.ros).not.toBeNull(); }
  });
  it('ros is the draft room\'s rest-of-season strength', () => {
    const rated = rateTeams({ model }).teams;
    for (const t of rated) expect(rankOf(5, t.rid).raw.ros).toBe(t.rosPts);
    expect(rosStrength(model)[6]).toBe(4 * (10 + 24));
  });
  it('the index of a past week is the results-only blend; the current week\'s blends all four', () => {
    for (const t of wk(4).teams) expect(t.index).toBeCloseTo(blend({ ...t.scaled, ros: null }), 10);
    for (const t of wk(5).teams) expect(t.index).toBeCloseTo(blend(t.scaled), 10);
  });
  it('roster strength moves the strongest roster up (team 6 is last on results, first on paper)', () => {
    const prev = wk(4);
    const withRos = rankWeek(model, 5, prev, rosStrength(model));
    const without = rankWeek(model, 5, prev, null);
    expect(withRos.hasRos).toBe(true);
    expect(without.hasRos).toBe(false);
    expect(withRos.teams.find((t) => t.rid === 6)!.rank).toBeLessThan(without.teams.find((t) => t.rid === 6)!.rank);
  });
  it('opts.ros null skips the roster part everywhere', () => {
    expect(buildPowerRankings(model, { ros: null }).weeks.every((w) => !w.hasRos)).toBe(true);
  });
});

describe('ranking', () => {
  it('week 2 follows the points of week 1 (everything agrees), week 3 repeats it', () => {
    expect(wk(2).teams.map((t) => t.rid)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(wk(3).teams.map((t) => t.rid)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(wk(2).teams[0]!.index).toBe(100);
    expect(wk(2).teams[5]!.index).toBe(0);
  });
  it('ranks are 1..n, best first, and the index never goes up as the rank goes down', () => {
    for (const w of r.weeks) {
      expect(w.teams.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5, 6]);
      for (let i = 1; i < w.teams.length; i++) expect(w.teams[i]!.index).toBeLessThanOrEqual(w.teams[i - 1]!.index + 1e-9);
      for (const t of w.teams) { expect(t.index).toBeGreaterThanOrEqual(0); expect(t.index).toBeLessThanOrEqual(100); }
    }
  });
  it('a tie in the index breaks on points per game, then roster id (teams 1 and 3 tie in week 4)', () => {
    const [a, b] = [rankOf(4, 1), rankOf(4, 3)];
    expect(a.index).toBeCloseTo(b.index, 10);
    expect(a.rank).toBe(1);
    expect(b.rank).toBe(2);
  });
  it('carries the record, all-play record and luck as of that week', () => {
    const t = rankOf(3, 1);
    expect(t.record.w + t.record.l + t.record.t).toBe(2);
    expect(t.games).toBe(2);
    expect(rankOf(5, 1).games).toBe(4);
    expect(rankOf(5, 3).record).toEqual({ w: 3, l: 1, t: 0 });
  });
  it('is stable: the same model gives the same rankings and lines', () => {
    expect(buildPowerRankings(model)).toEqual(buildPowerRankings(model));
  });
});

describe('movement', () => {
  it('is places gained against the previous week: + up, − down, 0 level, null the first week', () => {
    expect(wk(2).teams.every((t) => t.movement === null)).toBe(true);
    expect(wk(3).teams.every((t) => t.movement === 0)).toBe(true);
    // week 4: team 3 up one, team 6 up one, team 2 down one, team 5 down one, teams 1 and 4 level
    const m = Object.fromEntries(RIDS.map((rid) => [rid, rankOf(4, rid).movement]));
    expect(m).toEqual({ 1: 0, 2: -1, 3: 1, 4: 0, 5: -1, 6: 1 });
    for (const w of r.weeks.slice(1)) for (const t of w.teams) expect(t.movement).toBe(t.prevRank! - t.rank);
  });
  it('the riser and faller are the biggest moves, the better rank breaking a tie', () => {
    expect(wk(4).riser!.rid).toBe(3);
    expect(wk(4).faller!.rid).toBe(2);
    expect(wk(3).riser).toBeNull();
    expect(wk(3).faller).toBeNull();
  });
  it('a one-way week has only a riser or only a faller when nobody moved the other way', () => {
    // movement sums to zero, so both exist whenever anyone moved
    for (const w of r.weeks) expect(Boolean(w.riser)).toBe(Boolean(w.faller));
  });
});

describe('the bump chart data', () => {
  const d = bumpData(r);
  it('has the weeks, the number of teams, and one series per team ordered by the latest rank', () => {
    expect(d.weeks).toEqual([2, 3, 4, 5]);
    expect(d.teams).toBe(6);
    expect(d.series).toHaveLength(6);
    expect(d.series.map((s) => s.rid)).toEqual(wk(5).teams.map((t) => t.rid));
  });
  it('each series has a rank for every week, equal to the rankings', () => {
    for (const s of d.series) {
      expect(s.points.map((p) => p.week)).toEqual([2, 3, 4, 5]);
      for (const p of s.points) expect(p.rank).toBe(rankOf(p.week, s.rid).rank);
      expect(s.team).toBe(`Team ${s.rid}`);
    }
  });
  it('flags your team once and every week\'s ranks are a permutation of 1..n', () => {
    expect(d.series.filter((s) => s.isMe).map((s) => s.rid)).toEqual([1]);
    for (const w of d.weeks) expect(d.series.map((s) => s.points.find((p) => p.week === w)!.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('is empty without rankings', () => {
    expect(bumpData({ weeks: [], currentWeek: 1 })).toEqual({ weeks: [], teams: 0, series: [] });
  });
});

describe('the moments signal', () => {
  it('says where a team stands in a week\'s rankings', () => {
    const up = powerRankingsReady(r, 4, 3)!;
    expect(up).toMatchObject({ week: 4, rid: 3, rank: 2, movement: 1, text: "you're up to 2nd" });
    expect(powerRankingsReady(r, 4, 2)!.text).toBe("you're down to 3rd");
    expect(powerRankingsReady(r, 4, 1)!.text).toBe("you're 1st");
    expect(powerRankingsReady(r, 2, 4)!.movement).toBeNull();
  });
  it('is null for a week with no rankings or an unknown team', () => {
    expect(powerRankingsReady(r, 9, 1)).toBeNull();
    expect(powerRankingsReady(r, 4, 99)).toBeNull();
  });
});

describe('the two players beside a team', () => {
  const m = handModel({
    cur: 5, last: 8, slots: ['QB', 'RB'], teams: [{ rid: 1 }, { rid: 2 }],
    players: [
      { pid: 'a', pos: 'QB', mu: 20, owner: 1, name: 'A' }, { pid: 'b', pos: 'RB', mu: 15, owner: 1, name: 'B' }, { pid: 'c', pos: 'WR', mu: 12, owner: 1, name: 'C' },
      { pid: 'k', pos: 'K', mu: 99, owner: 1, name: 'K' }, { pid: 'd', pos: 'DEF', mu: 99, owner: 1, name: 'D' }, { pid: 'e', pos: 'RB', mu: 50, owner: 2, name: 'E' },
      { pid: 'f', pos: 'RB', mu: 50, owner: 0, name: 'F' },
    ],
  });
  it('are the best by rest-of-season points, never a kicker or defense, and only his own roster', () => {
    expect(topPlayers(m, 1).map((p) => p.pid)).toEqual(['a', 'b']);
    expect(topPlayers(m, 2).map((p) => p.pid)).toEqual(['e']);
    expect(topPlayers(m, 1, 3).map((p) => p.pid)).toEqual(['a', 'b', 'c']);
  });
});
