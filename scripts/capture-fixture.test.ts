import { describe, expect, it } from 'vitest';
import type { SleeperLeague } from '../src/data/contract.ts';
import { fantasyCalcRequests, outDirOf, parseArgs, parseOnly } from './capture-fixture.ts';

describe('capture-fixture args', () => {
  it('reads user and league from the command line, defaulting the output dir', () => {
    const a = parseArgs(['--user', 'someone', '--league', '123']);
    expect(a).toMatchObject({ user: 'someone', league: '123' });
    expect(a.out.endsWith('reference/fixture')).toBe(true);
  });

  it('takes an explicit output dir', () => {
    expect(parseArgs(['--league', '1', '--user', 'u', '--out', '/tmp/x']).out).toBe('/tmp/x');
  });

  it('refuses to guess a user or league', () => {
    expect(() => parseArgs(['--user', 'u'])).toThrow(/Usage/);
    expect(() => parseArgs([])).toThrow(/Usage/);
  });
});

describe('capture-fixture --only fantasycalc', () => {
  it('reads the mode and output dir', () => {
    expect(parseOnly(['--only', 'fantasycalc'])).toBe('fantasycalc');
    expect(parseOnly(['--user', 'u'])).toBeUndefined();
    expect(outDirOf(['--only', 'fantasycalc', '--out', '/tmp/y'])).toBe('/tmp/y');
    expect(outDirOf([]).endsWith('reference/fixture')).toBe(true);
  });
  const league = (type: number) => ({ roster_positions: ['QB', 'RB', 'SUPER_FLEX', 'BN'], scoring_settings: { rec: 0.5 }, settings: { type }, total_rosters: 10 }) as unknown as SleeperLeague;
  it('requests the league\'s own params plus the opposite isDynasty at the same params', () => {
    const r = fantasyCalcRequests(league(0));
    expect(r[0]).toEqual({ name: 'fantasycalc_redraft', url: 'https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=2&numTeams=10&ppr=0.5' });
    expect(r[1]).toEqual({ name: 'fantasycalc_dynasty', url: 'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&numTeams=10&ppr=0.5' });
    expect(fantasyCalcRequests(league(2)).map((x) => x.name)).toEqual(['fantasycalc_dynasty', 'fantasycalc_redraft']);
  });
});
