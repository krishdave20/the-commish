import { describe, expect, it } from 'vitest';
import { CATEGORIES, aggregateStats, compactWeek, gameLeaders, leaders, playerInfo, teamScoring } from './stats.ts';
import type { PlayerInfo, WeekOfStats } from './stats.ts';
import { buildRecords } from './standings.ts';

const line = (o: Record<string, number>) => ({ gp: 1, ...o });
const week = (n: number, stats: WeekOfStats['stats']): WeekOfStats => ({ week: n, stats });
const info = new Map<string, PlayerInfo>(Object.entries({
  q1: { name: 'Quinn Arm', pos: 'QB', team: 'KC' }, q2: { name: 'Pat Pass', pos: 'QB', team: 'LAC' },
  r1: { name: 'Rex Run', pos: 'RB', team: 'KC' }, r2: { name: 'Rob Rush', pos: 'RB', team: 'LAC' }, r3: { name: 'Ray Back', pos: 'RB', team: 'KC' },
  w1: { name: 'Walt Wide', pos: 'WR', team: 'KC' }, w2: { name: 'Will Winger', pos: 'WR', team: 'LAC' },
  d1: { name: 'Dan Edge', pos: 'DT', team: 'KC' }, d2: { name: 'Cal Corner', pos: 'CB', team: 'LAC' }, d3: { name: 'Back Runner', pos: 'RB', team: 'LAC' },
}).map(([pid, v]) => [pid, { pid, ...v }]));

describe('summing weekly stat lines', () => {
  const weeks = [
    week(1, { q1: line({ pass_yd: 300, pass_td: 2, pass_att: 30, pass_cmp: 20 }), r1: line({ rush_yd: 80, rush_att: 15 }), TEAM_KC: line({ pass_yd: 300 }) }),
    week(2, { q1: line({ pass_yd: 250, pass_td: 1, pass_att: 25, pass_cmp: 15, pass_int: 1 }), r1: { rush_yd: 12 }, w1: { gms_active: 1, rec: 5, rec_yd: 60 } }),
    week(3, { q1: { pass_yd: 40 }, r1: line({ rush_yd: 100, rush_att: 20, rush_td: 1 }) }),
  ];
  const t = aggregateStats(weeks);

  it('adds the tracked keys over the weeks and ignores team rows', () => {
    expect(t.get('q1')!.sum).toMatchObject({ pass_yd: 590, pass_td: 3, pass_att: 55, pass_cmp: 35, pass_int: 1 });
    expect(t.get('r1')!.sum).toMatchObject({ rush_yd: 192, rush_att: 35, rush_td: 1 });
    expect(t.has('TEAM_KC')).toBe(false);
  });

  it('counts a game when the row says he played (gp or gms_active above zero), not for any row', () => {
    expect(t.get('q1')!.games).toBe(2); // week 3 has no gp: a stat row without a game
    expect(t.get('r1')!.games).toBe(2);
    expect(t.get('w1')!.games).toBe(1);
  });

  it('compactWeek drops team rows and untracked keys', () => {
    const c = compactWeek({ q1: { pass_yd: 3, pts_ppr: 9, gp: 1 }, TEAM_KC: { pass_yd: 3 }, z: { pts_ppr: 1 } });
    expect(c).toEqual({ q1: { pass_yd: 3, gp: 1 } });
  });
});

