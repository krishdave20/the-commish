import { describe, expect, it } from 'vitest';
import { buildView, moved, standingsLine, standingsMoves, storylines } from './index';
import type { StandingTeam, StandingsMove, StoryKind, WeekResult } from './index';
import type { HistoryRow } from '../types';
import { ctx, games, snapshot } from './test-helpers';

const kinds = (xs: Array<{ kind: StoryKind }>) => xs.map((s) => s.kind);

/** Week 6 over: icemen (team 1) lose to killa k by 9 with a 22-point wideout on the bench; third and long crush hail mary. */
const pts = { q1: 10, r1: 5, w1: 6, b1: 22, q2: 20, r2: 5, w2: 5, q3: 40, r3: 30, w3: 20, q4: 5, r4: 5, w4: 5 };

function finalWeek(over: Partial<Parameters<typeof ctx>[0]> = {}, points: Record<string, number> = pts) {
  const c = ctx(over);
  const view = buildView(c, snapshot(points, games('final')));
  return { c, view };
}

describe('storylines on a finished week', () => {
  const { c, view } = finalWeek();
  const stories = storylines({ view, ctx: c, past: true, playoffTeams: 2 });
  const by = (k: StoryKind) => stories.find((s) => s.kind === k)!;

  it('names the highest score with its number', () => {
    expect(by('high score').headline).toBe('90.0');
    expect(by('high score').text).toBe('third and long has the highest score of the week.');
  });

  it('names the closest finish from the matchups that are over', () => {
    expect(by('closest').headline).toBe('9.0');
    expect(by('closest').text).toBe('killa k beat icemen by 9.0.');
  });

  it('names the player of the week', () => {
    expect(by('player').headline).toBe('40.0');
    expect(by('player').text).toBe('tom thrower (qb) scored the most for third and long.');
    expect(by('player').label).toBe('player of the week');
  });

  it('finds the heartbreaker: a loss the bench would have won, by the margin and the points left', () => {
    // icemen lost by 9.0 and left 16.0 on the bench: the 22-point wideout in for the 6-point one
    expect(by('heartbreaker').text).toBe('icemen lost to killa k by 9.0 and left 16.0 on the bench (backup wideout sat for 22.0).');
  });

  it('finds the bench blunder: the most points left on the sideline', () => {
    expect(by('blunder').headline).toBe('16.0');
    expect(by('blunder').text).toBe('icemen left 16.0 on the bench: backup wideout sat for 22.0.');
  });

  it('has no comeback when nobody was an underdog that won', () => {
    expect(kinds(stories)).not.toContain('comeback');
  });

  it('gives each story the matchup it is about', () => {
    expect(by('high score').matchupId).toBe(2);
    expect(by('heartbreaker').matchupId).toBe(1);
  });

  it('does not call a loss a heartbreaker when the bench would not have saved it', () => {
    const { c: c2, view: v2 } = finalWeek({}, { ...pts, b1: 3 });
    expect(kinds(storylines({ view: v2, ctx: c2, past: true, playoffTeams: 2 }))).not.toContain('heartbreaker');
  });
});

describe('storylines on a week in progress', () => {
  it('says "so far", and only calls a finish what is over', () => {
    const c = ctx();
    const view = buildView(c, snapshot({ q1: 10, r1: 5, w1: 6, q2: 4, r2: 3, w2: 2 }, games('live', 0.5)));
    const stories = storylines({ view, ctx: c, past: false, playoffTeams: 2 });
    expect(stories.find((s) => s.kind === 'high score')!.text).toBe('icemen has the highest score of the week so far.');
    expect(stories.find((s) => s.kind === 'player')!.label).toBe('player of the week so far');
    expect(kinds(stories)).not.toContain('closest');
  });

  it('has nothing to say before anyone has scored', () => {
    const c = ctx();
    expect(storylines({ view: buildView(c, snapshot({}, games('pre'))), ctx: c, past: false, playoffTeams: 2 })).toEqual([]);
  });
});

describe('the biggest comeback', () => {
  // icemen's lineup is expected to score 15; killa k's 46: icemen were about a 14% shot, and went on to win by 75
  const weak = { mu: { q1: 5, r1: 5, w1: 5, q2: 19, r2: 14, w2: 13, q3: 17, r3: 13, w3: 10, q4: 15, r4: 10, w4: 8, b1: 6, b3: 9 } };
  const won = { q1: 40, r1: 30, w1: 20, q2: 5, r2: 5, w2: 5, q3: 20, r3: 10, w3: 10, q4: 20, r4: 10, w4: 10 };

  it('is the underdog that won, from its win chance before kickoff', () => {
    const { c, view } = finalWeek(weak, won);
    const s = storylines({ view, ctx: c, past: true, playoffTeams: 2 }).find((x) => x.kind === 'comeback')!;
    expect(s.text).toMatch(/^icemen had \d+% to win before kickoff and won\.$/);
    expect(s.headline).toMatch(/^\d+% → 100%$/);
    expect(s.matchupId).toBe(1);
  });

  it('can come from a swing between polls: a team that fell to 20% and is now ahead', () => {
    const c = ctx();
    // two frames of the same week: early, icemen trail by a lot with the games half over; now they lead
    const early = snapshot({ q1: 2, r1: 1, w1: 0, q2: 30, r2: 20, w2: 20 }, games('live', 0.8), { at: 1, clock: 1 });
    const now = snapshot({ q1: 40, r1: 30, w1: 20, q2: 30, r2: 20, w2: 20 }, games('live', 0.8), { at: 2, clock: 2 });
    const view = buildView(c, now);
    const s = storylines({ view, ctx: c, frames: [early, now], past: false, playoffTeams: 2 }).find((x) => x.kind === 'comeback')!;
    expect(s.text).toMatch(/^icemen was down to \d+% to win and is back up to \d+%\.$/);
  });
});

