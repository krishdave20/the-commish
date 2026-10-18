import { describe, expect, it } from 'vitest';
import type { ScoreGame } from '../../data/types.ts';
import { gameDetail, indexByTeam } from './detail.ts';
import { groupBySlot, lineScore, overlayLive, parseGameRows, timeSlot, trimRecord } from './games.ts';
import { buildRecords, buildStandings, formatPct, formatWlt, orderTeams, playoffPicture } from './standings.ts';
import type { ResultGame } from './standings.ts';
import { NFL_TEAMS, fullName, teamOf } from './teams.ts';

const g = (week: number, away: string, awayScore: number, home: string, homeScore: number): ResultGame =>
  ({ week, away, home, awayScore, homeScore, state: 'final' });

describe('the team table', () => {
  it('has 32 teams, 8 divisions of 4, and Sleeper’s codes', () => {
    expect(NFL_TEAMS).toHaveLength(32);
    expect(new Set(NFL_TEAMS.map((t) => t.abbr)).size).toBe(32);
    for (const conf of ['AFC', 'NFC'] as const) {
      for (const d of ['East', 'North', 'South', 'West'] as const) {
        expect(NFL_TEAMS.filter((t) => t.conf === conf && t.division === d)).toHaveLength(4);
      }
    }
    expect(teamOf('LAR')).toMatchObject({ city: 'Los Angeles', nickname: 'Rams', conf: 'NFC', division: 'West' });
    expect(teamOf('WAS')?.nickname).toBe('Commanders');
    expect(fullName('KC')).toBe('Kansas City Chiefs');
    expect(teamOf('N1')).toBeNull();
    expect(teamOf('OAK')?.abbr).toBe('LV');
  });
});

describe('records', () => {
  const games = [
    g(1, 'BUF', 24, 'MIA', 17), // division game
    g(2, 'MIA', 20, 'NE', 20), // tie, division game
    g(3, 'BUF', 10, 'KC', 30), // conference game
    g(4, 'MIA', 14, 'CHI', 28), // non-conference
    { week: 5, away: 'NE', home: 'NYJ', awayScore: 3, homeScore: 0, state: 'live' } as ResultGame,
    g(5, 'N1', 3, 'N2', 0),
  ];
  const rec = buildRecords(games);

  it('counts wins, losses, ties, points and the splits from final games only', () => {
    expect(rec.get('BUF')).toMatchObject({ w: 1, l: 1, t: 0, pf: 34, pa: 47, diff: -13, div: { w: 1, l: 0, t: 0 }, conf: { w: 1, l: 1, t: 0 } });
    expect(rec.get('MIA')).toMatchObject({ w: 0, l: 2, t: 1, pf: 51, pa: 72, div: { w: 0, l: 1, t: 1 }, conf: { w: 0, l: 1, t: 1 } });
    expect(rec.get('NE')).toMatchObject({ w: 0, l: 0, t: 1 });
    expect(rec.get('NYJ')!.games).toHaveLength(0);
    expect(rec.get('CHI')!.conf).toEqual({ w: 0, l: 0, t: 0 });
  });

  it('reads win percentage with a tie as half a win, the streak and the last five', () => {
    expect(rec.get('MIA')!.pct).toBeCloseTo(0.5 / 3);
    expect(rec.get('NE')!.pct).toBe(0.5);
    expect(rec.get('MIA')!.streak).toBe('L1');
    expect(rec.get('BUF')!.streak).toBe('L1');
    expect(rec.get('KC')!.streak).toBe('W1');
    const long = buildRecords([1, 2, 3, 4, 5, 6, 7].map((w) => g(w, 'BUF', w === 3 ? 0 : 10, 'MIA', w === 3 ? 7 : 3)));
    expect(long.get('BUF')!.streak).toBe('W4');
    expect(long.get('BUF')!.last5).toEqual(['L', 'W', 'W', 'W', 'W']);
    expect(formatWlt({ w: 10, l: 6, t: 1 })).toBe('10-6-1');
    expect(formatPct(2 / 3, true)).toBe('.667');
    expect(formatPct(1, true)).toBe('1.000');
    expect(formatPct(0, false)).toBe('—');
  });
});

