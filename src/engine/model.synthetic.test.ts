// @vitest-environment node
/* buildModel rules checked on tiny hand-made pulls, so every expectation can be worked out by hand. */
import { describe, expect, it } from 'vitest';
import { planPull } from '../data/plan.ts';
import type { NflState, SleeperLeague, SleeperRoster } from '../data/contract.ts';
import type { ProjectionRow, ScheduleGame, WeekStats } from '../data/types.ts';
import { buildModel, FALLBACK_Q, FALLBACK_SD } from './model.ts';
import { SD_CALIBRATION } from './calibration.ts';
import { createScope } from './scenario.ts';
import { quantile, simulate, simulateChunked } from './sim.ts';
import { applyBaseSim, baseSimInput } from './simInput.ts';
import type { LeaguePull } from './types.ts';

interface SP {
  pid: string;
  pos: string;
  team: string;
  inj?: string;
  /** projected points per week (default: week → this number) */
  proj?: number | ((w: number) => number | null);
  /** actual points by week (omit = did not play) */
  actual?: Record<number, number>;
  /** roster id (0 = free agent), IR-reserve flag */
  roster?: number;
  ir?: boolean;
}

function pull(players: SP[], over: { slots?: string[]; schedule?: ScheduleGame[]; rosters?: number } = {}): LeaguePull {
  const state: NflState = { week: 5, season: '2026', season_type: 'regular', league_season: '2026' };
  const league = {
    league_id: 'LG', name: 'Synthetic', season: '2026', status: 'in_season', total_rosters: 2,
    roster_positions: over.slots ?? ['QB', 'RB', 'FLEX', 'BN'], scoring_settings: { rec: 1 },
    settings: { playoff_week_start: 9, playoff_teams: 2, divisions: 0, waiver_budget: 100 },
    previous_league_id: null, draft_id: null, avatar: null, metadata: null,
  } as SleeperLeague;
  const plan = planPull(state, league);
  const projections: Record<number, ProjectionRow[]> = {};
  const stats: Record<number, WeekStats> = {};
  for (const w of [...plan.calWeeks, ...plan.projWeeks]) {
    projections[w] = players.flatMap((p) => {
      const v = typeof p.proj === 'function' ? p.proj(w) : (p.proj ?? 10);
      return v == null ? [] : [{ player_id: p.pid, week: w, team: p.team, stats: { pts_ppr: v }, player: { first_name: p.pid, last_name: 'X', position: p.pos, team: p.team, injury_status: p.inj ?? null } }];
    });
  }
  for (const w of plan.statWeeks) {
    stats[w] = {};
    for (const p of players) if (p.actual && p.actual[w] != null) stats[w]![p.pid] = { pts_ppr: p.actual[w]!, gms_active: 1 };
  }
  const nR = over.rosters ?? 2;
  const rosters: SleeperRoster[] = Array.from({ length: nR }, (_, i) => ({
    roster_id: i + 1, owner_id: `u${i + 1}`, players: players.filter((p) => p.roster === i + 1).map((p) => p.pid), starters: [],
    reserve: players.filter((p) => p.roster === i + 1 && p.ir).map((p) => p.pid), settings: { wins: 0, losses: 0 },
  }));
  const matchups: Record<number, never[]> = {};
  for (const w of plan.matchWeeks) matchups[w] = [];
  return {
    leagueId: 'LG', userId: 'u1', state, league, plan, rosters,
    users: [{ user_id: 'u1', display_name: 'Me', avatar: null }, { user_id: 'u2', display_name: 'You', avatar: null }],
    schedule: over.schedule ?? [], trending: [], matchups, stats, projections, asOf: 123, stale: false, errors: [],
  };
}
const find = (m: ReturnType<typeof buildModel>, pid: string) => m.players.find((p) => p.pid === pid)!;

