import { describe, expect, it } from 'vitest';
import {
  downSpoken, driveDirection, fieldLabel, fieldRole, fieldX, lineScore, parseDownText, parseScores, parseSituation, situationText, spotText, yardsFromOwnGoal, yardsToGoal,
} from './index';
import type { GameSituation } from './index';
import { game } from './test-helpers';

/** a feed row's metadata for a game in progress */
const meta = (o: Record<string, unknown>) => ({
  home_team: 'KC', away_team: 'LAC', quarter: '4', time_remaining: '14:52', possession: 'LAC', yard_line: 44, yard_line_territory: 'KC', down: 2,
  down_and_distance: '2nd & 7', red_zone: '', away_used_timeouts: 1, home_used_timeouts: 0, ...o,
});
const sit = (o: Record<string, unknown> = {}): GameSituation => parseSituation(meta(o))!;
const lacAtKc = { home: 'KC', away: 'LAC' };

describe('parsing the feed', () => {
  it('reads the live sample: LAC has the ball, 2nd and 7 at the KC 44', () => {
    expect(sit()).toEqual({
      possession: 'LAC', yardLine: 44, territory: 'KC', down: 2, distance: '7', downText: '2nd & 7', redZone: false, homeTimeouts: 3, awayTimeouts: 2,
    });
  });

  it('reads the down and distance text, including goal to go', () => {
    expect(parseDownText('2nd & 7')).toEqual({ down: 2, distance: '7' });
    expect(parseDownText('1st & Goal')).toEqual({ down: 1, distance: 'goal' });
    expect(parseDownText('')).toBeNull();
    expect(downSpoken(sit())).toBe('2nd and 7');
    expect(downSpoken(sit({ down_and_distance: '1st & Goal', down: 1 }))).toBe('1st and goal');
  });

  it('has nothing to say between plays, when the feed sends empty strings', () => {
    expect(parseSituation(meta({ possession: '', yard_line: '', yard_line_territory: '', down: '', down_and_distance: '', away_used_timeouts: undefined, home_used_timeouts: undefined }))).toBeNull();
    expect(parseSituation(null)).toBeNull();
  });

  it('keeps a possession with no spot (a kickoff return) and counts timeouts left, never below zero', () => {
    const s = sit({ yard_line: '', yard_line_territory: '', down_and_distance: '', down: '', home_used_timeouts: 5 });
    expect(s.possession).toBe('LAC');
    expect(s.yardLine).toBeNull();
    expect(s.homeTimeouts).toBe(0);
    expect(spotText(s)).toBe('');
    expect(situationText(s)).toBe('');
  });
});

