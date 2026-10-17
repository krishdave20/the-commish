// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { optimizeLineup } from '../lineup.ts';
import { buildDraftOrder, draftOrderFor } from './order.ts';
import { createMock, gradeRosters, letterGrade } from './mock.ts';
import { buildRankings } from './rankings.ts';
import { leagueOf, syntheticPool } from './test-helpers.ts';

const TEAMS = 6, ROUNDS = 12;
const league = leagueOf({ teams: TEAMS });
const rankings = buildRankings({ projections: syntheticPool(), league });
const order = buildDraftOrder({ teams: TEAMS, rounds: ROUNDS, type: 'snake' });
const make = (o: { seed?: number; user?: number; noise?: number } = {}) => createMock({ rankings, order, userRosterId: o.user ?? 3, seed: o.seed, noise: o.noise });

describe('pick order', () => {
  it('snake: odd rounds forward, even rounds reversed', () => {
    const o = buildDraftOrder({ teams: 4, rounds: 3, type: 'snake' });
    expect(o.map((x) => x.slot)).toEqual([1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4]);
    expect(o.map((x) => x.pickNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(o[5]!.round).toBe(2);
  });
  it('linear never reverses', () => {
    expect(buildDraftOrder({ teams: 3, rounds: 2, type: 'linear' }).map((x) => x.slot)).toEqual([1, 2, 3, 1, 2, 3]);
  });
  it('third-round reversal flips the direction from that round on', () => {
    const o = buildDraftOrder({ teams: 3, rounds: 4, type: 'snake', reversalRound: 3 });
    expect(o.map((x) => x.slot)).toEqual([1, 2, 3, 3, 2, 1, 3, 2, 1, 1, 2, 3]);
  });
  it('slot_to_roster_id maps slots to rosters, and traded picks move single picks', () => {
    const o = buildDraftOrder({
      teams: 4, rounds: 2, type: 'snake', slotToRosterId: { '1': 11, '2': 12, '3': 13, '4': 14 },
      tradedPicks: [{ round: 2, roster_id: 11, owner_id: 14 }],
    });
    expect(o.map((x) => x.rosterId)).toEqual([11, 12, 13, 14, 14, 13, 12, 14]); // roster 11's round-2 pick now belongs to 14
    expect(o[7]).toMatchObject({ slot: 1, originalRosterId: 11, rosterId: 14 });
  });
  it('an unsupported draft type is an error, not a guess', () => {
    expect(() => buildDraftOrder({ teams: 2, rounds: 1, type: 'auction' })).toThrow(/not supported/);
  });
  it('draftOrderFor reads a Sleeper draft object', () => {
    const o = draftOrderFor({ type: 'snake', settings: { teams: 2, rounds: 2, reversal_round: 0 }, slot_to_roster_id: { '1': 7, '2': 9 } });
    expect(o.map((x) => x.rosterId)).toEqual([7, 9, 9, 7]);
  });
});

describe('mock draft state machine', () => {
  it('is deterministic by seed', () => {
    const a = make({ seed: 5 }), b = make({ seed: 5 }), c = make({ seed: 6 });
    a.autoAll(); b.autoAll(); c.autoAll();
    expect(a.state.picks.map((p) => p.pid)).toEqual(b.state.picks.map((p) => p.pid));
    expect(a.state.picks.map((p) => p.pid)).not.toEqual(c.state.picks.map((p) => p.pid));
  });
  it('the user picks at their real slot; bots fill in before it', () => {
    const m = make({ user: 3 });
    expect(m.state.userOnClock).toBe(false);
    const made = m.autoUntilUser();
    expect(made.length).toBe(2);
    expect(m.state.next?.pickNo).toBe(3);
    expect(m.state.userOnClock).toBe(true);
    expect(made.every((p) => !p.byUser)).toBe(true);
    const first = m.available()[0]!;
    const p = m.pick(first.pid);
    expect(p).toMatchObject({ pickNo: 3, rosterId: 3, byUser: true, pid: first.pid });
    // snake: next user pick is 10 (round 2 reversed: slots 6..1 → user's slot 3 is the 4th pick of the round)
    const more = m.autoUntilUser();
    expect(more.length).toBe(6);
    expect(m.state.next?.pickNo).toBe(10);
  });
  it('rejects a pick out of turn, an unknown player and a drafted player', () => {
    const m = make({ user: 3 });
    expect(() => m.pick(rankings.rows[0]!.pid)).toThrow(/not your turn/);
    m.autoUntilUser();
    expect(() => m.pick('nobody')).toThrow(/Unknown/);
    const top = rankings.rows[0]!.pid;
    const taken = m.state.picks[0]!.pid;
    expect(() => m.pick(taken)).toThrow(/already been drafted/);
    expect(top).toBeTruthy();
  });
  it('follows the traded slot map: the user can hold a traded pick', () => {
    const traded = buildDraftOrder({ teams: TEAMS, rounds: ROUNDS, type: 'snake', tradedPicks: [{ round: 1, roster_id: 1, owner_id: 4 }] });
    const m = createMock({ rankings, order: traded, userRosterId: 4, seed: 1 });
    expect(m.autoUntilUser().length).toBe(0); // roster 4 now picks first
    expect(m.state.next).toMatchObject({ pickNo: 1, originalRosterId: 1, rosterId: 4 });
    m.pick(m.available()[0]!.pid);
    const made = m.autoUntilUser();
    expect(made.length).toBe(2); // picks 2 and 3, then roster 4's own slot-4 pick
    expect(m.state.next).toMatchObject({ pickNo: 4, rosterId: 4 });
  });
  it('with no noise bots take the best ADP available among allowed positions', () => {
    const m = make({ noise: 0, user: 6 });
    const made = m.autoUntilUser();
    const adps = made.map((p) => rankings.byPid[p.pid]!.adp!);
    expect(adps).toEqual(adps.slice().sort((a, b) => a - b));
    expect(adps[0]).toBe(1);
  });
  it('bots keep K and DEF for the last 3 rounds and take at most one of each', () => {
    const m = make();
    m.autoAll();
    for (const p of m.state.picks) {
      const pos = rankings.byPid[p.pid]!.pos;
      if (pos === 'K' || pos === 'DEF') expect(p.round, `${pos} in round ${p.round}`).toBeGreaterThan(ROUNDS - 3);
    }
    for (const ids of Object.values(m.state.rosters)) {
      const pos = ids.map((id) => rankings.byPid[id]!.pos);
      expect(pos.filter((x) => x === 'K').length).toBe(1);
      expect(pos.filter((x) => x === 'DEF').length).toBe(1);
    }
  });
  it('bots avoid piling onto one position and every team ends with a full starting lineup', () => {
    for (const seed of [1, 2, 3, 4]) {
      const m = make({ seed });
      m.autoAll();
      expect(m.state.complete).toBe(true);
      expect(m.state.picks.length).toBe(TEAMS * ROUNDS);
      expect(new Set(m.state.picks.map((p) => p.pid)).size).toBe(TEAMS * ROUNDS);
      for (const [rid, ids] of Object.entries(m.state.rosters)) {
        expect(ids.length).toBe(ROUNDS);
        const L = optimizeLineup(ids.map((id) => rankings.byPid[id]!), rankings.slots, { value: (p) => p.points });
        expect(L.slots.every((s) => s.p), `roster ${rid} seed ${seed}`).toBe(true);
        const qbs = ids.filter((id) => rankings.byPid[id]!.pos === 'QB').length;
        expect(qbs).toBeLessThanOrEqual(3);
      }
    }
  });
  it('computes a grade when the draft completes, and not before', () => {
    const m = make({ user: 2 });
    expect(m.state.grade).toBeNull();
    m.autoAll();
    const g = m.state.grade!;
    expect(g.teams).toBe(TEAMS);
    expect(g.rank).toBeGreaterThanOrEqual(1);
    expect(g.rank).toBeLessThanOrEqual(TEAMS);
    expect(g.table.map((t) => t.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.table.every((t, i) => i === 0 || t.total <= g.table[i - 1]!.total)).toBe(true);
    expect(g.table.find((t) => t.rosterId === 2)!.total).toBe(g.total);
    const sorted = g.table.map((t) => t.total).sort((a, b) => a - b);
    expect(g.vsMedian).toBeCloseTo(g.total - (sorted[2]! + sorted[3]!) / 2, 9);
    expect(g.percentile).toBeCloseTo((TEAMS - g.rank) / (TEAMS - 1), 9);
    expect(g.letter).toBe(letterGrade(g.percentile));
    expect(m.grade(5).rosterId).toBe(5);
  });
});

describe('bots obey roster need even when ADP says otherwise', () => {
  const rows = syntheticPool();
  rows.find((r) => r.player_id === 'K1')!.stats.adp_ppr = 1; // ADP says kicker first
  rows.find((r) => r.player_id === 'DEF1')!.stats.adp_ppr = 2;
  rows.filter((r) => r.player!.position === 'QB').forEach((r, i) => { r.stats.adp_ppr = 3 + i / 10; }); // every QB goes in the first 16 picks by ADP
  const r2 = buildRankings({ projections: rows, league });
  it('K / DEF with an early ADP still wait for the last rounds', () => {
    const m = createMock({ rankings: r2, order, userRosterId: 3, seed: 9, noise: 0 });
    m.autoAll();
    for (const p of m.state.picks) {
      const pos = r2.byPid[p.pid]!.pos;
      if (pos === 'K' || pos === 'DEF') expect(p.round).toBeGreaterThan(ROUNDS - 3);
    }
  });
  it('a team does not stack quarterbacks just because ADP is high for all of them', () => {
    const m = createMock({ rankings: r2, order, userRosterId: 3, seed: 9, noise: 0 });
    m.autoAll();
    for (const ids of Object.values(m.state.rosters)) expect(ids.filter((id) => r2.byPid[id]!.pos === 'QB').length).toBeLessThanOrEqual(2);
  });
});

describe('grading', () => {
  it('ranks lineups, reports points vs the median and letters from the percentile', () => {
    const rows = rankings.rows;
    const pick = (ids: string[]) => ids.map((id) => rankings.byPid[id]!);
    const strong = pick(['RB1', 'RB2', 'WR1', 'WR2', 'QB1', 'TE1', 'RB3', 'WR3', 'K1', 'DEF1']);
    const mid = pick(['RB10', 'RB11', 'WR10', 'WR11', 'QB5', 'TE5', 'RB12', 'WR12', 'K5', 'DEF5']);
    const weak = pick(['RB30', 'RB31', 'WR30', 'WR31', 'QB12', 'TE12', 'RB32', 'WR32', 'K9', 'DEF9']);
    const g = gradeRosters({ 1: strong, 2: mid, 3: weak }, rankings.slots, 2);
    expect(g.rank).toBe(2);
    expect(g.table.map((t) => t.rosterId)).toEqual([1, 2, 3]);
    expect(g.vsMedian).toBe(0); // the middle team is the median
    expect(g.letter).toBe('B-'); // percentile 0.5
    expect(gradeRosters({ 1: strong, 2: mid, 3: weak }, rankings.slots, 1).letter).toBe('A');
    expect(gradeRosters({ 1: strong, 2: mid, 3: weak }, rankings.slots, 3).letter).toBe('F');
    expect(rows.length).toBeGreaterThan(0);
  });
  it('letter grades by percentile', () => {
    expect([1, 0.9, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.05, 0].map(letterGrade)).toEqual(['A', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'F']);
  });
});