describe('expected points per player-week', () => {
  const players: SP[] = [
    { pid: 'healthy', pos: 'RB', team: 'AAA', proj: 10, roster: 1 },
    { pid: 'quest', pos: 'RB', team: 'AAA', inj: 'Questionable', proj: 10, roster: 1 },
    { pid: 'doubt', pos: 'RB', team: 'AAA', inj: 'Doubtful', proj: 10, roster: 1 },
    { pid: 'out', pos: 'RB', team: 'AAA', inj: 'Out', proj: 10, roster: 1 },
    { pid: 'irx', pos: 'RB', team: 'AAA', inj: 'IR', proj: 10, roster: 1, ir: true },
    { pid: 'onir', pos: 'RB', team: 'AAA', proj: 10, roster: 1, ir: true }, // on the IR slot, status cleared
    { pid: 'played', pos: 'RB', team: 'AAA', proj: 10, roster: 1, actual: { 5: 23.4 } },
    { pid: 'noproj', pos: 'RB', team: 'AAA', proj: (w) => (w === 7 ? null : 10), roster: 1 },
  ];
  const m = buildModel(pull(players), { userId: 'u1' });
  it('applies the current-week injury multipliers only to the current week', () => {
    expect(find(m, 'healthy').mu[5]).toBe(10);
    expect(find(m, 'quest').mu[5]).toBe(8.5);
    expect(find(m, 'doubt').mu[5]).toBe(3);
    expect(find(m, 'out').mu[5]).toBe(0);
    expect(find(m, 'quest').mu[6]).toBe(10);
    expect(find(m, 'out').mu[6]).toBe(10);
  });
  it('IR players count again from four weeks out (cur+4)', () => {
    for (const pid of ['irx', 'onir']) {
      const p = find(m, pid);
      expect([6, 7, 8].map((w) => p.mu[w])).toEqual([0, 0, 0]);
      expect(p.mu[9]).toBe(10);
      expect(p.onIr).toBe(true);
    }
    expect(find(m, 'irx').mu[5]).toBe(0); // status IR → multiplier 0 this week
    // reference quirk, kept on purpose: this week is decided by the injury multiplier alone, so a player parked on the
    // IR slot whose Sleeper status is blank still scores his projection in the current week
    expect(find(m, 'onir').mu[5]).toBe(10);
  });
  it('a game that already kicked off uses actual points, with floor = ceiling = actual', () => {
    const p = find(m, 'played');
    expect(p.playedThisWeek).toBe(true);
    expect(p.mu[5]).toBe(23.4);
    expect(p.lo[5]).toBe(23.4);
    expect(p.hi[5]).toBe(23.4);
    expect(p.mu[6]).toBe(10);
    expect(p.lo[6]).toBeLessThan(10);
    expect(p.hi[6]).toBeGreaterThan(10);
    expect(p.pts[5]).toBe(23.4);
  });
  it('a week with no projection is worth zero', () => {
    expect(find(m, 'noproj').mu[7]).toBe(0);
    expect(find(m, 'noproj').mu[6]).toBe(10);
  });
  it('team expectations: current week = the actual starters, later weeks = best lineup', () => {
    const t = m.teams.find((x) => x.rid === 1)!;
    // slots QB RB FLEX: no QB; RB and FLEX take the two best RBs
    expect(t.exp[6]).toBe(20);
    expect(t.exp[5]).toBe(0); // no starters set this week
  });
});