describe('the yard mapping', () => {
  it('measures from the possession team’s own goal line: own territory counts up, the other half counts down from 100', () => {
    // LAC (the visitor) at its own 30 and at the KC 30; KC at its own 30 and at the LAC 30
    expect(yardsFromOwnGoal(sit({ possession: 'LAC', yard_line: 30, yard_line_territory: 'LAC' }))).toBe(30);
    expect(yardsFromOwnGoal(sit({ possession: 'LAC', yard_line: 30, yard_line_territory: 'KC' }))).toBe(70);
    expect(yardsFromOwnGoal(sit({ possession: 'KC', yard_line: 30, yard_line_territory: 'KC' }))).toBe(30);
    expect(yardsFromOwnGoal(sit({ possession: 'KC', yard_line: 30, yard_line_territory: 'LAC' }))).toBe(70);
    expect(yardsToGoal(sit({ possession: 'LAC', yard_line: 30, yard_line_territory: 'KC' }))).toBe(30);
  });

  it('puts midfield at 50 whichever territory the feed names, or none', () => {
    for (const territory of ['KC', 'LAC', '']) {
      const s = sit({ yard_line: 50, yard_line_territory: territory });
      expect(yardsFromOwnGoal(s)).toBe(50);
      expect(fieldX(s, lacAtKc)).toBe(50);
    }
    expect(spotText(sit({ yard_line: 50, yard_line_territory: '' }))).toBe('at midfield');
  });

  it('puts the goal line at the ends: one yard out is 99, and zero is the goal line itself', () => {
    expect(yardsFromOwnGoal(sit({ yard_line: 1, yard_line_territory: 'KC' }))).toBe(99);
    expect(yardsToGoal(sit({ yard_line: 1, yard_line_territory: 'KC' }))).toBe(1);
    expect(yardsFromOwnGoal(sit({ yard_line: 0, yard_line_territory: 'KC' }))).toBe(100);
    expect(yardsToGoal(sit({ yard_line: 0, yard_line_territory: 'KC' }))).toBe(0);
    expect(yardsFromOwnGoal(sit({ possession: 'LAC', yard_line: 0, yard_line_territory: 'LAC' }))).toBe(0);
  });

  it('cannot place a spot with no territory away from midfield', () => {
    expect(yardsFromOwnGoal(sit({ yard_line_territory: '' }))).toBeNull();
    expect(fieldX(sit({ yard_line_territory: '' }), lacAtKc)).toBeNull();
  });

  it('draws the away team on the left: its own yard line counts from the left edge, the home team’s from the right', () => {
    // away LAC's 44 is x = 44; home KC's 44 is x = 56 (44 yards from the right goal line)
    expect(fieldX(sit({ yard_line: 44, yard_line_territory: 'LAC' }), lacAtKc)).toBe(44);
    expect(fieldX(sit({ yard_line: 44, yard_line_territory: 'KC' }), lacAtKc)).toBe(56);
    // the goal lines: LAC's goal is x = 0, KC's is x = 100
    expect(fieldX(sit({ yard_line: 0, yard_line_territory: 'LAC' }), lacAtKc)).toBe(0);
    expect(fieldX(sit({ yard_line: 0, yard_line_territory: 'KC' }), lacAtKc)).toBe(100);
    expect(fieldX(sit({ yard_line: 1, yard_line_territory: 'KC' }), lacAtKc)).toBe(99);
  });

  it('points the offense at the far goal line: the visitor goes right, the home team goes left', () => {
    expect(driveDirection('LAC', lacAtKc)).toBe('right');
    expect(driveDirection('KC', lacAtKc)).toBe('left');
    expect(driveDirection(null, lacAtKc)).toBeNull();
    expect(driveDirection('DEN', lacAtKc)).toBeNull();
  });

  it('is in the red zone inside the 20 of the goal it attacks (either team), or when the feed says so', () => {
    expect(sit({ possession: 'LAC', yard_line: 20, yard_line_territory: 'KC' }).redZone).toBe(true);
    expect(sit({ possession: 'LAC', yard_line: 21, yard_line_territory: 'KC' }).redZone).toBe(false);
    expect(sit({ possession: 'KC', yard_line: 12, yard_line_territory: 'LAC' }).redZone).toBe(true);
    // the same yard line is not the red zone for the team that is backed up against its own goal
    expect(sit({ possession: 'KC', yard_line: 12, yard_line_territory: 'KC' }).redZone).toBe(false);
    expect(sit({ red_zone: 'LAC', yard_line: 40, yard_line_territory: 'LAC' }).redZone).toBe(true);
  });
});

describe('offense or defense', () => {
  it('a skill player is on offense while his team has the ball, and off the field while it does not', () => {
    expect(fieldRole('QB', 'LAC', 'LAC')).toEqual({ unit: 'offense', onField: true, label: 'on offense' });
    expect(fieldRole('WR', 'KC', 'LAC')).toEqual({ unit: 'offense', onField: false, label: 'off the field' });
  });

  it('a team defense is the reverse: on defense while the other team has the ball', () => {
    expect(fieldRole('DEF', 'KC', 'LAC')).toEqual({ unit: 'defense', onField: true, label: 'on defense' });
    expect(fieldRole('DEF', 'LAC', 'LAC')).toEqual({ unit: 'defense', onField: false, label: 'off the field' });
  });

  it('a kicker counts with the offense', () => {
    expect(fieldRole('K', 'LAC', 'LAC')?.label).toBe('on offense');
    expect(fieldRole('K', 'KC', 'LAC')?.onField).toBe(false);
  });

  it('says nothing without a team or a possession', () => {
    expect(fieldRole('QB', 'LAC', null)).toBeNull();
    expect(fieldRole('QB', null, 'LAC')).toBeNull();
  });
});

