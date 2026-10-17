// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DataError } from '../../data/errors.ts';
import type { FantasyCalcRow } from '../../data/types.ts';
import { fantasyCalcParams, joinFantasyCalc, loadFantasyCalc } from './fantasycalc.ts';
import { leagueOf, STD_SLOTS } from './test-helpers.ts';

const row = (id: string | null, value: number, extra: Record<string, unknown> = {}): FantasyCalcRow =>
  ({ player: { id: 1, name: `P${id}`, sleeperId: id, position: 'WR' }, value, overallRank: 5, positionRank: 2, ...extra }) as FantasyCalcRow;

describe('league → FantasyCalc params', () => {
  it('redraft 1QB PPR 12 teams', () => {
    expect(fantasyCalcParams(leagueOf())).toEqual({ isDynasty: false, numQbs: 1, numTeams: 12, ppr: 1 });
  });
  it('dynasty comes from settings.type === 2 (not keeper)', () => {
    expect(fantasyCalcParams(leagueOf({ type: 2 })).isDynasty).toBe(true);
    expect(fantasyCalcParams(leagueOf({ type: 1 })).isDynasty).toBe(false);
  });
  it('numQbs is 2 for SUPER_FLEX or 2+ QB slots', () => {
    expect(fantasyCalcParams(leagueOf({ slots: ['QB', 'SUPER_FLEX', 'BN'] })).numQbs).toBe(2);
    expect(fantasyCalcParams(leagueOf({ slots: ['QB', 'QB', 'BN'] })).numQbs).toBe(2);
    expect(fantasyCalcParams(leagueOf({ slots: STD_SLOTS })).numQbs).toBe(1);
  });
  it('numTeams and ppr (1 / 0.5 / 0) follow the league', () => {
    expect(fantasyCalcParams(leagueOf({ teams: 10, rec: 0.5 }))).toMatchObject({ numTeams: 10, ppr: 0.5 });
    expect(fantasyCalcParams(leagueOf({ rec: 0 })).ppr).toBe(0);
    expect(fantasyCalcParams(leagueOf({ teams: 12 }), 14).numTeams).toBe(14);
  });
  it('an isDynasty override wins over settings.type (either way); without one the league decides', () => {
    expect(fantasyCalcParams(leagueOf(), undefined, { isDynasty: true }).isDynasty).toBe(true);
    expect(fantasyCalcParams(leagueOf({ type: 2 }), undefined, { isDynasty: false }).isDynasty).toBe(false);
    expect(fantasyCalcParams(leagueOf({ type: 2 }), undefined, {}).isDynasty).toBe(true);
  });
});

describe('join and load', () => {
  it('joins by sleeperId, keeps rank, value and the 30-day trend, and drops rows without an id', () => {
    const j = joinFantasyCalc([row('4046', 9000, { trend30Day: -120 }), row(null, 100), row('77', 50, { trend: 3 }), row('88', 40)]);
    expect(Object.keys(j).sort()).toEqual(['4046', '77', '88']);
    expect(j['4046']).toMatchObject({ value: 9000, overallRank: 5, positionRank: 2, trend30Day: -120, name: 'P4046' });
    expect(j['77']!.trend30Day).toBe(3);
    expect(j['88']!.trend30Day).toBeNull();
  });
  const client = (impl: () => Promise<unknown>) => ({ fantasyCalc: impl }) as unknown as Parameters<typeof loadFantasyCalc>[0];
  it('loads and joins when the service is up', async () => {
    const seen: unknown[] = [];
    const c = { fantasyCalc: async (p: unknown) => { seen.push(p); return { data: [row('1', 10)], asOf: 123, stale: false }; } } as unknown as Parameters<typeof loadFantasyCalc>[0];
    const r = await loadFantasyCalc(c, leagueOf({ type: 2 }));
    expect(r.ok).toBe(true);
    expect(r.byId['1']!.value).toBe(10);
    expect(r.asOf).toBe(123);
    expect(seen[0]).toEqual({ isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 });
  });
  it('loadFantasyCalc passes the isDynasty override and force through to the client', async () => {
    const seen: unknown[][] = [];
    const c = { fantasyCalc: async (...a: unknown[]) => { seen.push(a); return { data: [row('1', 10)], asOf: 1, stale: false }; } } as unknown as Parameters<typeof loadFantasyCalc>[0];
    await loadFantasyCalc(c, leagueOf(), { isDynasty: true, force: true });
    expect(seen[0]).toEqual([{ isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 }, { force: true }]);
  });
  it('is graceful when it is down: empty result and a reason, never a throw', async () => {
    const down = await loadFantasyCalc(client(async () => { throw new DataError('network', 'Could not reach FantasyCalc values: offline'); }), leagueOf());
    expect(down.ok).toBe(false);
    expect(down.byId).toEqual({});
    expect(down.reason).toContain('FantasyCalc');
    const weird = await loadFantasyCalc(client(async () => { throw new Error('boom'); }), leagueOf());
    expect(weird).toMatchObject({ ok: false, byId: {} });
    expect(weird.reason).toContain('boom');
    const empty = await loadFantasyCalc(client(async () => ({ data: [], asOf: 1, stale: false })), leagueOf());
    expect(empty.ok).toBe(false);
    expect(empty.reason).not.toBe('');
  });
  it('flags a stale cached copy', async () => {
    const r = await loadFantasyCalc(client(async () => ({ data: [row('1', 10)], asOf: 5, stale: true })), leagueOf());
    expect(r).toMatchObject({ ok: true, stale: true });
  });
});
