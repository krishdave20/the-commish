import { describe, expect, it } from 'vitest';
import type { BracketRow } from '../../data/types.ts';
import { buildAlmanac } from './almanac.ts';
import { playoffGames, regularGames } from './games.ts';
import { buildManagers, managerIdOf, rosterIndex } from './managers.ts';
import { outcomeOf } from './seasons.ts';
import { rivalsOf } from './rivalries.ts';
import { season, threeSeasons } from './test-helpers.ts';

const row = (r: number, m: number, o: Partial<BracketRow>): BracketRow => ({ r, m, t1: null, t2: null, w: null, l: null, ...o });

describe('managers across seasons', () => {
  it('ties a person together by user id even though the roster id changes every season', () => {
    const { seasons } = threeSeasons();
    const mgrs = buildManagers(seasons);
    // Ann held roster 1 in 2024, roster 2 in 2025 and roster 1 again in 2026: one manager
    expect([...mgrs.keys()].sort()).toEqual(['uA', 'uB', 'uC', 'uD', 'uE']);
    expect(mgrs.get('uA')!.seasons).toEqual(['2024', '2025', '2026']);
    expect(rosterIndex(seasons[0]!).get(2)!.mgr).toBe('uB');
    expect(rosterIndex(seasons[1]!).get(2)!.mgr).toBe('uA');
    expect(rosterIndex(seasons[2]!).get(2)!.mgr).toBe('uC');
    expect(mgrs.get('uD')!.seasons).toEqual(['2024', '2025']);
    expect(mgrs.get('uE')!.seasons).toEqual(['2026']);
  });

  it('takes the display name and team name from the latest season the person was in', () => {
    const s = threeSeasons().seasons;
    s[2]!.users.find((u) => u.userId === 'uA')!.displayName = 'Ann (new name)';
    s[2]!.users.find((u) => u.userId === 'uA')!.teamName = 'icemen';
    const a = buildManagers(s).get('uA')!;
    expect(a.name).toBe('Ann (new name)');
    expect(a.team).toBe('icemen');
    expect(a.teamBySeason).toEqual({ '2024': 'Aces', '2025': 'Aces', '2026': 'icemen' });
    // a manager who left keeps the last name seen
    expect(buildManagers(s).get('uD')!.name).toBe('Di');
  });

  it('keeps an open roster as its own one-season manager that merges with nobody', () => {
    const s = season({ leagueId: 'X', season: '2024', owners: ['uA', null, null], throughWeek: 0, weeks: {} });
    expect(managerIdOf(s, s.rosters[1]!)).toBe('vacant:2024:2');
    expect(managerIdOf(s, s.rosters[2]!)).toBe('vacant:2024:3');
    const m = buildManagers([s]);
    expect(m.get('vacant:2024:2')).toMatchObject({ vacant: true, name: 'open team' });
  });
});