describe('calibration', () => {
  /** 40 RBs projected 10 in week 1 with actuals 5..15 (ratios 0.5..1.5), plus 10 in week 4 with the same spread. */
  const week1 = Array.from({ length: 40 }, (_, i): SP => ({
    pid: `a${i}`, pos: 'RB', team: 'AAA', proj: (w) => (w === 1 || w === 4 ? 10 : null), actual: i < 10 ? { 1: 5 + (10 * i) / 39, 4: 5 + (10 * i) / 9 } : { 1: 5 + (10 * i) / 39 }, roster: i % 2 + 1,
  }));
  const m = buildModel(pull(week1), { userId: 'u1' });
  const ratios = week1.map((_, i) => (5 + (10 * i) / 39) / 10).concat(week1.slice(0, 10).map((_, i) => (5 + (10 * i) / 9) / 10));

  it('fits the 20th and 80th percentile of actual÷projected when there are at least 25 samples', () => {
    expect(m.meta.ratioSamples.RB).toBe(50);
    expect(m.meta.floorCeil.RB![0]).toBeCloseTo(quantile(ratios, 0.2), 12);
    expect(m.meta.floorCeil.RB![1]).toBeCloseTo(quantile(ratios, 0.8), 12);
  });
  it('uses the fallback constants for positions with fewer than 25 samples', () => {
    expect(m.meta.ratioSamples.QB).toBe(0);
    expect(m.meta.floorCeil.QB).toEqual(FALLBACK_Q.QB);
    expect(m.meta.floorCeil.DEF).toEqual(FALLBACK_Q.DEF);
    expect(m.meta.residualSd.QB).toBe(FALLBACK_SD.QB);
  });
  it('residual SD per position comes from actual − projected (sample SD)', () => {
    const res = week1.map((_, i) => 5 + (10 * i) / 39 - 10).concat(week1.slice(0, 10).map((_, i) => 5 + (10 * i) / 9 - 10));
    const mean = res.reduce((s, x) => s + x, 0) / res.length;
    const sd = Math.sqrt(res.reduce((s, x) => s + (x - mean) ** 2, 0) / (res.length - 1));
    expect(m.meta.residualSd.RB).toBeCloseTo(sd, 10);
    expect(m.meta.maeProjection).toBeCloseTo(Math.round((res.reduce((s, x) => s + Math.abs(x), 0) / res.length) * 100) / 100, 10);
  });
  it('team SD is the root of the summed slot variances', () => {
    // slots QB RB FLEX: QB fallback, RB fitted, FLEX uses the WR SD (fallback)
    const expected = Math.sqrt(FALLBACK_SD.QB! ** 2 + m.meta.residualSd.RB! ** 2 + FALLBACK_SD.WR! ** 2);
    expect(m.meta.teamWeeklySdRaw).toBeCloseTo(expected, 10);
    expect(m.meta.teamWeeklySd).toBeCloseTo(expected * SD_CALIBRATION, 10); // the SD every probability uses is calibrated
  });
  it('reports held-out coverage: the last calibration week against a band fitted on the earlier ones', () => {
    const train = ratios.slice(0, 40);
    const lo = quantile(train, 0.2), hi = quantile(train, 0.8);
    const test = ratios.slice(40);
    const cov = test.filter((r) => r >= lo && r <= hi).length / test.length;
    expect(m.meta.bandCoverage).toBeCloseTo(Math.round(cov * 100) / 100, 10);
    expect(m.meta.calibrationWeeks).toEqual([1, 2, 3, 4]);
  });
  it('floors and ceilings scale expected points by the fitted ratios', () => {
    const q = buildModel(pull([{ pid: 'solo', pos: 'RB', team: 'AAA', proj: 10, roster: 1 }]), { userId: 'u1' });
    expect(find(q, 'solo').lo[6]).toBe(Math.round(10 * FALLBACK_Q.RB![0] * 100) / 100);
    expect(find(q, 'solo').hi[6]).toBe(Math.round(10 * FALLBACK_Q.RB![1] * 100) / 100);
  });
});

