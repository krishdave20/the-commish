import { describe, expect, it } from 'vitest';
import { buildAlmanac } from './almanac.ts';
import { loadHistory, throughWeekOf } from './load.ts';
import { chainClient, threeSeasons } from './test-helpers.ts';

describe('throughWeekOf', () => {
  const mk = (status: 'complete' | 'in_season' | 'pre_draft', settings: Record<string, unknown>) => ({ status, settings } as never);
  it('is the whole regular season for a finished league', () => {
    expect(throughWeekOf(mk('complete', { playoff_week_start: 15 }))).toBe(14);
    expect(throughWeekOf(mk('complete', {}))).toBe(14);
  });
  it('is Sleeper\'s last scored week for a season in progress, and never the week being played', () => {
    expect(throughWeekOf(mk('in_season', { playoff_week_start: 15, last_scored_leg: 5, leg: 6 }))).toBe(5);
    expect(throughWeekOf(mk('in_season', { playoff_week_start: 15, leg: 6 }))).toBe(5);
    expect(throughWeekOf(mk('in_season', { playoff_week_start: 15, last_scored_leg: 16 }))).toBe(14);
  });
  it('is zero before the season starts', () => {
    expect(throughWeekOf(mk('pre_draft', { playoff_week_start: 15 }))).toBe(0);
  });
});

describe('loadHistory', () => {
  it('follows previous_league_id back and returns the seasons oldest first', async () => {
    const c = chainClient(threeSeasons());
    const f = await loadHistory(c, c.leagues[0]!);
    expect(f.data.seasons.map((s) => s.season)).toEqual(['2024', '2025', '2026']);
    expect(f.data.error).toBeUndefined();
    // the same almanac as one built straight from the data
    const a = buildAlmanac(f.data);
    expect(a.outcomes.find((o) => o.season === '2024')!.champion).toMatchObject({ mgr: 'uC' });
    expect(a.records.highestScore[0]!.pts).toBe(160);
  });

  it('loads the regular-season weeks, plus the playoff weeks only where a winners-bracket game was played', async () => {
    const c = chainClient(threeSeasons());
    await loadHistory(c, c.leagues[0]!);
    const asked = (id: string) => c.matchups.mock.calls.filter((x) => x[0] === id).map((x) => x[1]).sort();
    expect(asked('S24')).toEqual([1, 2, 3, 4, 5]);
    expect(asked('S25')).toEqual([1, 2, 3, 4]);
    // the season in progress: weeks 1 and 2 are scored, week 3 is being played and is never asked for
    expect(asked('S26')).toEqual([1, 2]);
  });

  it('does not ask for weeks before the league started', async () => {
    const h = threeSeasons();
    h.seasons[1]!.startWeek = 2;
    const c = chainClient(h);
    await loadHistory(c, c.leagues[0]!);
    expect(c.matchups.mock.calls.filter((x) => x[0] === 'S25').map((x) => x[1]).sort()).toEqual([2, 3, 4]);
  });

  it('stops at the cap and does not loop when the chain points back at itself', async () => {
    const c = chainClient(threeSeasons(), { loop: true });
    const f = await loadHistory(c, c.leagues[0]!);
    expect(f.data.seasons).toHaveLength(3);
    const g = await loadHistory(chainClient(threeSeasons()), c.leagues[0]!, { max: 2 });
    expect(g.data.seasons).toHaveLength(2);
  });

  it('with no previous season there is one season', async () => {
    const c = chainClient({ seasons: [threeSeasons().seasons[2]!] });
    const f = await loadHistory(c, c.leagues[0]!);
    expect(f.data.seasons).toHaveLength(1);
    expect(buildAlmanac(f.data).hasHistory).toBe(false);
  });

  it('saves a finished season whole and reads it back without a single request', async () => {
    const c = chainClient(threeSeasons());
    await loadHistory(c, c.leagues[0]!);
    expect([...c.saved.keys()].sort()).toEqual(['almanac:season:v2:S24', 'almanac:season:v2:S25']);
    const calls = () => c.matchups.mock.calls.length + c.rosters.mock.calls.length + c.winnersBracket.mock.calls.length;
    const before = calls();
    const again = await loadHistory(c, c.leagues[0]!);
    // only the season in progress is fetched again (its weeks 1 and 2, rosters and brackets)
    expect(calls() - before).toBe(2 + 1 + 1);
    expect(again.data.seasons.map((s) => s.leagueId)).toEqual(['S24', 'S25', 'S26']);
  });

  it('fetches a finished season fresh the first time (a copy cached mid-season may be partial)', async () => {
    const c = chainClient(threeSeasons());
    await loadHistory(c, c.leagues[0]!);
    const forced = c.rosters.mock.calls.filter((x) => x[0] === 'S25').map((x) => x[1]);
    expect(forced).toEqual([{ force: true }]);
    const live = c.rosters.mock.calls.filter((x) => x[0] === 'S26').map((x) => x[1]);
    expect(live).toEqual([{ force: undefined }]);
  });

  it('refreshes only the season in progress on a forced reload', async () => {
    const c = chainClient(threeSeasons());
    await loadHistory(c, c.leagues[0]!);
    c.rosters.mockClear();
    await loadHistory(c, c.leagues[0]!, { force: true });
    expect(c.rosters.mock.calls.map((x) => x[0])).toEqual(['S26']);
    expect(c.rosters.mock.calls[0]![1]).toEqual({ force: true });
  });

  it('works from the other weeks when one will not load, says which, and does not save the season', async () => {
    const c = chainClient(threeSeasons(), { failWeeks: [['S24', 2]] });
    const f = await loadHistory(c, c.leagues[0]!);
    const s24 = f.data.seasons.find((s) => s.season === '2024')!;
    expect(s24.missingWeeks).toEqual([2]);
    expect(buildAlmanac(f.data).missing).toEqual(['2024 wk 2']);
    expect(c.saved.has('almanac:season:v2:S24')).toBe(false);
  });

  it('ends the chain, with a message, when an earlier season cannot be loaded', async () => {
    const c = chainClient(threeSeasons(), { failLeague: 'S24' });
    const f = await loadHistory(c, c.leagues[0]!);
    expect(f.data.seasons.map((s) => s.season)).toEqual(['2025', '2026']);
    expect(f.error).toMatch(/No league S24/);
  });

  it('fails when the newest season cannot be loaded', async () => {
    const c = chainClient(threeSeasons());
    c.rosters.mockRejectedValueOnce(new Error('rosters are down'));
    await expect(loadHistory(c, c.leagues[0]!)).rejects.toThrow('rosters are down');
  });

  it('keeps only starters\' points of a matchup', async () => {
    const c = chainClient(threeSeasons());
    const f = await loadHistory(c, c.leagues[0]!);
    const m = f.data.seasons[0]!.matchups[3]!.find((x) => x.roster_id === 3)!;
    expect(m.players_points).toEqual({ p1: 45.5, p2: 30 });
  });
});