describe('games', () => {
  it('reads regular-season pairs by matchup id and skips byes and unplayed 0-0 weeks', () => {
    const s = season({
      leagueId: 'X', season: '2024', owners: ['uA', 'uB', 'uC'], throughWeek: 2,
      weeks: { 1: [[1, 100, 1], [2, 90, 1], [3, 70, 0]], 2: [[1, 0, 1], [2, 0, 1]] },
    });
    s.matchups[1]![2]!.matchup_id = null; // roster 3 is on a bye
    s.matchups[1]![2]!.roster_id = 3;
    const g = regularGames(s);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ week: 1, kind: 'regular', winner: 'uA' });
  });

  it('starts at the league\'s first scored week, so a late start\'s partial week 1 is not a record', () => {
    const s = season({
      leagueId: 'X', season: '2025', owners: ['uA', 'uB'], throughWeek: 2, startWeek: 2,
      weeks: { 1: [[1, 8.6, 1], [2, 0, 1]], 2: [[1, 122.9, 1], [2, 133.8, 1]] },
    });
    const g = regularGames(s);
    expect(g.map((x) => x.week)).toEqual([2]);
    const a = buildAlmanac({ seasons: [s] });
    expect(a.records.lowestScore[0]!.pts).toBe(122.9);
  });

  it('ignores weeks after throughWeek (the week in progress is not counted)', () => {
    const { seasons } = threeSeasons();
    const s26 = { ...seasons[2]!, matchups: { ...seasons[2]!.matchups, 3: [{ roster_id: 1, matchup_id: 1, points: 20 }, { roster_id: 2, matchup_id: 1, points: 10 }] } };
    expect(regularGames(s26).every((g) => g.week <= 2)).toBe(true);
    expect(regularGames(s26)).toHaveLength(4);
  });

  it('scores playoff games from the round\'s week and adds both weeks of a two-week round', () => {
    const { seasons } = threeSeasons();
    const p = playoffGames(seasons[0]!);
    expect(p).toHaveLength(4);
    const final = p.find((g) => g.round === 2 && g.a.mgr === 'uA' && g.b.mgr === 'uC')!;
    expect(final).toMatchObject({ week: 5, kind: 'playoff', winner: 'uC' });
    expect([final.a.pts, final.b.pts]).toEqual([90, 140]);

    const two = season({
      leagueId: 'Y', season: '2030', owners: ['uA', 'uB'], throughWeek: 0, roundType: 1, playoffWeekStart: 15,
      weeks: {}, playoffWeeks: { 15: [[1, 100, 1], [2, 90, 1]], 16: [[1, 80, 1], [2, 95, 1]] },
      winners: [row(1, 1, { p: 1, t1: 1, t2: 2, w: 1, l: 2 })],
    });
    const g = playoffGames(two);
    expect(g).toHaveLength(1);
    expect([g[0]!.a.pts, g[0]!.b.pts]).toEqual([180, 185]);
    // the bracket says roster 1 won (a tiebreaker, say): the bracket decides, not the points
    expect(g[0]!.winner).toBe('uA');
  });

  it('keeps the best starter of a team-week and never a bench player', () => {
    const { seasons } = threeSeasons();
    const g = regularGames(seasons[0]!).find((x) => x.week === 3 && x.a.rid === 2)!;
    expect(g.b.top).toEqual({ pid: 'p1', pts: 45.5 });
  });
});

describe('season outcomes: champion, runner-up, toilet bowl', () => {
  const a = buildAlmanac(threeSeasons());
  const by = (y: string) => a.outcomes.find((o) => o.season === y)!;

  it('finds the champion and runner-up in the winners bracket final (p: 1), upsets included', () => {
    expect(by('2024').champion).toMatchObject({ mgr: 'uC', team: 'Cats', rid: 3, source: 'bracket' });
    expect(by('2024').runnerUp).toMatchObject({ mgr: 'uA' });
    // roster ids changed: 2025's champion is Ann, who was roster 2
    expect(by('2025').champion).toMatchObject({ mgr: 'uA', rid: 2 });
    expect(by('2025').runnerUp).toMatchObject({ mgr: 'uD' });
  });

  it('has no champion while the season is in progress', () => {
    expect(by('2026').champion).toBeNull();
    expect(by('2026').toilet).toBeNull();
    expect(by('2026').playoffTeams).toEqual([]);
  });

  it('falls back to Sleeper\'s recorded winner when the bracket is empty', () => {
    const s = season({ leagueId: 'X', season: '2022', owners: ['uA', 'uB'], throughWeek: 0, weeks: {}, championRid: 2 });
    const o = outcomeOf(s, rosterIndex(s), []);
    expect(o.champion).toMatchObject({ mgr: 'uB', source: 'sleeper' });
  });

  it('names the last-place regular season team when there is no toilet bowl, and says so', () => {
    expect(by('2024').toilet).toMatchObject({ mgr: 'uB', source: 'last-place' });
    expect(by('2025').toilet).toMatchObject({ mgr: 'uC', source: 'last-place' });
  });

  it('names the toilet bowl winner (the team that lost every round) when the losers bracket is a toilet bowl', () => {
    const s = season({
      leagueId: 'T', season: '2023', owners: ['uA', 'uB', 'uC', 'uD', 'uE', 'uF'], throughWeek: 0, weeks: {},
      winners: [row(1, 1, { p: 1, t1: 1, t2: 2, w: 1, l: 2 })],
      losers: [
        row(1, 1, { t1: 3, t2: 4, w: 4, l: 3 }), row(1, 2, { t1: 5, t2: 6, w: 5, l: 6 }),
        row(2, 3, { p: 1, t1: 3, t2: 6, w: 3, l: 6, t1_from: { l: 1 }, t2_from: { l: 2 } }),
      ],
    });
    const o = outcomeOf(s, rosterIndex(s), []);
    expect(o.toilet).toMatchObject({ mgr: 'uF', rid: 6, source: 'toilet-bowl' });
  });

  it('does not treat a consolation bracket (winners advance) as a toilet bowl', () => {
    const s = season({
      leagueId: 'T', season: '2023', owners: ['uA', 'uB', 'uC', 'uD'], throughWeek: 1, weeks: { 1: [[1, 100, 1], [2, 90, 1], [3, 80, 2], [4, 70, 2]] },
      losers: [
        row(1, 1, { t1: 3, t2: 4, w: 3, l: 4 }), row(1, 2, { t1: 1, t2: 2, w: 1, l: 2 }),
        row(2, 3, { p: 1, t1: 3, t2: 1, w: 3, l: 1, t1_from: { w: 1 }, t2_from: { w: 2 } }),
      ],
    });
    const idx = rosterIndex(s);
    expect(outcomeOf(s, idx, regularGames(s)).toilet).toMatchObject({ mgr: 'uD', source: 'last-place' });
  });

  it('lists the playoff field only once the season is over', () => {
    expect(by('2024').playoffTeams.sort()).toEqual(['uA', 'uB', 'uC', 'uD']);
    expect(by('2025').playoffTeams.sort()).toEqual(['uA', 'uD']);
  });
});