describe('opponents and matchup grades', () => {
  // AAA's RB scores 20 a week, BBB's RB scores 10 a week, weeks 1-4. Schedule: AAA at BBB in weeks 1-6, bye in 7 (BBB plays CCC), AAA-BBB again 8.
  const schedule: ScheduleGame[] = [];
  for (const w of [1, 2, 3, 4, 5, 6, 8, 9]) schedule.push({ week: w, home: 'AAA', away: 'BBB' });
  schedule.push({ week: 7, home: 'BBB', away: 'CCC' });
  const players: SP[] = [
    { pid: 'a', pos: 'RB', team: 'AAA', proj: 15, actual: { 1: 20, 2: 20, 3: 20, 4: 20 }, roster: 1 },
    { pid: 'b', pos: 'RB', team: 'BBB', proj: 15, actual: { 1: 10, 2: 10, 3: 10, 4: 10 }, roster: 2 },
  ];
  const m = buildModel(pull(players, { schedule }), { userId: 'u1' });
  it('opponents come from the schedule and a missing game is a BYE', () => {
    expect(find(m, 'a').opp[6]).toBe('BBB');
    expect(find(m, 'b').opp[6]).toBe('AAA');
    expect(find(m, 'a').opp[7]).toBe('BYE');
    expect(find(m, 'a').dvp[7]).toBeNull();
    expect(find(m, 'b').opp[7]).toBe('CCC');
  });
  it('matchup grade = points the opposing defense allowed ÷ league average at the position', () => {
    // BBB's defense allowed 20 to RBs, AAA's allowed 10: league average 15
    expect(find(m, 'a').dvp[6]).toBeCloseTo(20 / 15, 2); // a faces BBB: soft
    expect(find(m, 'b').dvp[6]).toBeCloseTo(10 / 15, 2); // b faces AAA: tough
    expect(find(m, 'a').dvp[6]).toBeGreaterThanOrEqual(1.15);
    expect(find(m, 'b').dvp[6]).toBeLessThanOrEqual(0.87);
  });
});

describe('free-agent pool', () => {
  const fas: SP[] = Array.from({ length: 20 }, (_, i) => ({ pid: `qb${i}`, pos: 'QB', team: 'AAA', proj: 10 + i }));
  fas.push({ pid: 'cut', pos: 'RB', team: 'AAA', proj: (w) => (w >= 5 ? 0 : 1) }); // projects nothing → not in the pool
  fas.push({ pid: 'noteam', pos: 'RB', team: '' as string, proj: 12 });
  const m = buildModel(pull([{ pid: 'mine', pos: 'QB', team: 'AAA', proj: 5, roster: 1 }, ...fas]), { userId: 'u1' });
  it('caps each position (14 QBs) keeping the highest rest-of-season totals, and skips zero-value and team-less players', () => {
    const qbs = m.players.filter((p) => p.ownerRid === 0 && p.pos === 'QB');
    expect(qbs.length).toBe(14);
    expect(qbs.map((p) => p.pid).sort()).toEqual(Array.from({ length: 14 }, (_, i) => `qb${i + 6}`).sort());
    expect(m.players.some((p) => p.pid === 'cut' || p.pid === 'noteam')).toBe(false);
    expect(m.players.find((p) => p.pid === 'mine')!.ownerRid).toBe(1);
  });
});

describe('team naming', () => {
  const p = () => pull([{ pid: 'x', pos: 'QB', team: 'AAA', roster: 1 }, { pid: 'y', pos: 'QB', team: 'AAA', roster: 2 }], { rosters: 3 });
  it('team name, else the manager\'s display name (no "Team " prefix), else "roster <id>"', () => {
    const pl = p();
    pl.users[0]!.metadata = { team_name: 'Gridiron' };
    pl.users.push({ user_id: 'u3', display_name: '', avatar: null });
    const m = buildModel(pl, { userId: 'u1' });
    expect(m.teams.map((t) => [t.rid, t.team, t.manager])).toEqual([[1, 'Gridiron', 'Me'], [2, 'You', 'You'], [3, 'roster 3', 'roster 3']]);
  });
  it('an empty team_name falls through to the display name', () => {
    const pl = p();
    pl.users[1]!.metadata = { team_name: '' };
    expect(buildModel(pl, { userId: 'u1' }).teams[1]!.team).toBe('You');
  });
  it('a roster whose owner is not in the users list is named by its id', () => {
    const pl = p();
    pl.rosters[1]!.owner_id = 'ghost';
    expect(buildModel(pl, { userId: 'u1' }).teams[1]!.team).toBe('roster 2');
  });
});