describe('league leaders', () => {
  const totals = aggregateStats([week(1, {
    q1: line({ pass_yd: 300, pass_td: 3 }), q2: line({ pass_yd: 300, pass_td: 1 }),
    r1: line({ rush_yd: 100, rush_att: 20, rush_td: 1 }), r2: line({ rush_yd: 100, rush_att: 25, rush_td: 2 }), r3: line({ rush_yd: 40, rush_att: 5 }),
    w1: line({ rec_yd: 90, rec: 7, rec_tgt: 9, rec_td: 1 }), w2: line({ rec_yd: 120, rec: 4, rec_tgt: 8 }),
    d1: line({ idp_tkl: 5, idp_sack: 2.5 }), d2: line({ idp_tkl: 9, idp_sack: 0, idp_int: 1 }), d3: line({ idp_tkl: 20 }),
  })]);

  it('sorts by the ranked stat and shares a rank between players level on it, ordering ties by the main column', () => {
    const rows = leaders(totals, info, 'passing', 'pass_yd');
    // both have 300: the first column is yards too, so the name decides (Pat before Quinn)
    expect(rows.map((r) => [r.pid, r.rank, r.tied])).toEqual([['q2', 1, true], ['q1', 1, true]]);
    // ranked by touchdowns the order changes and nobody is tied
    expect(leaders(totals, info, 'passing', 'pass_td').map((r) => [r.pid, r.rank, r.tied])).toEqual([['q1', 1, false], ['q2', 2, false]]);
  });

  it('breaks a tie by the first column, then by name, and the next rank skips the tied places', () => {
    const rows = leaders(totals, info, 'rushing', 'rush_yd');
    expect(rows.map((r) => [r.pid, r.rank])).toEqual([['r1', 1], ['r2', 1], ['r3', 3]]);
    // r1 and r2 tie on yards (100); the first column is yards too, so the name decides: Rex before Rob
    expect(rows.slice(0, 2).every((r) => r.tied)).toBe(true);
    expect(rows[0]!.values).toMatchObject({ rush_yd: 100, rush_att: 20, rush_td: 1, ypc: 5 });
    expect(rows[1]!.values.ypc).toBe(4);
  });

  it('keeps every player tied at the cut, and drops players with none of the stat', () => {
    const rows = leaders(totals, info, 'rushing', 'rush_yd', 1);
    expect(rows.map((r) => r.pid)).toEqual(['r1', 'r2']);
    expect(leaders(totals, info, 'receiving', 'rec_td').map((r) => r.pid)).toEqual(['w1']);
    expect(leaders(totals, info, 'passing', 'pass_yd', 10).length).toBe(2);
  });

  it('limits defense to defensive positions, so a running back’s tackles do not count', () => {
    const rows = leaders(totals, info, 'defense', 'idp_tkl');
    expect(rows.map((r) => r.pid)).toEqual(['d2', 'd1']);
    expect(CATEGORIES.defense.rankBy).toContain('idp_sack');
    expect(leaders(totals, info, 'defense', 'idp_sack').map((r) => r.pid)).toEqual(['d1']);
    expect(leaders(totals, info, 'defense', 'idp_sack')[0]!.values.idp_sack).toBe(2.5);
  });

  it('computes rates only when there is something to divide by', () => {
    const rec = leaders(totals, info, 'receiving', 'rec_yd');
    expect(rec.map((r) => r.pid)).toEqual(['w2', 'w1']);
    expect(rec[0]!.values.ypr).toBe(30);
    expect(rec[0]!.values.ypg).toBe(120);
    const none = aggregateStats([week(1, { w1: line({ rec_yd: 5 }) })]);
    expect(leaders(none, info, 'receiving', 'rec_yd')[0]!.values.ypr).toBeNull();
  });

  it('skips a stat row with no player in the players file', () => {
    expect(leaders(aggregateStats([week(1, { ghost: line({ pass_yd: 999 }) })]), info, 'passing', 'pass_yd')).toEqual([]);
  });

  it('this week is the same function over one week', () => {
    const w1 = week(1, { q1: line({ pass_yd: 100 }) }), w2 = week(2, { q1: line({ pass_yd: 50 }), q2: line({ pass_yd: 200 }) });
    expect(leaders(aggregateStats([w1, w2]), info, 'passing', 'pass_yd').map((r) => [r.pid, r.values.pass_yd])).toEqual([['q2', 200], ['q1', 150]]);
    expect(leaders(aggregateStats([w2]), info, 'passing', 'pass_yd').map((r) => [r.pid, r.values.pass_yd])).toEqual([['q2', 200], ['q1', 50]]);
  });
});

describe('box-score leaders', () => {
  const stats = {
    q1: line({ pass_cmp: 24, pass_att: 35, pass_yd: 312, pass_td: 2, pass_int: 1 }), q2: line({ pass_cmp: 10, pass_att: 20, pass_yd: 99 }),
    r1: line({ rush_att: 18, rush_yd: 88, rush_td: 1 }), r2: line({ rush_att: 9, rush_yd: 20 }), r3: line({ rush_att: 3, rush_yd: 88 }),
    w1: line({ rec: 7, rec_tgt: 9, rec_yd: 101, rec_td: 1 }),
    d3: { pass_yd: 5 },
  };
  it('picks each team’s best passer, rusher and receiver from the week’s stat lines', () => {
    const [kc, lac] = gameLeaders(stats, info, ['KC', 'LAC']);
    expect(kc!.passing).toMatchObject({ pid: 'q1', line: '24/35, 312 yds, 2 tds, 1 int' });
    // Rex and Ray both ran for 88: the name decides, so Ray Back
    expect(kc!.rushing).toMatchObject({ pid: 'r3', line: '3 att, 88 yds' });
    expect(kc!.receiving).toMatchObject({ pid: 'w1', line: '7/9 rec, 101 yds, 1 td' });
    expect(lac!.passing!.pid).toBe('q2');
    expect(lac!.rushing!.pid).toBe('r2');
    expect(lac!.receiving).toBeNull();
  });
  it('is empty before the game and when there are no stat lines', () => {
    for (const s of [null, {}]) {
      const [a] = gameLeaders(s, info, ['KC', 'LAC']);
      expect(a).toEqual({ team: 'KC', passing: null, rushing: null, receiving: null });
    }
  });
});

describe('team scoring and the player index', () => {
  it('reads points for and against per game from the standings’ records', () => {
    const rec = buildRecords([
      { week: 1, away: 'KC', home: 'LV', awayScore: 30, homeScore: 10, state: 'final' },
      { week: 2, away: 'DEN', home: 'KC', awayScore: 20, homeScore: 17, state: 'final' },
    ]);
    const kc = teamScoring(rec).find((t) => t.abbr === 'KC')!;
    expect(kc).toMatchObject({ games: 2, pf: 47, pa: 30, diff: 17 });
    expect(kc.ppg).toBe(23.5);
    expect(kc.papg).toBe(15);
    expect(kc.diffPg).toBe(8.5);
    expect(teamScoring(rec).find((t) => t.abbr === 'BUF')).toMatchObject({ games: 0, ppg: null, diffPg: null });
  });
  it('indexes players with a team, leaving out team defenses', () => {
    const m = playerInfo({
      a: { player_id: 'a', first_name: 'A', last_name: 'B', position: 'CB', team: 'KC' },
      KC: { player_id: 'KC', first_name: 'Kansas City', last_name: 'Chiefs', position: 'DEF', team: 'KC' },
      c: { player_id: 'c', first_name: 'C', last_name: 'D', position: 'WR', team: null },
    });
    expect([...m.keys()]).toEqual(['a']);
    expect(m.get('a')).toMatchObject({ name: 'A B', pos: 'CB', team: 'KC' });
  });
});
