import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SleeperLeague } from '../src/data/contract.ts';
import { bracketRequests, fantasyCalcRequests, outDirOf, parseArgs, parseOnly, srcDirOf } from './capture-fixture.ts';

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

describe('capture-fixture --only brackets / nflverse', () => {
  it('names both bracket endpoints for the league and the file each is saved under', () => {
    expect(bracketRequests('L9')).toEqual([
      { name: 'winners_bracket', url: 'https://api.sleeper.app/v1/league/L9/winners_bracket' },
      { name: 'losers_bracket', url: 'https://api.sleeper.app/v1/league/L9/losers_bracket' },
    ]);
  });
  it('reads the new --only values and the nflverse source dir', () => {
    expect(parseOnly(['--only', 'brackets'])).toBe('brackets');
    expect(parseOnly(['--only', 'nflverse', '--src', '/tmp/s'])).toBe('nflverse');
    expect(srcDirOf(['--src', '/tmp/s'])).toBe('/tmp/s');
    expect(srcDirOf([]).endsWith('public/data/nflverse')).toBe(true);
  });
});

describe('the committed nflverse snapshot (reference/fixture/nflverse)', () => {
  const dir = resolve(import.meta.dirname, '../reference/fixture');
  it('is a complete pipeline output for the fixture season: a manifest and every file it lists', async () => {
    const fixture = JSON.parse(await readFile(resolve(dir, 'manifest.json'), 'utf8')) as { season: string };
    const nv = resolve(dir, 'nflverse');
    const manifest = JSON.parse(await readFile(resolve(nv, 'manifest.json'), 'utf8')) as { schema: number; season: number; files: Record<string, number> };
    expect(manifest.schema).toBe(1);
    expect(manifest.season).toBe(Number(fixture.season));
    expect(Object.keys(manifest.files).length).toBeGreaterThan(3);
    for (const f of Object.keys(manifest.files)) expect(JSON.parse(await readFile(resolve(nv, f), 'utf8')), f).toBeTruthy();
  });
});