describe('standings of each season and all time', () => {
  const a = buildAlmanac(threeSeasons());

  it('ranks a season by wins (a tie is half) then points for', () => {
    const s25 = a.outcomes.find((o) => o.season === '2025')!.standings;
    expect(s25.map((r) => r.mgr)).toEqual(['uD', 'uA', 'uB', 'uC']);
    expect(s25[1]).toMatchObject({ w: 1, l: 1, t: 1, pf: 350, pa: 270 });
  });

  it('totals every manager across seasons', () => {
    const row = (m: string) => a.allTime.find((r) => r.mgr === m)!;
    expect(row('uA')).toMatchObject({ seasons: 3, w: 6, l: 1, t: 1, games: 8, pf: 980, pa: 660, titles: 1, titleSeasons: ['2025'], playoffs: 2, toilets: 0 });
    expect(row('uA').pct).toBeCloseTo(0.8125, 4);
    expect(row('uB')).toMatchObject({ w: 1, l: 6, t: 1, titles: 0, playoffs: 1, toilets: 1 });
    expect(row('uC')).toMatchObject({ w: 3, l: 5, titles: 1, titleSeasons: ['2024'], playoffs: 1, toilets: 1 });
    expect(row('uD')).toMatchObject({ seasons: 2, w: 3, l: 3, playoffs: 2 });
    expect(row('uE')).toMatchObject({ seasons: 1, w: 2, l: 0, pf: 215 });
  });

  it('sorts by win percentage', () => {
    expect(a.allTime.map((r) => r.mgr)).toEqual(['uE', 'uA', 'uD', 'uC', 'uB']);
  });
});