/* ---------- standings ---------- */

const teams: StandingTeam[] = [1, 2, 3, 4].map((rid) => ({ rid, name: `team ${rid}`, divId: rid, isMe: rid === 1 }));
const row = (week: number, rid: number, opp: number, pts: number, oppPts: number, final = true): HistoryRow => ({ key: `${week}-${rid}`, week, rid, opp, pts, oppPts, final });
// week 1: 1 beat 2 (100-90) and 3 beat 4 (80-70)
const history = [row(1, 1, 2, 100, 90), row(1, 2, 1, 90, 100), row(1, 3, 4, 80, 70), row(1, 4, 3, 70, 80)];
const rules = { playoffTeams: 2, divisions: 0 };
// week 2: team 4 beats team 1 (95-60) and team 3 beats team 2 (100-50)
const results: WeekResult[] = [{ a: 1, b: 4, ptsA: 60, ptsB: 95 }, { a: 3, b: 2, ptsA: 100, ptsB: 50 }];

describe('who moves in the standings', () => {
  const moves = standingsMoves({ teams, history, week: 2, lastRegularWeek: 14, results, rules });
  const of = (rid: number): StandingsMove => moves.find((m) => m.rid === rid)!;

  it('ranks the table before the week from the finished weeks, and after it with the week’s results', () => {
    expect(moves.map((m) => m.rid)).toEqual([3, 4, 1, 2]);
    expect(of(1).before).toEqual({ rank: 1, wins: 1, losses: 0, ties: 0 });
    expect(of(1).after).toEqual({ rank: 3, wins: 1, losses: 1, ties: 0 });
    expect(of(4).after).toEqual({ rank: 2, wins: 1, losses: 1, ties: 0 });
    expect(of(3).after.wins).toBe(2);
  });

  it('breaks a tie in the record by points for', () => {
    // 4 and 1 are both 1-1: team 4 has 165 points for, team 1 160
    expect(of(4).after.rank).toBeLessThan(of(1).after.rank);
  });

  it('marks who crosses the playoff line (the top 2 here), and by how many places', () => {
    expect(of(4).line).toBe('in');
    expect(of(4).delta).toBe(2);
    expect(of(1).line).toBe('out');
    expect(of(1).delta).toBe(-2);
    expect(of(3).line).toBeNull();
    expect(of(3).delta).toBe(1);
    expect(of(3).inAfter).toBe(true);
    expect(of(2).inAfter).toBe(false);
  });

  it('keeps each team’s result in the week', () => {
    expect(of(4).result).toBe('W');
    expect(of(1).result).toBe('L');
  });

  it('lists only the teams that moved, and writes the line', () => {
    expect(moved(moves).map((m) => m.rid).sort()).toEqual([1, 2, 3, 4]);
    expect(standingsLine(moves, 2, false)).toEqual({ headline: '4 teams move', text: 'if the results hold, team 4 moves into playoff position (top 2); team 1 falls out.' });
    expect(standingsLine(moves, 2, true)!.text).toBe('team 4 moves into playoff position (top 2); team 1 falls out.');
  });

  it('says nothing when nobody changes places', () => {
    const same = standingsMoves({ teams, history, week: 2, lastRegularWeek: 14, results: [{ a: 1, b: 2, ptsA: 100, ptsB: 90 }, { a: 3, b: 4, ptsA: 80, ptsB: 70 }], rules });
    expect(moved(same)).toEqual([]);
    expect(standingsLine(same, 2, false)).toBeNull();
  });

  it('counts a tie as half a win and ignores unfinished weeks and playoff weeks', () => {
    const tie = standingsMoves({ teams, history: [...history, row(2, 1, 2, 5, 5, false)], week: 2, lastRegularWeek: 14, results: [{ a: 1, b: 2, ptsA: 70, ptsB: 70 }], rules });
    expect(tie.find((m) => m.rid === 1)!.after).toMatchObject({ wins: 1, ties: 1 });
    expect(tie.find((m) => m.rid === 1)!.before.ties).toBe(0);
    expect(standingsMoves({ teams, history, week: 15, lastRegularWeek: 14, results, rules })).toEqual([]);
  });

  it('puts division winners first when the league has divisions', () => {
    const div = teams.map((t) => ({ ...t, divId: t.rid <= 2 ? 1 : 2 }));
    const out = standingsMoves({ teams: div, history, week: 2, lastRegularWeek: 14, results: [], rules: { playoffTeams: 2, divisions: 2 } });
    // team 1 (1-0) wins division 1 and team 3 (1-0) division 2: they are the top two
    expect(out.slice(0, 2).map((m) => m.rid).sort()).toEqual([1, 3]);
  });

  it('feeds the standings story into the storylines', () => {
    const c = ctx();
    const view = buildView(c, snapshot(pts, games('final')));
    const s = storylines({ view, ctx: c, moves, past: true, playoffTeams: 2 }).find((x) => x.kind === 'standings')!;
    expect(s.label).toBe('who moved');
    expect(s.text).toContain('team 4 moves into playoff position');
  });
});
