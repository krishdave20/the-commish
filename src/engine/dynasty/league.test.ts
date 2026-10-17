import { describe, expect, it } from 'vitest';
import { handModel } from '../test-helpers.ts';
import { buildDynasty, leagueRounds, teamsNow, type DynastyInput } from './league.ts';
import { pickKey } from './picks.ts';
import { fcPickRows, fcPlayer } from './test-helpers.ts';

function model() {
  const m = handModel({
    cur: 5, last: 8, slots: ['QB', 'RB', 'WR'], playoffTeams: 2, sd: 20, meRid: 1,
    teams: [{ rid: 1, wins: 4, losses: 0 }, { rid: 2, wins: 2, losses: 2 }, { rid: 3, wins: 1, losses: 3 }, { rid: 4, wins: 1, losses: 3 }],
    players: [
      { pid: 'q1', pos: 'QB', mu: 20, owner: 1 }, { pid: 'r1', pos: 'RB', mu: 15, owner: 1 },
      { pid: 'q2', pos: 'QB', mu: 18, owner: 2 }, { pid: 'r2', pos: 'RB', mu: 12, owner: 2 },
      { pid: 'q3', pos: 'QB', mu: 12, owner: 3 }, { pid: 'r3', pos: 'RB', mu: 9, owner: 3 },
      { pid: 'q4', pos: 'QB', mu: 10, owner: 4 }, { pid: 'r4', pos: 'RB', mu: 8, owner: 4 },
    ],
  });
  // pretend the simulation has landed
  m.teams.forEach((t, i) => { t.playoffPct = [0.97, 0.6, 0.3, 0.13][i]!; t.expWins = [6.5, 4.5, 3.5, 3.2][i]!; });
  return m;
}

const fc = { ...fcPickRows(), q1: fcPlayer('q1', 6000, 'QB'), r1: fcPlayer('r1', 5000, 'RB'), q2: fcPlayer('q2', 3000, 'QB'), r2: fcPlayer('r2', 9000, 'RB'), q3: fcPlayer('q3', 1000, 'QB'), r3: fcPlayer('r3', 2000, 'RB'), q4: fcPlayer('q4', 800, 'QB') };
const ages: Record<string, number> = { q1: 33, r1: 29, q2: 30, r2: 22, q3: 24, r3: 23, q4: 21, r4: 22 };

function input(over: Partial<DynastyInput> = {}): DynastyInput {
  const m = model();
  return {
    teams: teamsNow(m), rosters: { 1: ['q1', 'r1'], 2: ['q2', 'r2'], 3: ['q3', 'r3'], 4: ['q4', 'r4'] }, fc,
    facts: (pid) => ({ age: ages[pid] ?? null }), tradedPicks: [], league: { season: '2026', status: 'in_season', settings: { draft_rounds: 2 } }, ...over,
  };
}

describe('teamsNow', () => {
  it('sums expected lineup points from the current week to the last regular week', () => {
    const t = teamsNow(model());
    expect(t[0]).toMatchObject({ rid: 1, wins: 4, playoffPct: 0.97, expWins: 6.5, ptsRos: (20 + 15) * 4 }); // weeks 5-8
    expect(t[3]!.ptsRos).toBe((10 + 8) * 4);
  });
});

describe('buildDynasty', () => {
  const d = buildDynasty(input());

  it('covers the next three drafts and the league\'s draft rounds', () => {
    expect(d.seasons).toEqual(['2027', '2028', '2029']);
    expect(d.rounds).toBe(2);
    expect(Object.values(d.picks).flat()).toHaveLength(4 * 3 * 2);
  });
  it('projects the worst finishers early and the best late', () => {
    expect(d.buckets).toEqual({ 1: 'late', 2: 'mid', 3: 'mid', 4: 'early' });
    expect(d.picks[1]!.find((p) => p.key === pickKey('2027', 1, 1))).toMatchObject({ bucket: 'late', value: 2300 });
  });
  it('totals each team\'s players and picks', () => {
    const picksOf1 = d.picks[1]!.reduce((s, p) => s + (p.value ?? 0), 0);
    expect(d.values[1]!.players).toBe(11000);
    expect(d.values[1]!.picks).toBe(picksOf1);
    expect(d.values[1]!.total).toBe(11000 + picksOf1);
    expect(d.values[4]).toMatchObject({ players: 800, unvalued: 1 }); // r4 has no FantasyCalc row
  });
  it('labels every team with its numbers', () => {
    expect(d.lens).toHaveLength(4);
    const t = (rid: number) => d.lens.find((x) => x.rid === rid)!;
    expect(t(1)).toMatchObject({ playoffRank: 1, ptsRank: 1 });
    expect(d.lens.every((x) => ['contender', 'rebuilder', 'retool', 'all-in'].includes(x.label))).toBe(true);
    // team 2: strong future (the 9,000 rookie RB), middling now
    expect(t(2).valueRank).toBe(1);
  });
  it('follows traded picks to their new owners', () => {
    const traded = buildDynasty(input({ tradedPicks: [{ season: '2027', round: 1, roster_id: 4, owner_id: 1 }] }));
    expect(traded.picks[1]!.find((p) => p.key === pickKey('2027', 1, 4))).toMatchObject({ acquired: true, ownerRosterId: 1, bucket: 'early', value: 4600 });
    expect(traded.picks[4]!.some((p) => p.key === pickKey('2027', 1, 4))).toBe(false);
    expect(traded.values[1]!.picks).toBeGreaterThan(d.values[1]!.picks);
  });
  it('has no pick values when FantasyCalc is down', () => {
    const down = buildDynasty(input({ fc: null }));
    expect(down.noPickValues).toBe(true);
    expect(down.values[1]).toMatchObject({ total: 0, players: 0, unvalued: 2 });
    expect(down.picks[1]!.every((p) => p.value === null)).toBe(true);
  });
  it('uses record for the bucket while the simulation is pending', () => {
    const m = model();
    const flat = teamsNow(m).map((t) => ({ ...t, expWins: 0, playoffPct: 0 }));
    expect(buildDynasty(input({ teams: flat, oddsPending: true })).buckets).toEqual({ 1: 'late', 2: 'mid', 3: 'early', 4: 'mid' });
  });
});

describe('leagueRounds', () => {
  it('reads settings.draft_rounds, else FantasyCalc\'s four', () => {
    expect(leagueRounds({ settings: { draft_rounds: 5 } })).toBe(5);
    expect(leagueRounds({ settings: {} })).toBe(4);
    expect(leagueRounds({})).toBe(4);
    expect(leagueRounds({ settings: { draft_rounds: 0 } })).toBe(4);
  });
});