describe('records', () => {
  const a = buildAlmanac(threeSeasons());
  const r = a.records;

  it('highest and lowest single-week scores with season, week and opponent', () => {
    expect(r.highestScore[0]).toMatchObject({ mgr: 'uA', pts: 160, season: '2026', week: 1, oppMgr: 'uC', oppPts: 100 });
    expect(r.highestScore.map((e) => e.pts)).toEqual([160, 150, 140, 130, 130]);
    // a tie in points falls back to the older season first
    expect(r.highestScore[3]!.season).toBe('2024');
    expect(r.lowestScore[0]).toMatchObject({ mgr: 'uD', pts: 50, season: '2024', week: 3 });
  });

  it('biggest blowout and closest game (a tie is the closest of all)', () => {
    expect(r.biggestBlowout[0]).toMatchObject({ margin: 90, season: '2025', week: 2 });
    expect(r.biggestBlowout[0]!.winner).toMatchObject({ mgr: 'uA', pts: 150 });
    expect(r.biggestBlowout[0]!.loser).toMatchObject({ mgr: 'uC', pts: 60 });
    expect(r.closestGame[0]).toMatchObject({ margin: 0, season: '2025', week: 1 });
    expect(r.closestGame[1]).toMatchObject({ margin: 5 });
  });

  it('most points in a loss and fewest points in a win', () => {
    expect(r.mostPointsInLoss[0]).toMatchObject({ pts: 100, mgr: 'uA', season: '2025', week: 3 });
    expect(r.fewestPointsInWin[0]).toMatchObject({ pts: 80, mgr: 'uC', season: '2024', week: 1 });
  });

  it('most points, best and worst record in a season (finished seasons only)', () => {
    expect(r.seasonRecordsPartial).toBe(false);
    expect(r.mostPointsInSeason[0]).toMatchObject({ mgr: 'uA', season: '2025', pf: 350 });
    expect(r.bestRecord[0]).toMatchObject({ mgr: 'uA', season: '2024', w: 3, l: 0, pct: 1 });
    expect(r.worstRecord[0]).toMatchObject({ mgr: 'uB', season: '2024', w: 0, l: 3 });
    expect(r.mostPointsInSeason.every((e) => e.season !== '2026')).toBe(true);
  });

  it('longest win and losing streaks run across seasons and are broken by a tie', () => {
    expect(r.longestWinStreak[0]).toMatchObject({ mgr: 'uA', length: 3, from: { season: '2024', week: 1 }, to: { season: '2024', week: 3 } });
    // Cy loses in 2025 weeks 2 and 3 and 2026 weeks 1 and 2
    expect(r.longestLossStreak[0]).toMatchObject({ mgr: 'uC', length: 4, from: { season: '2025', week: 2 }, to: { season: '2026', week: 2 }, ongoing: true });
    // Bo's three losses in 2024 end with the tie in 2025
    expect(r.longestLossStreak.find((s) => s.mgr === 'uB')).toMatchObject({ length: 3, ongoing: false });
  });

  it('top single-player week counts starters only', () => {
    expect(r.topPlayerWeek[0]).toMatchObject({ pid: 'p4', pts: 52.2, mgr: 'uA', season: '2026', week: 1 });
    expect(r.topPlayerWeek[1]).toMatchObject({ pid: 'p1', pts: 45.5 });
    expect(r.topPlayerWeek.some((p) => p.pid === 'bench1')).toBe(false);
  });
});

describe('this season against history', () => {
  const a = buildAlmanac(threeSeasons());

  it('ranks this season\'s best games among every game on record', () => {
    const highest = a.callouts.find((c) => c.kind === 'highest')!;
    expect(highest).toMatchObject({ rank: 1, of: 32 });
    expect((highest.entry as { pts: number }).pts).toBe(160);
    const lowest = a.callouts.find((c) => c.kind === 'lowest')!;
    expect((lowest.entry as { pts: number }).pts).toBe(85);
    expect(lowest.rank).toBe(8);
    // the 60-point blowout ties for 3rd of 16 games
    expect(a.callouts.find((c) => c.kind === 'blowout')).toMatchObject({ rank: 3, of: 16 });
    // Eve's 10-point win ties for 3rd closest (0, 5, then five games decided by 10)
    expect(a.callouts.find((c) => c.kind === 'closest')).toMatchObject({ rank: 3, of: 16 });
  });
});

