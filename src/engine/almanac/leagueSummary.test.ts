import { describe, expect, it } from 'vitest';
import type { LeagueUser, SleeperLeague, SleeperRoster } from '../../data';
import type { Matchup, ProjectionRow } from '../../data/types.ts';
import { projectedLineup, standingOf, summarizeLeague } from './leagueSummary.ts';

const league = (o: Partial<SleeperLeague> = {}): SleeperLeague => ({
  league_id: 'L', name: 'Sample League', season: '2026', status: 'in_season', total_rosters: 4, roster_positions: ['QB', 'RB'],
  scoring_settings: { rec: 1 }, settings: { playoff_teams: 2 }, previous_league_id: null, draft_id: null, avatar: null, metadata: null, ...o,
});
const roster = (id: number, owner: string | null, w: number, l: number, fpts: number, ties = 0): SleeperRoster => ({
  roster_id: id, owner_id: owner, players: [], starters: [], reserve: null, settings: { wins: w, losses: l, ties, fpts, fpts_decimal: 0 },
});
const users: LeagueUser[] = [
  { user_id: 'u1', display_name: 'Ann', avatar: null, metadata: { team_name: 'icemen' } },
  { user_id: 'u2', display_name: 'Bo', avatar: null },
  { user_id: 'u3', display_name: 'Cy', avatar: null },
];
const rosters = [roster(1, 'u1', 4, 1, 500), roster(2, 'u2', 4, 1, 520), roster(3, 'u3', 2, 3, 400), roster(4, null, 1, 4, 380)];

describe('standing', () => {
  it('ranks by wins then points for and says how far from the playoff line', () => {
    expect(standingOf(rosters, 1, 2)).toEqual({ rank: 2, of: 4, playoffTeams: 2, inPlayoffs: true, winsFromLine: 2 });
    expect(standingOf(rosters, 2, 2)).toMatchObject({ rank: 1, inPlayoffs: true });
    // out: behind the last team in
    expect(standingOf(rosters, 3, 2)).toEqual({ rank: 3, of: 4, playoffTeams: 2, inPlayoffs: false, winsFromLine: 2 });
  });
  it('counts a tie as half a win', () => {
    const r = [roster(1, 'u1', 3, 1, 400, 1), roster(2, 'u2', 3, 2, 500)];
    expect(standingOf(r, 1, 1)).toMatchObject({ rank: 1, winsFromLine: 0.5 });
  });
  it('is null for a roster that is not in the league', () => {
    expect(standingOf(rosters, 99, 2)).toBeNull();
  });
});

describe('projectedLineup', () => {
  const rows = [
    { player_id: 'a', stats: { pts_ppr: 20 } }, { player_id: 'b', stats: { pts_ppr: 12.5, pts_std: 9 } },
  ] as unknown as ProjectionRow[];
  it('adds the starters\' projections scored with the league\'s settings', () => {
    expect(projectedLineup(['a', 'b'], rows, { rec: 1 })).toBe(32.5);
    expect(projectedLineup(['a', 'b'], rows, { rec: 0 })).toBe(29);
  });
  it('is null with no projections or no starters', () => {
    expect(projectedLineup(['a'], [], { rec: 1 })).toBeNull();
    expect(projectedLineup([], rows, { rec: 1 })).toBeNull();
    expect(projectedLineup(['zzz'], rows, { rec: 1 })).toBeNull();
  });
});

describe('summarizeLeague', () => {
  const matchups: Matchup[] = [
    { roster_id: 1, matchup_id: 1, points: 95, starters: ['a'] }, { roster_id: 2, matchup_id: 1, points: 58.8, starters: ['b'] },
    { roster_id: 3, matchup_id: 2, points: 0 }, { roster_id: 4, matchup_id: 2, points: 0 },
  ];
  const projections = [{ player_id: 'a', stats: { pts_ppr: 20 } }, { player_id: 'b', stats: { pts_ppr: 12 } }] as unknown as ProjectionRow[];

  it('gives your record, standing and this week\'s matchup with the score and the projection', () => {
    const s = summarizeLeague({ league: league(), rosters, users, userId: 'u1', matchups, week: 6, projections });
    expect(s.me).toMatchObject({ rid: 1, team: 'icemen', wins: 4, losses: 1 });
    expect(s.standing).toMatchObject({ rank: 2, inPlayoffs: true });
    expect(s.matchup).toMatchObject({ week: 6, started: true, leading: true });
    expect(s.matchup!.me).toMatchObject({ team: 'icemen', points: 95, projected: 20 });
    expect(s.matchup!.opp).toMatchObject({ team: 'Bo', points: 58.8, projected: 12 });
  });

  it('shows a matchup that has not started with no leader', () => {
    const s = summarizeLeague({ league: league(), rosters, users, userId: 'u3', matchups, week: 6 });
    expect(s.matchup).toMatchObject({ started: false, leading: null });
    expect(s.matchup!.me.projected).toBeNull();
  });

  it('is trailing when behind, and a co-owner counts as you', () => {
    const co = rosters.map((r) => (r.roster_id === 2 ? { ...r, co_owners: ['u9'] } : r));
    const s = summarizeLeague({ league: league(), rosters: co, users, userId: 'u9', matchups, week: 6 });
    expect(s.me!.rid).toBe(2);
    // Bo's 58.8 against Ann's 95
    expect(s.matchup!.leading).toBe(false);
    expect(s.matchup!.opp).toMatchObject({ team: 'icemen', points: 95 });
  });

  it('has no matchup in the offseason, and nothing when you have no roster there', () => {
    const off = summarizeLeague({ league: league({ status: 'complete' }), rosters, users, userId: 'u1', matchups: null, week: 18 });
    expect(off.matchup).toBeNull();
    expect(off.standing).not.toBeNull();
    const none = summarizeLeague({ league: league(), rosters, users, userId: 'stranger', matchups, week: 6 });
    expect(none).toMatchObject({ me: null, standing: null, matchup: null });
  });

  it('has no opponent on a bye', () => {
    const bye: Matchup[] = [{ roster_id: 1, matchup_id: null, points: 0 }];
    const s = summarizeLeague({ league: league(), rosters, users, userId: 'u1', matchups: bye, week: 6 });
    expect(s.matchup).toMatchObject({ opp: null, leading: null });
  });
});
