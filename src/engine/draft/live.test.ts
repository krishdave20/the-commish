// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bestAvailable, likelyGone, liveSnapshot, myNeeds, pickValues, picksUntilMyTurn, positionalRuns } from './live.ts';
import { buildDraftOrder } from './order.ts';
import { buildRankings } from './rankings.ts';
import { leagueOf, syntheticPool } from './test-helpers.ts';

const TEAMS = 6;
const rankings = buildRankings({ projections: syntheticPool(), league: leagueOf({ teams: TEAMS }) });
const order = buildDraftOrder({ teams: TEAMS, rounds: 12, type: 'snake' });
const pk = (n: number, pid: string, rid = order[n - 1]!.rosterId) => ({ pick_no: n, player_id: pid, roster_id: rid, round: order[n - 1]!.round });

describe('best available', () => {
  it('excludes picked players and sorts by VOR, with tier', () => {
    const all = bestAvailable(rankings, []);
    const top = all[0]!;
    const after = bestAvailable(rankings, [pk(1, top.pid)]);
    expect(after.map((r) => r.pid)).not.toContain(top.pid);
    expect(after.length).toBe(all.length - 1);
    expect(after.every((r, i) => i === 0 || r.vor <= after[i - 1]!.vor)).toBe(true);
    expect(after[0]!.tier).toBeGreaterThanOrEqual(1);
  });
  it('filters by position and limits', () => {
    const rb = bestAvailable(rankings, [pk(1, 'RB1')], { pos: 'RB', limit: 3 });
    expect(rb.map((r) => r.pid)).toEqual(['RB2', 'RB3', 'RB4']);
  });
});

describe('positional runs', () => {
  it('flags a position taken at least 1.75× its expected rate (and 3+ times) in the last N picks', () => {
    const picks = [pk(1, 'WR1'), pk(2, 'QB1'), pk(3, 'RB1'), pk(4, 'RB2'), pk(5, 'RB3'), pk(6, 'RB4'), pk(7, 'RB5'), pk(8, 'WR2')];
    const runs = positionalRuns(rankings, picks, { window: 6 });
    const rb = runs.find((r) => r.pos === 'RB')!;
    expect(rb.observed).toBe(5);
    expect(rb.isRun).toBe(true);
    expect(runs.find((r) => r.pos === 'TE')!.isRun).toBe(false);
    expect(runs[0]!.pos).toBe('RB');
  });
  it('only looks at the last N picks', () => {
    const picks = [pk(1, 'RB1'), pk(2, 'RB2'), pk(3, 'RB3'), pk(4, 'WR1'), pk(5, 'WR2'), pk(6, 'QB1'), pk(7, 'TE1'), pk(8, 'WR3')];
    expect(positionalRuns(rankings, picks, { window: 4 }).find((r) => r.pos === 'RB')!.observed).toBe(0);
    expect(positionalRuns(rankings, [], { window: 4 }).every((r) => !r.isRun)).toBe(true);
  });
});

describe('needs', () => {
  it('lists the starting slots my picks have not filled', () => {
    expect(myNeeds(rankings, [], 3).openSlots.length).toBe(rankings.slots.length);
    const picks = [pk(3, 'QB1', 3), pk(4, 'RB1', 3), pk(5, 'RB2', 3), pk(6, 'RB3', 3), pk(7, 'RB4', 3), pk(8, 'RB5', 3), pk(9, 'DEF1', 99)];
    const n = myNeeds(rankings, picks, 3);
    // QB, RB, RB filled; the two FLEX slots take RB3 and RB4; RB5 is bench; WR, WR, TE, K, DEF still open
    expect(n.openSlots.slice().sort()).toEqual(['DEF', 'K', 'TE', 'WR', 'WR']);
    expect(n.byPosition).toEqual({ DEF: 1, K: 1, TE: 1, WR: 2 });
    expect(n.roster.map((p) => p.pid)).toEqual(['QB1', 'RB1', 'RB2', 'RB3', 'RB4', 'RB5']);
  });
});

describe('value vs ADP', () => {
  it('is pick number − ADP: positive when a player lasts past his ADP', () => {
    const wr = rankings.byPid.WR1!;
    const v = pickValues(rankings, [pk(20, 'WR1'), pk(1, 'RB1'), pk(2, 'ZZZ')]);
    expect(v.map((x) => x.pickNo)).toEqual([1, 2, 20]);
    expect(v[2]!.value).toBe(20 - wr.adp!);
    expect(v[2]!.name).toBe(wr.name);
    expect(v[1]).toMatchObject({ pid: 'ZZZ', adp: null, value: null });
    expect(v[0]!.value).toBe(1 - rankings.byPid.RB1!.adp!);
  });
});

describe('turns and who will be gone', () => {
  it('counts picks until my next turn using the pick order (snake)', () => {
    // roster 3: picks 3, 10, 15, 22 ...
    expect(picksUntilMyTurn(order, [], 3)).toMatchObject({ currentPickNo: 1, nextPickNo: 3, picksBetween: 2 });
    expect(picksUntilMyTurn(order, [pk(1, 'a'), pk(2, 'b')], 3)).toMatchObject({ currentPickNo: 3, nextPickNo: 3, picksBetween: 0 });
    const t = picksUntilMyTurn(order, [pk(1, 'a'), pk(2, 'b'), pk(3, 'c')], 3);
    expect(t).toMatchObject({ currentPickNo: 4, nextPickNo: 10, picksBetween: 6 });
    expect(t.myPicks.slice(0, 3)).toEqual([10, 15, 22]);
  });
  it('is null-safe at the end of the draft', () => {
    const all = order.map((o) => pk(o.pickNo, 'x' + o.pickNo));
    expect(picksUntilMyTurn(order, all, 3)).toEqual({ currentPickNo: null, nextPickNo: null, picksBetween: null, myPicks: [] });
  });
  it('likelyGone: players whose ADP is before my pick, not the ones already picked', () => {
    const gone = likelyGone(rankings, [pk(1, rankings.rows[0]!.pid)], 20);
    expect(gone.length).toBeGreaterThan(0);
    expect(gone.map((g) => g.player.pid)).not.toContain(rankings.rows[0]!.pid);
    expect(gone.every((g) => g.player.adp! < 25)).toBe(true);
    expect(gone.every((g, i) => i === 0 || g.probGone <= gone[i - 1]!.probGone)).toBe(true);
    expect(gone.every((g) => g.likely)).toBe(true);
    // a player right at my pick is a coin flip
    const near = likelyGone(rankings, [], 20, { minProb: 0.3 }).find((g) => Math.abs(g.player.adp! - 19.5) < 1);
    expect(near!.probGone).toBeCloseTo(0.5, 1);
  });
  it('liveSnapshot ties it together', () => {
    const picks = [pk(1, 'RB1'), pk(2, 'WR1'), pk(3, 'RB2', 3)];
    const s = liveSnapshot({ rankings, order, picks, rosterId: 3, limit: 5 });
    expect(s.pickCount).toBe(3);
    expect(s.best.length).toBe(5);
    expect(s.best.map((r) => r.pid)).not.toContain('RB1');
    expect(s.turn.nextPickNo).toBe(10);
    expect(s.values.length).toBe(3);
    expect(s.needs.roster.map((p) => p.pid)).toEqual(['RB2']);
    expect(s.gone.every((g) => g.player.adp! < 10)).toBe(true);
  });
});