describe('initial simulation off the main thread', () => {
  const players: SP[] = [
    { pid: 'q1', pos: 'QB', team: 'AAA', proj: 20, roster: 1 }, { pid: 'q2', pos: 'QB', team: 'AAA', proj: 18, roster: 2 }, { pid: 'q3', pos: 'QB', team: 'AAA', proj: 15, roster: 3 },
  ];
  const withGames = () => {
    const pl = pull(players, { rosters: 3 });
    pl.matchups[5] = [{ roster_id: 1, matchup_id: 1, points: 0 }, { roster_id: 2, matchup_id: 1, points: 0 }];
    pl.matchups[6] = [{ roster_id: 1, matchup_id: 1, points: 0 }, { roster_id: 3, matchup_id: 1, points: 0 }];
    pl.matchups[7] = [{ roster_id: 2, matchup_id: 1, points: 0 }, { roster_id: 3, matchup_id: 1, points: 0 }];
    pl.users.push({ user_id: 'u3', display_name: 'Third', avatar: null });
    return pl;
  };
  it('simulate: false leaves the odds empty and flags oddsPending; applyBaseSim fills exactly what buildModel computes', () => {
    const pl = withGames();
    const pending = buildModel(pl, { userId: 'u1', simulate: false });
    expect(pending.oddsPending).toBe(true);
    for (const t of pending.teams) expect([t.playoffPct, t.divWinPct, t.expWins, t.winsP10, t.winsP90, t.seedPct]).toEqual([0, 0, 0, 0, 0, []]);
    const full = buildModel(pl, { userId: 'u1' });
    expect(full.oddsPending).toBe(false);
    expect(full.teams.some((t) => t.playoffPct > 0)).toBe(true);
    const filled = applyBaseSim(pending, simulate(baseSimInput(pending)));
    expect(filled).toEqual(full);
    expect(filled.oddsPending).toBe(false);
    expect(pending.oddsPending).toBe(true); // the input is not mutated
    expect(pending.teams[0]!.playoffPct).toBe(0);
  });
  it('the same holds on a chunked / worker-style run of the same input', async () => {
    const pl = withGames();
    const pending = buildModel(pl, { userId: 'u1', simulate: false });
    const summary = await simulateChunked(baseSimInput(pending), undefined, { chunk: 500, sliceMs: 1 });
    expect(applyBaseSim(pending, summary!)).toEqual(buildModel(pl, { userId: 'u1' }));
  });
});

describe('teams, divisions and the signed-in team', () => {
  it('uses team metadata and picks the signed-in team from the user id (also via co-owners)', () => {
    const p = pull([{ pid: 'x', pos: 'QB', team: 'AAA', roster: 1 }, { pid: 'y', pos: 'QB', team: 'AAA', roster: 2 }]);
    p.users[0]!.metadata = { team_name: 'Gridiron' };
    const m = buildModel(p, { userId: 'u1' });
    expect(m.teams.map((t) => t.team)).toEqual(['Gridiron', 'You']);
    expect(m.meRid).toBe(1);
    p.rosters[1]!.co_owners = ['u3'];
    expect(buildModel(p, { userId: 'u3' }).meRid).toBe(2);
    expect(m.meta.username).toBe('Me');
  });
  it('with zero divisions every team is its own division; with divisions the setting is used', () => {
    const p = pull([{ pid: 'x', pos: 'QB', team: 'AAA', roster: 1 }]);
    expect(buildModel(p, { userId: 'u1' }).teams.map((t) => t.divId)).toEqual([1, 2]);
    p.league.settings.divisions = 2;
    p.league.metadata = { division_1: 'East', division_2: 'West' };
    p.rosters[0]!.settings.division = 2;
    p.rosters[1]!.settings.division = 1;
    const m = buildModel(p, { userId: 'u1' });
    expect(m.teams.map((t) => [t.divId, t.division])).toEqual([[2, 'West'], [1, 'East']]);
    expect(m.meta.divisions).toBe(2);
  });
  it('IDP slots add the defensive positions to the model', () => {
    const p = pull([{ pid: 'dl1', pos: 'DL', team: 'AAA', roster: 1, proj: 8 }], { slots: ['QB', 'DL', 'IDP_FLEX', 'BN'] });
    const m = buildModel(p, { userId: 'u1' });
    expect(m.meta.positions).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']);
    expect(find(m, 'dl1').pos).toBe('DL');
    expect(m.meta.slots).toEqual(['QB', 'DL', 'IDP_FLEX']);
  });
});

