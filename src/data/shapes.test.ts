import { describe, expect, it } from 'vitest';
import { shapes } from './shapes.ts';
import { draft, league, leagueUser, nflState, roster } from './test-helpers.ts';

describe('shape guards', () => {
  it('accept what Sleeper sends', () => {
    expect(shapes.nflState(nflState())).toBe(true);
    expect(shapes.user({ user_id: '1', display_name: 'x', avatar: null })).toBe(true);
    expect(shapes.league(league())).toBe(true);
    expect(shapes.leagues([league(), league()])).toBe(true);
    expect(shapes.rosters([roster(1)])).toBe(true);
    expect(shapes.rosters([{ ...roster(1), players: null }])).toBe(true);
    expect(shapes.leagueUsers([leagueUser(1)])).toBe(true);
    expect(shapes.drafts([draft()])).toBe(true);
    expect(shapes.tradedPicks([{ season: '2027', round: 1, roster_id: 1, previous_owner_id: 1, owner_id: 2 }])).toBe(true);
    expect(shapes.players({ '1': { player_id: '1', team: null, position: 'QB' } })).toBe(true);
    expect(shapes.weekStats({ '1': { pts_ppr: 3.2 } })).toBe(true);
    expect(shapes.projections([{ player_id: '1', stats: { pts_ppr: 9 } }])).toBe(true);
    expect(shapes.schedule([{ week: 1, home: 'KC', away: 'BUF' }])).toBe(true);
    expect(shapes.trending([{ player_id: '1', count: 40 }])).toBe(true);
    expect(shapes.matchups([{ roster_id: 1, matchup_id: 1, points: 0 }])).toBe(true);
    expect(shapes.transactions([{ transaction_id: 't', type: 'trade', status: 'complete' }])).toBe(true);
    expect(shapes.draftPicks([{ round: 1, pick_no: 1, player_id: '5', roster_id: 1 }])).toBe(true);
    expect(shapes.fantasyCalc([{ player: { sleeperId: '1' }, value: 100 }])).toBe(true);
  });

  it('accept empty collections', () => {
    for (const g of [shapes.rosters, shapes.drafts, shapes.projections, shapes.schedule, shapes.trending, shapes.matchups, shapes.tradedPicks]) {
      expect(g([])).toBe(true);
    }
    expect(shapes.weekStats({})).toBe(true);
  });

  it('reject wrong containers and missing fields', () => {
    expect(shapes.nflState({ week: '6', season: '2026', season_type: 'regular' })).toBe(false);
    expect(shapes.nflState(null)).toBe(false);
    expect(shapes.user({ display_name: 'x' })).toBe(false);
    expect(shapes.league({ ...league(), total_rosters: undefined })).toBe(false);
    expect(shapes.rosters({})).toBe(false);
    expect(shapes.rosters([{ roster_id: 'a' }])).toBe(false);
    expect(shapes.leagues('nope')).toBe(false);
    expect(shapes.schedule([{ week: 1, home: 'KC' }])).toBe(false);
    expect(shapes.projections([{ player_id: '1' }])).toBe(false);
    expect(shapes.projections({ player_id: '1', stats: {} })).toBe(false);
    expect(shapes.weekStats([])).toBe(false);
    expect(shapes.weekStats({ '1': 5 })).toBe(false);
    expect(shapes.players([])).toBe(false);
    expect(shapes.fantasyCalc([{ value: 1 }])).toBe(false);
    expect(shapes.trending([{ player_id: 1, count: 2 }])).toBe(false);
  });

  it('only samples the first few entries of a big collection', () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ round: 1, pick_no: i, player_id: String(i), roster_id: 1 }));
    (big[4000] as unknown as { round: string }).round = 'x';
    expect(shapes.draftPicks(big)).toBe(true);
  });
});