describe('the words', () => {
  it('writes the situation line and the accessible label of the mini field', () => {
    expect(situationText(sit())).toBe('2nd & 7 · at kc 44');
    expect(fieldLabel(lacAtKc, sit())).toBe('lac on offense, 2nd and 7 at the kc 44');
  });

  it('says midfield, goal to go and the red zone', () => {
    expect(fieldLabel(lacAtKc, sit({ yard_line: 50, yard_line_territory: '' }))).toBe('lac on offense, 2nd and 7 at midfield');
    expect(fieldLabel(lacAtKc, sit({ yard_line: 4, down_and_distance: '1st & Goal', down: 1 }))).toBe('lac on offense, 1st and goal at the kc 4, red zone');
    expect(fieldLabel(lacAtKc, sit({ possession: 'KC', yard_line: 30, yard_line_territory: 'LAC', down_and_distance: '3rd & 2', down: 3 }))).toBe('kc on offense, 3rd and 2 at the lac 30');
  });

  it('says there is no ball position when the feed has none', () => {
    expect(fieldLabel(lacAtKc, null)).toBe('lac at kc, no ball position right now');
    expect(fieldLabel(lacAtKc, sit({ possession: '' }))).toBe('lac at kc, no ball position right now');
  });
});

describe('situations on parsed games', () => {
  const row = (state: string, m: Record<string, unknown>) => ({ game_id: 'g', status: state, start_time: 1_000_000, metadata: meta(m) });

  it('attaches the situation to a game in progress, and not to one that is over or has not started', () => {
    const [live] = parseScores([row('in_game', {})]);
    expect(live!.situation?.downText).toBe('2nd & 7');
    expect(parseScores([row('complete', { quarter: 'F' })])[0]!.situation).toBeUndefined();
    expect(parseScores([row('pre_game', { quarter: '' })])[0]!.situation).toBeUndefined();
  });
});

describe('the quarters', () => {
  const live = game({ home: 'KC', away: 'LAC', state: 'live', quarter: '3', clock: '4:00', homeScore: 19, awayScore: 6, elapsed: 0.6 });
  const quarters = { home_score_quarter1: 3, home_score_quarter2: 10, home_score_quarter3: 6, home_score_quarter4: 0, away_score_quarter1: 0, away_score_quarter2: 6, away_score_quarter3: 0, away_score_quarter4: 0 };

  it('lists the quarters played so far, when they add up to the score', () => {
    expect(lineScore(live, quarters)).toEqual({ labels: ['1', '2', '3'], home: [3, 10, 6], away: [0, 6, 0] });
  });

  it('adds overtime to a final game that went to it', () => {
    const final = game({ home: 'KC', away: 'LAC', state: 'final', quarter: 'F/OT', homeScore: 22, awayScore: 22 });
    const m = { ...quarters, home_score_quarter1: 7, home_score_quarter2: 3, home_score_quarter3: 6, home_score_quarter4: 6, away_score_quarter1: 3, away_score_quarter2: 6, away_score_quarter3: 7, away_score_quarter4: 6, home_score_overtime: 0, away_score_overtime: 0, is_overtime: true };
    expect(lineScore(final, m)?.labels).toEqual(['1', '2', '3', '4', 'ot']);
  });

  it('shows nothing when the quarters disagree with the score, or before kickoff', () => {
    expect(lineScore({ ...live, homeScore: 20 }, quarters)).toBeNull();
    expect(lineScore(game({ home: 'KC', away: 'LAC' }), quarters)).toBeNull();
  });

  it('puts the quarters on a parsed game, at halftime too', () => {
    const half = parseScores([{ game_id: 'g', status: 'in_game', start_time: 1, metadata: meta({ quarter: 'HALF', home_score: 13, away_score: 6, ...quarters }) }])[0]!;
    expect(half.line).toEqual({ labels: ['1', '2'], home: [3, 10], away: [0, 6] });
  });
});