describe('head to head', () => {
  const a = buildAlmanac(threeSeasons());

  it('counts regular season and playoff meetings in one series, told from either side', () => {
    const ab = a.rivalries.get('uA', 'uB')!;
    expect(ab).toMatchObject({ aWins: 3, bWins: 0, ties: 1 });
    expect(ab.meetings).toHaveLength(4);
    const ba = a.rivalries.get('uB', 'uA')!;
    expect(ba).toMatchObject({ a: 'uB', b: 'uA', aWins: 0, bWins: 3, ties: 1 });
    expect(ba.meetings[0]).toMatchObject({ aPts: 90, bPts: 100 });
  });

  it('gives the average margin, the biggest win each way, the streak and the playoff meetings', () => {
    const ab = a.rivalries.get('uA', 'uB')!;
    expect(ab.avgMargin).toBeCloseTo(16.25, 4);
    expect(ab.biggestA).toMatchObject({ season: '2026', week: 2, aPts: 140, bPts: 90 });
    expect(ab.biggestB).toBeNull();
    // the 2025 tie ended Ann's earlier run: her streak is the one 2026 win
    expect(ab.streak).toEqual({ mgr: 'uA', length: 1 });
    expect(ab.playoffMeetings).toHaveLength(1);
    expect(ab.playoffMeetings[0]).toMatchObject({ season: '2024', week: 4, round: 1, aPts: 105, bPts: 100 });

    const ac = a.rivalries.get('uA', 'uC')!;
    expect(ac).toMatchObject({ aWins: 3, bWins: 1 });
    expect(ac.biggestB).toMatchObject({ season: '2024', week: 5 });
    // the playoff final is the only playoff meeting, and flips with the side
    expect(a.rivalries.get('uC', 'uA')!.biggestA).toMatchObject({ aPts: 140, bPts: 90 });
  });

  it('is null for two managers who never met, and for a manager against themselves', () => {
    expect(a.rivalries.get('uD', 'uE')).toBeNull();
    expect(a.rivalries.get('uA', 'uA')).toBeNull();
  });

  it('picks your closest series and your most-played opponent', () => {
    const rv = rivalsOf(a.rivalries, 'uA');
    // Ann is 2-1 against Di (a regular-season win each way, and the 2025 final); against Bo and Cy she leads by two or more
    expect(rv.closest).toMatchObject({ a: 'uA', b: 'uD', aWins: 2, bWins: 1 });
    // four meetings each with Bo and Cy: the tie goes to the first name
    expect(rv.mostPlayed!.aWins + rv.mostPlayed!.bWins + rv.mostPlayed!.ties).toBe(4);
  });

  it('has no closest series when nobody has met twice', () => {
    expect(rivalsOf(a.rivalries, 'uE').closest).toBeNull();
  });
});

describe('a league with no history (one season, in progress)', () => {
  const one = threeSeasons().seasons[2]!;
  const a = buildAlmanac({ seasons: [one] });

  it('still has this season\'s records and says there is no history', () => {
    expect(a.hasHistory).toBe(false);
    expect(a.empty).toBe(false);
    expect(a.records.highestScore[0]).toMatchObject({ pts: 160, season: '2026' });
    // nothing is finished, so the season-long records fall back to the season so far and say so
    expect(a.records.seasonRecordsPartial).toBe(true);
    expect(a.records.bestRecord[0]).toMatchObject({ partial: true });
    expect(a.outcomes.map((o) => o.champion)).toEqual([null]);
    expect(a.allTime.find((r) => r.mgr === 'uA')).toMatchObject({ seasons: 1, w: 2, titles: 0 });
  });

  it('is empty before a single game is played', () => {
    const none = buildAlmanac({ seasons: [season({ leagueId: 'N', season: '2026', complete: false, owners: ['uA', 'uB'], throughWeek: 0, weeks: {} })] });
    expect(none.empty).toBe(true);
    expect(none.records.highestScore).toEqual([]);
    expect(none.callouts).toEqual([]);
    expect(none.allTime.every((r) => r.games === 0)).toBe(true);
  });
});

describe('gaps', () => {
  it('reports weeks that could not be loaded', () => {
    const h = threeSeasons();
    h.seasons[0]!.missingWeeks = [2];
    expect(buildAlmanac(h).missing).toEqual(['2024 wk 2']);
  });
});
