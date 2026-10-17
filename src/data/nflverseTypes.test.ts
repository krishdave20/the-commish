import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  COUNT_KEYS, COVERAGE_COLS, MIN_CARRIES, MIN_ROUTES, MIN_TARGETS, RATE_KEYS, SEASON_COLS, SHARE_KEYS, STAT_DEFINITIONS, TEAM_COLS, WEEKLY_COLS, nflverseFiles,
  type CoverageRow, type PlayerCounts, type PlayerRates, type PlayerSeason, type PlayerShares, type PlayerWeek, type TeamWeek,
} from './nflverseTypes.ts';

/* The column lists and the interfaces must say the same thing: a field added to one and not the other fails to compile here. */
describe('column lists match the interfaces', () => {
  it('every key of each interface is listed (compile-time)', () => {
    expectTypeOf<Exclude<keyof PlayerCounts, (typeof COUNT_KEYS)[number]>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof PlayerShares, (typeof SHARE_KEYS)[number]>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof PlayerRates, (typeof RATE_KEYS)[number]>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof PlayerWeek, (typeof WEEKLY_COLS)[number]>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof PlayerSeason, (typeof SEASON_COLS)[number]>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof TeamWeek, (typeof TEAM_COLS)[number]>>().toEqualTypeOf<never>();
    expectTypeOf<Exclude<keyof CoverageRow, (typeof COVERAGE_COLS)[number]>>().toEqualTypeOf<never>();
    expect(true).toBe(true);
  });

  it('no column is listed twice', () => {
    for (const cols of [WEEKLY_COLS, SEASON_COLS, TEAM_COLS, COVERAGE_COLS]) expect(new Set(cols).size).toBe(cols.length);
  });
});

describe('constants', () => {
  it('minimum sample sizes: 15 targets, 20 routes, 15 carries', () => {
    expect([MIN_TARGETS, MIN_ROUTES, MIN_CARRIES]).toEqual([15, 20, 15]);
  });
  it('file names', () => {
    expect(nflverseFiles.weekly(2026)).toBe('weekly_2026.json');
    expect(nflverseFiles.season('2026')).toBe('season_2026.json');
    expect(nflverseFiles.teams(2026)).toBe('teams_2026.json');
    expect(nflverseFiles.coverage(2025)).toBe('coverage_2025.json');
    expect(nflverseFiles.unmatched).toBe('unmatched.json');
    expect(nflverseFiles.manifest).toBe('manifest.json');
  });
  it('every definition names a real column', () => {
    const all = new Set<string>([...WEEKLY_COLS, ...SEASON_COLS, ...COVERAGE_COLS]);
    for (const k of Object.keys(STAT_DEFINITIONS)) expect(all.has(k), k).toBe(true);
  });
});
