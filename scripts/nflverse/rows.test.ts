// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fromArray, collect, flag, int, num, parseCsv, str } from './csv.ts';
import { isDropback, isPassAttempt, isRun, isTarget, toFtn, toParticipation, toPlay, toSnap, type Play } from './rows.ts';

const play = (o: Record<string, string>): Play => toPlay({ season_type: 'REG', posteam: 'KC', defteam: 'LA', game_id: 'g', play_id: '1', week: '1', ...o })!;

describe('csv cells', () => {
  it('blank and NA are missing; numbers and flags parse', () => {
    expect(num('')).toBeNull();
    expect(num('NA')).toBeNull();
    expect(num('-3.5')).toBe(-3.5);
    expect(num('x')).toBeNull();
    expect(int(undefined)).toBe(0);
    expect(flag('1')).toBe(true);
    expect(flag('TRUE')).toBe(true);
    expect(flag('0')).toBe(false);
    expect(flag('FALSE')).toBe(false);
    expect(str('')).toBeNull();
    expect(str('NA')).toBeNull();
    expect(str('KC')).toBe('KC');
  });
  it('parses quoted fields and collects through a mapper', async () => {
    const rows = parseCsv('a,b\n1,"x,y"\n2,"say ""hi"""\n');
    expect(rows).toEqual([{ a: '1', b: 'x,y' }, { a: '2', b: 'say "hi"' }]);
    expect(await collect(fromArray(rows), (r) => (r.a === '1' ? null : r.b))).toEqual(['say "hi"']);
  });
});

describe('play classification', () => {
  it('pass attempts exclude sacks, two-point tries and non-pass play types', () => {
    expect(isPassAttempt(play({ play_type: 'pass', pass_attempt: '1' }))).toBe(true);
    expect(isPassAttempt(play({ play_type: 'pass', pass_attempt: '1', sack: '1' }))).toBe(false);
    expect(isPassAttempt(play({ play_type: 'pass', pass_attempt: '1', two_point_attempt: '1' }))).toBe(false);
    expect(isPassAttempt(play({ play_type: 'no_play', pass_attempt: '1' }))).toBe(false);
    expect(isPassAttempt(play({ play_type: 'qb_spike', pass_attempt: '1' }))).toBe(false);
  });
  it('a target needs a receiver; a throwaway is a pass attempt but not a target', () => {
    expect(isTarget(play({ play_type: 'pass', pass_attempt: '1', receiver_player_id: '00-1' }))).toBe(true);
    expect(isTarget(play({ play_type: 'pass', pass_attempt: '1', receiver_player_id: '' }))).toBe(false);
  });
  it('runs include scrambles, exclude kneels and two-point tries', () => {
    expect(isRun(play({ play_type: 'run', rush_attempt: '1' }))).toBe(true);
    expect(isRun(play({ play_type: 'run', rush_attempt: '1', qb_scramble: '1' }))).toBe(true);
    expect(isRun(play({ play_type: 'qb_kneel', rush_attempt: '0' }))).toBe(false);
    expect(isRun(play({ play_type: 'run', rush_attempt: '1', two_point_attempt: '1' }))).toBe(false);
  });
  it('dropbacks are pass attempts, sacks and scrambles', () => {
    expect(isDropback(play({ play_type: 'pass', qb_dropback: '1', sack: '1', pass_attempt: '1' }))).toBe(true);
    expect(isDropback(play({ play_type: 'run', qb_dropback: '1', qb_scramble: '1', rush_attempt: '1' }))).toBe(true);
    expect(isDropback(play({ play_type: 'run', rush_attempt: '1' }))).toBe(false);
    expect(isDropback(play({ play_type: 'pass', qb_dropback: '1', two_point_attempt: '1' }))).toBe(false);
  });
  it('playoff rows and rows without an offense are dropped; LA becomes LAR', () => {
    expect(toPlay({ season_type: 'POST', posteam: 'KC' })).toBeNull();
    expect(toPlay({ season_type: 'REG', posteam: '' })).toBeNull();
    expect(play({}).opp).toBe('LAR');
  });
});

describe('FTN, snaps and participation rows', () => {
  it('FTN is keyed by game and play id', () => {
    const [k, f] = toFtn({ nflverse_game_id: '2026_01_A_B', nflverse_play_id: '41', n_blitzers: '2', n_pass_rushers: '6', n_defense_box: '7', is_play_action: 'TRUE' })!;
    expect(k).toBe('2026_01_A_B|41');
    expect(f).toMatchObject({ blitzers: 2, rushers: 6, box: 7, playAction: true, screen: false });
    expect(toFtn({ nflverse_game_id: '', nflverse_play_id: '' })).toBeNull();
  });
  it('snap rows: regular season only, team spelled the Sleeper way', () => {
    expect(toSnap({ game_type: 'POST', team: 'KC', pfr_player_id: 'x' })).toBeNull();
    expect(toSnap({ game_type: 'REG', team: 'LA', opponent: 'JAC', pfr_player_id: 'AbcdEf00', player: 'A B', position: 'WR', week: '3', offense_snaps: '44', game_id: 'g' }))
      .toMatchObject({ team: 'LAR', opp: 'JAX', snaps: 44, week: 3 });
  });
  it('participation: ids and positions aligned, man/zone and shell', () => {
    const p = toParticipation({ nflverse_game_id: 'g', play_id: '7', offense_players: 'a;b', offense_positions: 'WR;RB', defense_man_zone_type: 'MAN_COVERAGE', defense_coverage_type: 'COVER_1' })!;
    expect(p).toEqual({ gameId: 'g', playId: 7, off: ['a', 'b'], pos: ['WR', 'RB'], man: true, shell: 'COVER_1' });
    expect(toParticipation({ nflverse_game_id: 'g', play_id: '8', defense_man_zone_type: 'ZONE_COVERAGE' })!.man).toBe(false);
    expect(toParticipation({ nflverse_game_id: 'g', play_id: '9', defense_man_zone_type: '' })).toMatchObject({ man: null, shell: null, off: [] });
  });
});