describe('tiebreaks (simplified)', () => {
  it('orders by win percentage first', () => {
    const rec = buildRecords([g(1, 'BUF', 10, 'MIA', 0), g(1, 'NE', 0, 'NYJ', 10), g(2, 'NYJ', 10, 'MIA', 0)]);
    expect(orderTeams(['MIA', 'NE', 'BUF', 'NYJ'], rec)).toEqual(['NYJ', 'BUF', 'NE', 'MIA']);
  });

  it('breaks a two-way tie by head-to-head before anything else', () => {
    // BUF and MIA both 1-1; MIA beat BUF. BUF has the better point differential, but head-to-head comes first.
    const rec = buildRecords([g(1, 'BUF', 3, 'MIA', 10), g(2, 'BUF', 50, 'NE', 0), g(2, 'MIA', 0, 'NYJ', 7), g(3, 'NE', 0, 'NYJ', 0)]);
    expect(rec.get('BUF')!.diff).toBeGreaterThan(rec.get('MIA')!.diff);
    expect(rec.get('BUF')!.pct).toBe(rec.get('MIA')!.pct);
    expect(orderTeams(['BUF', 'MIA'], rec)).toEqual(['MIA', 'BUF']);
  });

  it('uses division record when head-to-head did not decide and every team is in one division', () => {
    // KC and DEN never play each other; both 1-1; KC's win was in the division, DEN's win was out of it
    const rec = buildRecords([g(1, 'KC', 10, 'LV', 3), g(2, 'KC', 0, 'BUF', 9), g(1, 'DEN', 10, 'CHI', 3), g(2, 'DEN', 0, 'LAC', 9)]);
    // KC: W vs LV (division), L vs BUF; DEN: W vs CHI, L vs LAC (division) -> KC division 1-0, DEN 0-1
    expect(rec.get('KC')!.div).toEqual({ w: 1, l: 0, t: 0 });
    expect(rec.get('DEN')!.div).toEqual({ w: 0, l: 1, t: 0 });
    expect(orderTeams(['DEN', 'KC'], rec)).toEqual(['KC', 'DEN']);
  });

  it('falls to point differential across divisions, where division record means nothing', () => {
    const rec = buildRecords([g(1, 'KC', 10, 'LV', 3), g(1, 'BUF', 31, 'NYJ', 0), g(2, 'KC', 0, 'CHI', 9), g(2, 'BUF', 0, 'NE', 1)]);
    // KC 1-1 (+4... +7-9=-2), BUF 1-1 (+31-1=+30): different divisions, no head-to-head
    expect(orderTeams(['KC', 'BUF'], rec)).toEqual(['BUF', 'KC']);
  });

  it('is deterministic when everything is level (alphabetical by city), and re-runs the chain on a smaller group', () => {
    const none = buildRecords([]);
    expect(orderTeams(['NYJ', 'MIA', 'BUF', 'NE'], none)).toEqual(['BUF', 'MIA', 'NE', 'NYJ']);
    // a three-way tie where head-to-head splits one team off, then the other two go on to point differential
    const rec = buildRecords([
      g(1, 'BUF', 10, 'MIA', 0), g(2, 'BUF', 10, 'NE', 0), // BUF beats both
      g(3, 'MIA', 40, 'CHI', 0), g(3, 'NE', 7, 'DEN', 0), // MIA and NE each win once elsewhere
      g(4, 'KC', 10, 'BUF', 11), // keep BUF at 3-0 with MIA 1-1 NE 1-1
    ]);
    const order = orderTeams(['NE', 'MIA', 'BUF'], rec);
    expect(order[0]).toBe('BUF');
  });
});

