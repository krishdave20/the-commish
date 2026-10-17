// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assignTiers, buildRankings, replacementLevels, type PoolPlayer } from './rankings.ts';
import type { Slot } from '../types.ts';
import { leagueOf, projRow, STD_SLOTS, syntheticPool } from './test-helpers.ts';

const pool = (pos: string, pts: number[]): PoolPlayer[] => pts.map((p, i) => ({ pid: `${pos}${i}`, pos, points: p }));

describe('replacement level (VOR baseline)', () => {
  it('standard slots: fixed slots, then flex slots go to the best remaining RB/WR/TE', () => {
    // 2 teams: QB 2, RB 4, WR 4, TE 2 fixed; 2 FLEX players: the best leftovers are RB 21 and RB 20
    const p = [...pool('QB', [30, 28, 20, 10]), ...pool('RB', [25, 24, 23, 22, 21, 20, 10]), ...pool('WR', [26, 25, 19, 18, 17, 16]), ...pool('TE', [15, 14, 13, 5])];
    const slots: Slot[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
    const r = replacementLevels(p, slots, 2);
    expect(r.starters).toEqual({ QB: 2, RB: 6, WR: 4, TE: 2 });
    expect(r.replacement).toEqual({ QB: 28, RB: 20, WR: 18, TE: 14 });
  });
  it('flex slots are filled greedily across positions by points, not split evenly', () => {
    // 1 team, 2 FLEX: WRs 17 and 16 beat the best RB (12) and TE (9)
    const p = [...pool('RB', [20, 12, 11]), ...pool('WR', [30, 17, 16, 15]), ...pool('TE', [14, 9])];
    const r = replacementLevels(p, ['RB', 'WR', 'TE', 'FLEX', 'FLEX'], 1);
    expect(r.starters).toEqual({ RB: 1, WR: 3, TE: 1 });
    expect(r.replacement).toEqual({ RB: 20, WR: 16, TE: 14 });
  });
  it('superflex: the extra slot goes to QBs when they outscore everyone else', () => {
    const p = [...pool('QB', [30, 28, 27, 26]), ...pool('RB', [20, 19, 18]), ...pool('WR', [22, 21, 15])];
    const r = replacementLevels(p, ['QB', 'RB', 'WR', 'SUPER_FLEX'], 2);
    expect(r.starters).toEqual({ QB: 4, RB: 2, WR: 2 });
    expect(r.replacement.QB).toBe(26);
    expect(r.replacement.RB).toBe(19);
  });
  it('superflex with weak backup QBs gives the slot to a skill player instead', () => {
    const p = [...pool('QB', [30, 28, 9, 8]), ...pool('RB', [20, 19, 18]), ...pool('WR', [22, 21, 15])];
    const r = replacementLevels(p, ['QB', 'RB', 'WR', 'SUPER_FLEX'], 2);
    expect(r.starters).toEqual({ QB: 2, RB: 3, WR: 3 }); // RB 18 and WR 15 take the 2 SF slots... by points: RB18, WR15
    expect(r.replacement.QB).toBe(28);
  });
  it('IDP slots, including IDP_FLEX', () => {
    const p = [...pool('QB', [20, 18]), ...pool('DL', [10, 9, 8, 7]), ...pool('LB', [12, 11, 6]), ...pool('DB', [5, 4])];
    const r = replacementLevels(p, ['QB', 'DL', 'LB', 'DB', 'IDP_FLEX'], 2);
    expect(r.starters).toEqual({ QB: 2, DL: 4, LB: 2, DB: 2 });
    expect(r.replacement).toEqual({ QB: 18, DL: 7, LB: 11, DB: 4 });
  });
  it('more restrictive flex slots fill first (REC_FLEX before FLEX)', () => {
    const p = [...pool('WR', [20, 19, 18]), ...pool('TE', [17]), ...pool('RB', [16])];
    const r = replacementLevels(p, ['WR', 'FLEX', 'REC_FLEX'], 1);
    // WR fixed: 20. REC_FLEX (WR/TE) takes WR 19; FLEX then takes the best of WR 18 / TE 17 / RB 16 = WR 18
    expect(r.starters).toEqual({ WR: 3 });
    expect(r.replacement).toEqual({ WR: 18 });
  });
  it('a short pool falls back to its last player; a position with no slot has no replacement level', () => {
    const r = replacementLevels([...pool('QB', [30]), ...pool('K', [9])], ['QB', 'QB'], 3);
    expect(r.replacement).toEqual({ QB: 30 });
    expect(r.replacement.K).toBeUndefined();
  });
});

describe('tiers by natural gaps', () => {
  it('splits at the big gaps and nowhere else', () => {
    expect(assignTiers([100, 98, 97, 96, 80, 79, 78, 60, 59, 58])).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  });
  it('an evenly spaced list is one tier', () => {
    expect(assignTiers([10, 9, 8, 7, 6, 5, 4, 3])).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
  it('ties never split and a flat list is one tier', () => {
    expect(assignTiers([5, 5, 5, 5])).toEqual([1, 1, 1, 1]);
    expect(assignTiers([50, 50, 50, 20, 20, 20])).toEqual([1, 1, 1, 2, 2, 2]);
  });
  it('tiny pools', () => {
    expect(assignTiers([])).toEqual([]);
    expect(assignTiers([7])).toEqual([1]);
    expect(assignTiers([10, 1])).toEqual([1, 1]);
    expect(assignTiers([10, 9, 1])).toEqual([1, 1, 2]);
  });
  it('small wobbles in a long tail do not make tiers (5% … 3% of the range floor)', () => {
    const tail = Array.from({ length: 30 }, (_, i) => 50 - i * 0.5 - (i % 3 === 0 ? 0.4 : 0));
    expect(new Set(assignTiers([300, ...tail])).size).toBe(2);
  });
  it('tier numbers never decrease down the list', () => {
    const v = [90, 85, 84, 70, 69, 50, 49, 48, 20, 19, 1];
    const t = assignTiers(v);
    expect(t.every((x, i) => i === 0 || x >= t[i - 1]!)).toBe(true);
    expect(t[0]).toBe(1);
  });
});

describe('buildRankings', () => {
  const league = leagueOf({ teams: 6 });
  const rows = syntheticPool();
  const r = buildRankings({ projections: rows, league });

  it('uses the league scoring and reads the right ADP column', () => {
    expect(r.adpField).toBe('adp_ppr');
    const half = buildRankings({ projections: rows, league: leagueOf({ teams: 6, rec: 0.5 }) });
    expect(half.adpField).toBe('adp_half_ppr');
    expect(half.byPid.WR1!.points).toBe(rows.find((x) => x.player_id === 'WR1')!.stats.pts_half_ppr);
    expect(r.byPid.WR1!.points).toBe(310);
  });
  it('VOR is points − the replacement at the position; the last starter is 0, starters are above it', () => {
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']) {
      const list = r.rows.filter((x) => x.pos === pos).sort((a, b) => a.posRank - b.posRank);
      const n = r.starters[pos]!;
      expect(list[n - 1]!.vor).toBeCloseTo(0, 9);
      for (const x of list.slice(0, n - 1)) expect(x.vor).toBeGreaterThan(0);
      for (const x of list) expect(x.vor).toBeCloseTo(x.points - r.replacement[pos]!, 9);
    }
    expect(r.starters.RB! + r.starters.WR! + r.starters.TE!).toBe(6 * (2 + 2 + 1 + 2));
  });
  it('overall rank is VOR order; position rank and tier are per position', () => {
    expect(r.rows.map((x) => x.rank)).toEqual(r.rows.map((_, i) => i + 1));
    expect(r.rows.every((x, i) => i === 0 || x.vor <= r.rows[i - 1]!.vor)).toBe(true);
    const qbs = r.rows.filter((x) => x.pos === 'QB');
    expect(qbs.map((x) => x.posRank)).toEqual(qbs.map((_, i) => i + 1));
    expect(qbs[0]!.tier).toBe(1);
    expect(Math.max(...r.rows.map((x) => x.tier))).toBeGreaterThan(1);
  });
  it('ADP and value vs ADP (adp − rank); missing / 999 ADP is null', () => {
    const top = r.rows[0]!;
    expect(top.adp).not.toBeNull();
    expect(top.valueVsAdp).toBeCloseTo(top.adp! - top.rank, 9);
    const odd = buildRankings({ projections: [projRow('A', 'QB', 300, { adp: { adp_ppr: 999 } }), projRow('B', 'QB', 290), projRow('C', 'QB', 280, { adp: { adp_ppr: 30 } })], league: leagueOf({ teams: 1, slots: ['QB'] }) });
    expect(odd.byPid.A!.adp).toBeNull();
    expect(odd.byPid.A!.valueVsAdp).toBeNull();
    expect(odd.byPid.B!.adp).toBeNull();
    expect(odd.byPid.C!.adp).toBe(30);
  });
  it('drops non-fantasy positions and players with no projected points', () => {
    const x = buildRankings({ projections: [projRow('F', 'FB', 100), projRow('Z', 'QB', 0), projRow('Q', 'QB', 100)], league: leagueOf({ teams: 1, slots: ['QB'] }) });
    expect(x.rows.map((p) => p.pid)).toEqual(['Q']);
  });
  it('team defenses are named like the app names them', () => {
    const d = buildRankings({ projections: [{ ...projRow('DEN', 'DEF', 120), player: { position: 'DEF', team: 'DEN' } }], league: leagueOf({ teams: 1, slots: ['DEF'] }) });
    expect(d.rows[0]!.name).toBe('DEN D/ST');
  });
  it('superflex lifts QBs: they get more starters and the ADP column changes', () => {
    const sf = buildRankings({ projections: rows, league: leagueOf({ teams: 6, slots: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'SUPER_FLEX', 'K', 'DEF', 'BN'] }) });
    expect(sf.adpField).toBe('adp_2qb');
    expect(sf.starters.QB!).toBeGreaterThan(6);
  });
  it('IDP leagues rank defenders', () => {
    const idp = [...rows, ...Array.from({ length: 20 }, (_, i) => projRow(`LB${i + 1}`, 'LB', 150 - i * 3))];
    const x = buildRankings({ projections: idp, league: leagueOf({ teams: 6, slots: [...STD_SLOTS.slice(0, 10), 'LB', 'IDP_FLEX', 'BN'] }) });
    expect(x.starters.LB).toBeGreaterThanOrEqual(6);
    expect(x.rows.some((p) => p.pos === 'LB')).toBe(true);
  });
});

describe('dynasty modes', () => {
  const dyn = leagueOf({ teams: 6, type: 2 });
  const rows = syntheticPool().map((r, i) => {
    r.stats.adp_dynasty_ppr = 50 + i; r.stats.adp_rookie = 999; return r;
  });
  rows.find((r) => r.player_id === 'WR10')!.player!.years_exp = 0;
  rows.find((r) => r.player_id === 'WR10')!.stats.adp_rookie = 3;
  rows.find((r) => r.player_id === 'RB30')!.player!.years_exp = 0;
  rows.find((r) => r.player_id === 'TE2')!.stats.adp_rookie = 7; // rookie by ADP alone (experience unknown)
  rows.find((r) => r.player_id === 'TE2')!.player!.years_exp = 4;

  it('startup reads the dynasty ADP column', () => {
    const s = buildRankings({ projections: rows, league: dyn, mode: 'startup' });
    expect(s.adpField).toBe('adp_dynasty_ppr');
    expect(s.byPid.WR1!.adp).toBe(50 + rows.findIndex((r) => r.player_id === 'WR1'));
  });
  it('startup blends FantasyCalc into the overall rank (and leaves the VOR / tiers alone)', () => {
    const plain = buildRankings({ projections: rows, league: dyn, mode: 'startup' });
    const fc = { QB16: { sleeperId: 'QB16', name: 'q', position: 'QB', value: 99999, overallRank: 1, positionRank: 1, trend30Day: 5 } };
    const blended = buildRankings({ projections: rows, league: dyn, mode: 'startup', fantasyCalc: fc });
    expect(blended.byPid.QB16!.rank).toBeLessThan(plain.byPid.QB16!.rank);
    expect(blended.byPid.QB16!.fc?.trend30Day).toBe(5);
    expect(blended.byPid.QB16!.vor).toBe(plain.byPid.QB16!.vor);
    expect(blended.byPid.QB16!.tier).toBe(plain.byPid.QB16!.tier);
    expect(blended.rows.map((r) => r.rank)).toEqual(blended.rows.map((_, i) => i + 1));
    // redraft ignores FantasyCalc
    expect(buildRankings({ projections: rows, league: leagueOf({ teams: 6 }), fantasyCalc: fc }).byPid.QB16!.fc?.value).toBe(99999); // attached for display...
    expect(buildRankings({ projections: rows, league: leagueOf({ teams: 6 }), fantasyCalc: fc }).byPid.QB16!.rank)
      .toBe(buildRankings({ projections: rows, league: leagueOf({ teams: 6 }) }).byPid.QB16!.rank); // ...but never moves the rank
  });
  it('rookie mode keeps only rookies (years_exp 0 or rookie ADP) and uses adp_rookie', () => {
    const r = buildRankings({ projections: rows, league: dyn, mode: 'rookie' });
    expect(r.adpField).toBe('adp_rookie');
    expect(r.rows.map((x) => x.pid).sort()).toEqual(['RB30', 'TE2', 'WR10']);
    expect(r.byPid.WR10!.adp).toBe(3);
    expect(r.byPid.RB30!.adp).toBeNull();
    expect(r.rows.every((x) => x.rookie)).toBe(true);
    expect(r.rows.every((x) => x.vor !== 0 || x.points > 0)).toBe(true);
  });
  it('years_exp comes from the players file when given', () => {
    const r = buildRankings({ projections: rows, league: dyn, mode: 'rookie', players: { QB5: { player_id: 'QB5', years_exp: 0 } } });
    expect(r.rows.map((x) => x.pid)).toContain('QB5');
  });
});

describe('explore modes in a redraft league (the mode wins over settings.type)', () => {
  const redraft = leagueOf({ teams: 6 });
  const rows = syntheticPool().map((r) => { r.stats.adp_dynasty_ppr = 40; r.stats.adp_ppr = 10; r.stats.adp_rookie = 999; return r; });
  it('startup reads the dynasty ADP column and FantasyCalc blends in', () => {
    const fc = { QB16: { sleeperId: 'QB16', name: 'q', position: 'QB', value: 99999, overallRank: 1, positionRank: 1, trend30Day: 0 } };
    const s = buildRankings({ projections: rows, league: redraft, mode: 'startup', fantasyCalc: fc });
    expect(s.mode).toBe('startup');
    expect(s.adpField).toBe('adp_dynasty_ppr');
    expect(s.byPid.WR1!.adp).toBe(40);
    expect(s.byPid.QB16!.rank).toBeLessThan(buildRankings({ projections: rows, league: redraft, mode: 'startup' }).byPid.QB16!.rank);
  });
  it('rookie reads adp_rookie, and the redraft default still reads the redraft column', () => {
    expect(buildRankings({ projections: rows, league: redraft, mode: 'rookie' }).adpField).toBe('adp_rookie');
    const r = buildRankings({ projections: rows, league: redraft });
    expect(r.adpField).toBe('adp_ppr');
    expect(r.byPid.WR1!.adp).toBe(10);
  });
});

describe('rookie mode leaves out kickers and defenses', () => {
  it('K and DEF rookies never appear, and ranks close up with no gaps', () => {
    const rows = syntheticPool();
    for (const pid of ['K1', 'K2', 'DEF1', 'WR10', 'RB30']) {
      const r = rows.find((x) => x.player_id === pid)!;
      r.player!.years_exp = 0;
      r.stats.adp_rookie = 5;
    }
    const r = buildRankings({ projections: rows, league: leagueOf({ teams: 6, type: 2 }), mode: 'rookie' });
    expect(r.rows.map((x) => x.pid).sort()).toEqual(['RB30', 'WR10']);
    expect(r.rows.map((x) => x.rank)).toEqual([1, 2]);
    expect(r.byPid.K1).toBeUndefined();
    // startup keeps them
    const startup = buildRankings({ projections: rows, league: leagueOf({ teams: 6, type: 2 }), mode: 'startup' });
    expect(startup.rows.some((x) => x.pos === 'K')).toBe(true);
  });
});
