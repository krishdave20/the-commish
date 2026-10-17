import { describe, expect, it } from 'vitest';
import type { NflState, SleeperLeague } from './contract.ts';
import { planPull } from './plan.ts';
import { fantasyCalcUrl, nflverseUrls, positionsFor, sleeperUrls } from './urls.ts';

const B = 'https://api.sleeper.app';
const POS = 'position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF';

describe('url builders', () => {
  it('documented Sleeper endpoints', () => {
    expect(sleeperUrls.state()).toBe(`${B}/v1/state/nfl`);
    expect(sleeperUrls.user('Some User')).toBe(`${B}/v1/user/Some%20User`);
    expect(sleeperUrls.userLeagues('9', '2026')).toBe(`${B}/v1/user/9/leagues/nfl/2026`);
    expect(sleeperUrls.league('L')).toBe(`${B}/v1/league/L`);
    expect(sleeperUrls.rosters('L')).toBe(`${B}/v1/league/L/rosters`);
    expect(sleeperUrls.users('L')).toBe(`${B}/v1/league/L/users`);
    expect(sleeperUrls.matchups('L', 4)).toBe(`${B}/v1/league/L/matchups/4`);
    expect(sleeperUrls.transactions('L', 4)).toBe(`${B}/v1/league/L/transactions/4`);
    expect(sleeperUrls.tradedPicks('L')).toBe(`${B}/v1/league/L/traded_picks`);
    expect(sleeperUrls.drafts('L')).toBe(`${B}/v1/league/L/drafts`);
    expect(sleeperUrls.draft('D')).toBe(`${B}/v1/draft/D`);
    expect(sleeperUrls.draftPicks('D')).toBe(`${B}/v1/draft/D/picks`);
    expect(sleeperUrls.draftTradedPicks('D')).toBe(`${B}/v1/draft/D/traded_picks`);
    expect(sleeperUrls.players()).toBe(`${B}/v1/players/nfl`);
    expect(sleeperUrls.trending('add')).toBe(`${B}/v1/players/nfl/trending/add?lookback_hours=24&limit=50`);
    expect(sleeperUrls.trending('drop', 72, 10)).toBe(`${B}/v1/players/nfl/trending/drop?lookback_hours=72&limit=10`);
  });

  it('undocumented Sleeper endpoints', () => {
    expect(sleeperUrls.stats('2026', 5)).toBe(`${B}/v1/stats/nfl/regular/2026/5`);
    expect(sleeperUrls.projections('2026', 5)).toBe(`${B}/projections/nfl/2026/5?season_type=regular&${POS}`);
    expect(sleeperUrls.seasonProjections('2026')).toBe(`${B}/projections/nfl/2026?season_type=regular&${POS}`);
    expect(sleeperUrls.schedule('2026')).toBe(`${B}/schedule/nfl/regular/2026`);
  });

  it('projection positions add IDP only for IDP leagues', () => {
    expect(positionsFor(['QB', 'RB', 'FLEX', 'BN'])).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
    expect(positionsFor(['QB', 'DL', 'BN'])).toEqual(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']);
    expect(positionsFor(['IDP_FLEX'])).toContain('LB');
    expect(sleeperUrls.projections('2026', 1, positionsFor(['DL']))).toContain('position[]=DB');
  });

  it('FantasyCalc and nflverse', () => {
    expect(fantasyCalcUrl({ isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 }))
      .toBe('https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1');
    expect(fantasyCalcUrl({ isDynasty: false, numQbs: 2, numTeams: 10, ppr: 0.5 })).toContain('isDynasty=false&numQbs=2&numTeams=10&ppr=0.5');
    const nv = 'https://github.com/nflverse/nflverse-data/releases/download/';
    expect(nflverseUrls.pbp('2026')).toBe(`${nv}pbp/play_by_play_2026.csv.gz`);
    expect(nflverseUrls.snapCounts('2026')).toBe(`${nv}snap_counts/snap_counts_2026.csv`);
    expect(nflverseUrls.ftn('2026')).toBe(`${nv}ftn_charting/ftn_charting_2026.csv`);
    expect(nflverseUrls.participation('2025')).toBe(`${nv}pbp_participation/pbp_participation_2025.csv`);
    expect(nflverseUrls.players()).toBe(`${nv}players/players.csv`);
  });
});

describe('planPull (mirrors reference load())', () => {
  const state = (over: Partial<NflState> = {}): NflState => ({ week: 6, season: '2026', season_type: 'regular', league_season: '2026', ...over });
  const lg = (settings: SleeperLeague['settings'] = {}) => ({ settings: { playoff_week_start: 15, playoff_teams: 8, ...settings }, roster_positions: ['QB'] }) as SleeperLeague;

  it('mid-season week ranges', () => {
    const p = planPull(state(), lg());
    expect(p.cur).toBe(6);
    expect(p.matchWeeks).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(p.statWeeks).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p.calWeeks).toEqual([2, 3, 4, 5]);
    expect(p.projWeeks).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(p.playoffWeeks).toEqual([15, 16, 17]);
    expect(p.completedWeeks).toEqual([1, 2, 3, 4, 5]);
  });

  it('preseason treats week 1 as now; offseason jumps to the playoff start', () => {
    const pre = planPull(state({ season_type: 'pre', week: 0 }), lg());
    expect(pre.cur).toBe(1);
    expect(pre.calWeeks).toEqual([]);
    expect(pre.completedWeeks).toEqual([]);
    const off = planPull(state({ season_type: 'off', week: 0 }), lg());
    expect(off.cur).toBe(15);
    expect(off.completedWeeks).toHaveLength(14);
  });

  it('fewer playoff teams means fewer playoff rounds', () => {
    expect(planPull(state(), lg({ playoff_teams: 4 })).playoffWeeks).toEqual([15, 16]);
  });
});