describe('division tables and the playoff picture', () => {
  // AFC: each division gets a leader with a distinct record, then wild cards from the rest
  const mk = (): ResultGame[] => {
    const out: ResultGame[] = [];
    let w = 1;
    // wins over NFC teams so conference tables are only decided by records
    const beat = (winner: string, loser: string, n: number) => { for (let i = 0; i < n; i++) out.push(g(w++, winner, 21, loser, 7)); };
    beat('BUF', 'DAL', 6); beat('MIA', 'DAL', 5); beat('NE', 'DAL', 1);
    beat('BAL', 'NYG', 5); beat('PIT', 'NYG', 4); beat('CIN', 'NYG', 1);
    beat('HOU', 'PHI', 3); beat('JAX', 'PHI', 2);
    beat('KC', 'WAS', 4); beat('LAC', 'WAS', 3); beat('DEN', 'WAS', 3);
    return out;
  };
  const s = buildStandings(mk());

  it('ranks each division and keeps all 8 tables', () => {
    expect(s.divisions).toHaveLength(8);
    expect(s.started).toBe(true);
    const east = s.divisions.find((d) => d.conference === 'AFC' && d.division === 'East')!;
    expect(east.teams.map((t) => `${t.abbr}${t.rank}`)).toEqual(['BUF1', 'MIA2', 'NE3', 'NYJ4']);
    expect(buildStandings([]).started).toBe(false);
  });

  it('seeds the four division leaders by record, then three wild cards, "if the season ended today"', () => {
    const pic = playoffPicture(s, 'AFC');
    expect(pic.seeds.map((x) => x.team.abbr)).toEqual(['BUF', 'BAL', 'KC', 'HOU', 'MIA', 'PIT', 'DEN']);
    expect(pic.seeds.map((x) => x.kind)).toEqual(['division', 'division', 'division', 'division', 'wild card', 'wild card', 'wild card']);
    expect(pic.seeds.map((x) => x.seed)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('gives a division winner a better seed than a wild card with a better record, and counts games behind the last seed', () => {
    const pic = playoffPicture(s, 'AFC');
    // HOU leads the South at 3-0 and is the 4th seed; MIA (5-0) is a wild card even though its record is better
    expect(pic.seeds[3]!.team.abbr).toBe('HOU');
    expect(pic.seeds[4]!.team.w).toBeGreaterThan(pic.seeds[3]!.team.w);
    // DEN 3-0 is the 7th seed (level with LAC, and city order breaks the tie, since nothing else separates them); the hunt lists the next three
    expect(pic.hunt.map((h) => h.team.abbr)).toEqual(['LAC', 'JAX', 'CIN']);
    expect(pic.hunt[0]!.behind).toBe(0);
    expect(pic.hunt[1]!.behind).toBe(0.5);
  });

  it('builds the other conference from its own teams', () => {
    const pic = playoffPicture(s, 'NFC');
    expect(pic.seeds).toHaveLength(7);
    expect(new Set(pic.seeds.map((x) => x.team.conference))).toEqual(new Set(['NFC']));
  });
});

describe('time slots', () => {
  // Oct 18, 2026 is a Sunday. Eastern time is UTC-4 in October.
  const at = (iso: string) => Date.parse(iso);
  it('names the NFL’s own slots in Eastern time', () => {
    expect(timeSlot(at('2026-10-16T00:15:00Z')).label).toBe('thursday night');
    expect(timeSlot(at('2026-10-18T13:30:00Z')).label).toBe('sunday early'); // 9:30 am ET (London)
    expect(timeSlot(at('2026-10-18T17:00:00Z')).label).toBe('sunday early'); // 1:00 pm ET
    expect(timeSlot(at('2026-10-18T20:25:00Z')).label).toBe('sunday late'); // 4:25 pm ET
    expect(timeSlot(at('2026-10-19T00:20:00Z')).label).toBe('sunday night'); // 8:20 pm ET
    expect(timeSlot(at('2026-10-20T00:15:00Z')).label).toBe('monday night');
    expect(timeSlot(at('2026-11-26T17:30:00Z')).label).toBe('thursday afternoon'); // Thanksgiving, 12:30 pm ET
    expect(timeSlot(null).label).toBe('time to be set');
  });

  it('groups games in kickoff order, and a late-night kickoff in Los Angeles stays in the Eastern slot', () => {
    const games = [
      { id: 'c', kickoff: at('2026-10-20T00:15:00Z') }, { id: 'a', kickoff: at('2026-10-18T17:00:00Z') },
      { id: 'b', kickoff: at('2026-10-18T17:00:00Z') }, { id: 'd', kickoff: at('2026-10-16T00:15:00Z') },
      { id: 'e', kickoff: at('2026-10-18T20:05:00Z') },
    ];
    const groups = groupBySlot(games);
    expect(groups.map((x) => x.label)).toEqual(['thursday night', 'sunday early', 'sunday late', 'monday night']);
    expect(groups[1]!.games.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

const raw = (over: Partial<ScoreGame> & { metadata?: Record<string, unknown> } = {}): ScoreGame => ({
  game_id: 'g1', status: 'complete', start_time: 1_000,
  ...over,
  metadata: {
    home_team: 'ATL', away_team: 'CHI', home_score: 23, away_score: 31, quarter: 'F', time_remaining: '00:00', is_over: true, channel: 'FOX',
    home_record: '2-4-0', away_record: '4-2-0', stadium_details: { city: 'Atlanta' },
    home_score_quarter1: 0, home_score_quarter2: 7, home_score_quarter3: 0, home_score_quarter4: 16,
    away_score_quarter1: 14, away_score_quarter2: 7, away_score_quarter3: 7, away_score_quarter4: 3,
    ...over.metadata,
  },
});

describe('game rows', () => {
  it('adds the line score, channel, records and stadium city to the live engine’s game', () => {
    const [row] = parseGameRows([raw()], 6);
    expect(row).toMatchObject({ id: 'g1', week: 6, state: 'final', home: 'ATL', away: 'CHI', homeScore: 23, awayScore: 31, channel: 'FOX', stadiumCity: 'Atlanta', homeRecord: '2-4', awayRecord: '4-2' });
    expect(row!.line).toEqual({ labels: ['1', '2', '3', '4'], home: [0, 7, 0, 16], away: [14, 7, 7, 3] });
    expect(trimRecord('3-2-1')).toBe('3-2-1');
  });

  it('adds an overtime column, reads the half as two quarters, and drops quarters that do not add up', () => {
    const ot = parseGameRows([raw({ metadata: { quarter: 'F/OT', is_overtime: true, home_score: 26, away_score: 31, home_score_overtime: 3, away_score_overtime: 0 } })], 6)[0]!;
    expect(ot.line!.labels).toEqual(['1', '2', '3', '4', 'ot']);
    const half = parseGameRows([raw({ status: 'in_game', metadata: { quarter: 'HALF', is_over: false, is_in_progress: true, home_score: 7, away_score: 21 } })], 6)[0]!;
    expect(half.state).toBe('live');
    expect(half.line).toEqual({ labels: ['1', '2'], home: [0, 7], away: [14, 7] });
    const off = parseGameRows([raw({ metadata: { home_score: 24 } })], 6)[0]!;
    expect(off.line).toBeNull();
    expect(lineScore(off, null)).toBeNull();
  });

  it('has no line score before kickoff', () => {
    const [pre] = parseGameRows([raw({ status: 'pre_game', metadata: { quarter: '', is_over: false, home_score: undefined, away_score: undefined } })], 6);
    expect(pre).toMatchObject({ state: 'pre', homeScore: null, line: null });
  });

  it('lays the poller’s state over the feed, and keeps the feed’s own row whole when the two disagree about the score', () => {
    const base = parseGameRows([raw({ status: 'in_game', metadata: { quarter: '4', time_remaining: '5:00', is_over: false, is_in_progress: true } })], 6);
    expect(base[0]!.line).not.toBeNull();
    const [live] = base;
    // the same score, a later clock: the poller's clock is used and the quarters stay
    const same = overlayLive(base, [{ ...live!, clock: '4:00' }]);
    expect(same[0]).toMatchObject({ clock: '4:00', channel: 'FOX' });
    expect(same[0]!.line).not.toBeNull();
    // the poller has moved on (30 against 23): showing it beside quarters that add to 23 would contradict, so the feed's row stays whole
    const moved = overlayLive(base, [{ id: 'g1', home: 'ATL', away: 'CHI', kickoff: 1_000, state: 'live', quarter: '4', clock: '2:00', homeScore: 30, awayScore: 31, elapsed: 0.9 }]);
    expect(moved[0]).toMatchObject({ homeScore: 23, clock: '5:00' });
    expect(moved[0]!.line).not.toBeNull();
    // a game with no line score takes the poller's numbers
    const noLine = parseGameRows([raw({ status: 'in_game', metadata: { quarter: '4', home_score_quarter1: undefined, is_over: false } })], 6);
    expect(overlayLive(noLine, [{ id: 'g1', home: 'ATL', away: 'CHI', kickoff: 1_000, state: 'live', quarter: '4', clock: '2:00', homeScore: 30, awayScore: 31, elapsed: 0.9 }])[0]).toMatchObject({ homeScore: 30, clock: '2:00', channel: 'FOX', line: null });
  });
});

describe('the fantasy side of a game', () => {
  const file = {
    p1: { player_id: 'p1', first_name: 'Quinn', last_name: 'Arm', position: 'QB', team: 'KC', status: 'Active', active: true },
    p2: { player_id: 'p2', first_name: 'Rex', last_name: 'Run', position: 'RB', team: 'KC', status: 'Active', active: true },
    p3: { player_id: 'p3', first_name: 'Walt', last_name: 'Wide', position: 'WR', team: 'LAC', status: 'Active', active: true },
    p4: { player_id: 'p4', first_name: 'Free', last_name: 'Fran', position: 'WR', team: 'LAC', status: 'Active', active: true },
    p5: { player_id: 'p5', first_name: 'Big', last_name: 'Lineman', position: 'OL', team: 'KC', status: 'Active', active: true },
    p6: { player_id: 'p6', first_name: 'Old', last_name: 'Timer', position: 'WR', team: 'KC', status: 'Inactive', active: false },
    p7: { player_id: 'p7', first_name: 'Other', last_name: 'Team', position: 'WR', team: 'DEN', status: 'Active', active: true },
    p8: { player_id: 'p8', first_name: 'Quiet', last_name: 'Guy', position: 'TE', team: 'KC', status: 'Active', active: true },
    KC: { player_id: 'KC', first_name: 'Kansas City', last_name: 'Chiefs', position: 'DEF', team: 'KC', active: true },
  };
  const byTeam = indexByTeam(file as never);
  const teams = { 1: { name: 'icemen', manager: 'Sam' }, 2: { name: 'killa k', manager: 'Kim' } };
  const base = {
    home: 'KC', away: 'LAC', state: 'live' as const, byTeam, teams, meRid: 1,
    owners: new Map([['p1', 1], ['p2', 2], ['p3', 2], ['KC', 1]]),
    leaguePoints: { p1: 18.4, p2: 6.1, p3: 9 } as Record<string, number>,
    stats: { p4: { pts_ppr: 14.2 }, p8: { pts_ppr: 0 } } as Record<string, Record<string, number>>,
    score: (st: Record<string, number>) => st.pts_ppr ?? 0,
    mu: { p1: 20, p2: 12, p3: 11, p4: 7, p7: 30 },
  };

  it('keeps active players at fantasy positions on the two teams and drops the rest', () => {
    const d = gameDetail(base);
    const ids = d.players.map((p) => p.pid);
    expect(ids).toEqual(expect.arrayContaining(['p1', 'p2', 'p3', 'p4', 'KC']));
    for (const gone of ['p5', 'p6', 'p7']) expect(ids).not.toContain(gone);
    expect(indexByTeam(file as never, ['QB']).get('KC')!.map((c) => c.pid)).toEqual(['p1']);
  });

  it('joins owner, points and projection: league points when rostered, the scored stat line otherwise', () => {
    const d = gameDetail(base);
    const by = (pid: string) => d.players.find((p) => p.pid === pid)!;
    expect(by('p1')).toMatchObject({ points: 18.4, source: 'league', projection: 20, side: 'home', owner: { team: 'icemen', isMe: true } });
    expect(by('p2').owner).toMatchObject({ team: 'killa k', manager: 'Kim', isMe: false });
    expect(by('p4')).toMatchObject({ points: 14.2, source: 'stats', owner: null, side: 'away' });
    expect(by('KC')).toMatchObject({ name: 'kc d/st', owner: { isMe: true } });
  });

  it('splits mine, the rest of the league, the top scores and the waiver wire', () => {
    const d = gameDetail(base);
    expect(d.mine.map((p) => p.pid)).toEqual(['p1', 'KC']);
    expect(d.league.map((p) => p.pid)).toEqual(['p3', 'p2']);
    expect(d.top.map((p) => p.pid)).toEqual(['p1', 'p4', 'p3', 'p2']);
    expect(d.waiver.map((p) => p.pid)).toEqual(['p4']);
    expect(d.rankedBy).toBe('points');
  });

  it('shows no points before kickoff and ranks the waiver wire by projection; no projection after the game', () => {
    const pre = gameDetail({ ...base, state: 'pre' });
    expect(pre.players.every((p) => p.points === null)).toBe(true);
    expect(pre.rankedBy).toBe('projection');
    expect(pre.waiver.map((p) => p.pid)).toEqual(['p4']);
    expect(pre.top[0]!.pid).toBe('p1');
    const done = gameDetail({ ...base, state: 'final' });
    expect(done.players.every((p) => p.projection === null)).toBe(true);
  });

  it('still lists a rostered player who is not in the players file', () => {
    const d = gameDetail({ ...base, rostered: [{ pid: 'p9', name: 'Ghost', pos: 'WR', team: 'KC', injury: null }], owners: new Map([...base.owners, ['p9', 2]]) });
    expect(d.league.some((p) => p.pid === 'p9')).toBe(true);
  });
});