describe('team defenses: Sleeper gives DEF stat lines gp but no gms_active', () => {
  const players: SP[] = [
    { pid: 'DEN', pos: 'DEF', team: 'DEN', proj: 8, roster: 1 },
    { pid: 'SEA', pos: 'DEF', team: 'SEA', proj: 8, roster: 1 },
    { pid: 'rb', pos: 'RB', team: 'AAA', proj: 10, roster: 1, actual: { 5: 11 } },
  ];
  const build = (referenceCompat: boolean) => {
    const p = pull(players, { slots: ['DEF', 'DEF', 'BN'] });
    p.stats[5]!.DEN = { pts_ppr: 14, gp: 1 }; // played: gp 1, no gms_active
    p.stats[5]!.SEA = { pts_ppr: 0, gp: 0 }; // game not played yet
    p.rosters[0]!.starters = ['DEN', 'SEA'];
    return buildModel(p, { userId: 'u1', referenceCompat });
  };

  it('a DEF with gp 1 gets its actual points and is locked in its slot this week', () => {
    const m = build(false);
    const d = find(m, 'DEN');
    expect(d.playedThisWeek).toBe(true);
    expect([d.mu[5], d.lo[5], d.hi[5]]).toEqual([14, 14, 14]);
    expect(d.pts[5]).toBe(14);
    expect(d.mu[6]).toBe(8); // later weeks are still projections
    const sc = createScope(m);
    const L = sc.lineup(sc.myRoster(), 5, true);
    expect(L.slots[0]!.p?.pid).toBe('DEN');
    expect(L.slots[0]!.locked).toBe(true);
    expect(m.teams.find((t) => t.rid === 1)!.exp[5]).toBe(14 + 8); // DEN actual + SEA projection
  });
  it('a DEF with gp 0 does not', () => {
    const m = build(false);
    const d = find(m, 'SEA');
    expect(d.playedThisWeek).toBe(false);
    expect(d.mu[5]).toBe(8);
    expect(d.pts[5]).toBeNull();
    const sc = createScope(m);
    expect(sc.lineup(sc.myRoster(), 5, true).slots[1]!.locked).toBe(false);
  });
  it('with referenceCompat: true neither gets actual points', () => {
    const m = build(true);
    for (const pid of ['DEN', 'SEA']) {
      const d = find(m, pid);
      expect(d.playedThisWeek, pid).toBe(false);
      expect(d.mu[5], pid).toBe(8);
      expect(d.pts[5], pid).toBeNull();
    }
    const sc = createScope(m);
    expect(sc.lineup(sc.myRoster(), 5, true).slots.some((s) => s.locked)).toBe(false);
  });
  it('a gp > 0 line never counts for a non-defense without gms_active', () => {
    const p = pull([{ pid: 'rb', pos: 'RB', team: 'AAA', proj: 10, roster: 1 }]);
    p.stats[5]!.rb = { pts_ppr: 30, gp: 1 };
    const m = buildModel(p, { userId: 'u1' });
    expect(find(m, 'rb').playedThisWeek).toBe(false);
    expect(find(m, 'rb').mu[5]).toBe(10);
  });
});
