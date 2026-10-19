import { describe, expect, it } from 'vitest';
import { NFL_TEAMS } from './teams';
import { TEAM_COLORS, contrastRatio, isDeep, readableOn, teamColors } from './teamColors';

const HEX = /^#[0-9a-f]{6}$/;

describe('team colours', () => {
  it('has a primary and a secondary for all 32 teams, by Sleeper abbreviation', () => {
    expect(NFL_TEAMS).toHaveLength(32);
    expect(Object.keys(TEAM_COLORS).sort()).toEqual(NFL_TEAMS.map((t) => t.abbr).sort());
    for (const t of NFL_TEAMS) {
      const c = TEAM_COLORS[t.abbr]!;
      expect(c.primary, t.abbr).toMatch(HEX);
      expect(c.secondary, t.abbr).toMatch(HEX);
      expect(c.text, t.abbr).toMatch(HEX);
      // a ring that matches its circle would not be a ring
      expect(c.secondary, t.abbr).not.toBe(c.primary);
    }
  });

  it('computes a monogram colour that reads on every primary (at least 4.5 to 1)', () => {
    for (const t of NFL_TEAMS) {
      const c = TEAM_COLORS[t.abbr]!;
      expect(['#000000', '#ffffff'], t.abbr).toContain(c.text);
      expect(contrastRatio(c.primary, c.text), t.abbr).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('picks white on navy and black on gold', () => {
    expect(readableOn('#002244')).toBe('#ffffff');
    expect(readableOn('#ffb612')).toBe('#000000');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('looks a team up by abbreviation, with the old codes mapped and no team as null', () => {
    expect(teamColors('KC')).toBe(TEAM_COLORS.KC);
    expect(teamColors('kc')).toBe(TEAM_COLORS.KC);
    expect(teamColors('JAC')).toBe(TEAM_COLORS.JAX);
    expect(teamColors('LA')).toBe(TEAM_COLORS.LAR);
    expect(teamColors('WSH')).toBe(TEAM_COLORS.WAS);
    expect(teamColors('FA')).toBeNull();
    expect(teamColors(null)).toBeNull();
    expect(teamColors(undefined)).toBeNull();
  });

  it('marks the dark teams, whose circle or ring would sink into a dark page', () => {
    expect(isDeep(TEAM_COLORS.NE!)).toBe(true);
    expect(isDeep(TEAM_COLORS.KC!)).toBe(false);
    expect(isDeep(TEAM_COLORS.LAC!)).toBe(false);
    expect(isDeep(TEAM_COLORS.LV!)).toBe(true);
    expect(isDeep(TEAM_COLORS.CHI!)).toBe(true);
    expect(isDeep(TEAM_COLORS.CIN!)).toBe(true);
  });
});
