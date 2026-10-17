// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { lastName, methodCounts, normalizeName, normalizeTeam, pfrToGsis, posGroup, resolveIds, snapKey, type NvPlayer, type SleeperCand } from './ids.ts';

const nv = (o: Partial<NvPlayer> & { key: string; name: string }): NvPlayer =>
  ({ gsis: null, pfr: null, espn: null, team: null, pos: null, birth: null, ...o });
const sl = (o: Partial<SleeperCand> & { id: string; name: string }): SleeperCand =>
  ({ gsis: null, espn: null, team: null, positions: [], birth: null, active: true, ...o });

describe('normalizeName', () => {
  it('folds case, periods, apostrophes, hyphens and accents', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarrchase');
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonrastbrown');
    expect(normalizeName('Josh Pérez')).toBe('joshuaperez');
    expect(normalizeName("  D'Andre   Swift ")).toBe('dandreswift');
  });
  it('treats D.J. and DJ as the same name', () => {
    expect(normalizeName('D.J. Moore')).toBe(normalizeName('DJ Moore'));
    expect(normalizeName('D.K. Metcalf')).toBe(normalizeName('DK Metcalf'));
    expect(normalizeName('A.J. Brown')).toBe(normalizeName('AJ Brown'));
  });
  it('drops Jr., Sr., II, III, IV, V', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe(normalizeName('Marvin Harrison'));
    expect(normalizeName('Kenneth Walker III')).toBe(normalizeName('Kenneth Walker'));
    expect(normalizeName('Michael Pittman Jr')).toBe(normalizeName('Michael Pittman'));
    expect(normalizeName('Odell Beckham Sr.')).toBe('odellbeckham');
    // a one-word name that looks like a suffix is kept
    expect(normalizeName('V')).toBe('v');
  });
  it('maps common first-name nicknames', () => {
    expect(normalizeName('Mike Evans')).toBe(normalizeName('Michael Evans'));
    expect(normalizeName('Chris Olave')).toBe(normalizeName('Christopher Olave'));
    expect(normalizeName('Josh Jacobs')).toBe(normalizeName('Joshua Jacobs'));
    expect(normalizeName('Zach Charbonnet')).toBe(normalizeName('Zachary Charbonnet'));
    // only the first word
    expect(normalizeName('Sam Mike')).toBe('samuelmike');
  });
  it('handles empty input', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName('')).toBe('');
  });
});

describe('lastName', () => {
  it('is the last word, without suffix, split on hyphens', () => {
    expect(lastName('Amon-Ra St. Brown')).toBe('brown');
    expect(lastName('Jaxon Smith-Njigba')).toBe('njigba');
    expect(lastName('Marvin Harrison Jr.')).toBe('harrison');
    expect(lastName("Ja'Marr Chase")).toBe('chase');
    expect(lastName('')).toBe('');
  });
});

describe('teams and positions', () => {
  it('uses Sleeper spellings', () => {
    expect(normalizeTeam('LA')).toBe('LAR');
    expect(normalizeTeam('LAR')).toBe('LAR');
    expect(normalizeTeam('jac')).toBe('JAX');
    expect(normalizeTeam('WSH')).toBe('WAS');
    expect(normalizeTeam('OAK')).toBe('LV');
    expect(normalizeTeam('KC')).toBe('KC');
    expect(normalizeTeam('FA')).toBeNull();
    expect(normalizeTeam(null)).toBeNull();
  });
  it('groups positions', () => {
    expect(posGroup('HB')).toBe('RB');
    expect(posGroup('FB')).toBe('RB');
    expect(posGroup('wr')).toBe('WR');
    expect(posGroup('T')).toBeNull();
    expect(posGroup(null)).toBeNull();
  });
});

describe('snap counts: pfr_player_id to gsis_id', () => {
  it('goes through players.csv and falls back to a pfr: key', () => {
    const m = pfrToGsis([{ pfr: 'WarrJa00', gsis: '00-0001' }, { pfr: 'NoGsis00', gsis: null }, { pfr: null, gsis: '00-0009' }]);
    expect(snapKey('WarrJa00', m)).toBe('00-0001');
    expect(snapKey('NoGsis00', m)).toBe('pfr:NoGsis00');
    expect(snapKey('Other00', m)).toBe('pfr:Other00');
  });
  it('drops a pfr_id that maps to two different gsis_ids', () => {
    const m = pfrToGsis([{ pfr: 'X', gsis: 'a' }, { pfr: 'X', gsis: 'b' }, { pfr: 'Y', gsis: 'c' }, { pfr: 'Y', gsis: 'c' }]);
    expect(m.has('X')).toBe(false);
    expect(m.get('Y')).toBe('c');
  });
});

describe('resolveIds', () => {
  it('tier 1: gsis_id on both sides, even when names and teams disagree', () => {
    const r = resolveIds(
      [nv({ key: '00-1', gsis: '00-1', name: 'Marquise Brown', team: 'KC', pos: 'WR' })],
      [sl({ id: 'S1', gsis: '00-1', name: 'Hollywood Brown', team: 'PHI', positions: ['WR'] })],
    );
    expect(r.byNv.get('00-1')).toEqual({ sleeperId: 'S1', nvKey: '00-1', method: 'gsis' });
    expect(r.bySleeper.get('S1')!.method).toBe('gsis');
  });

  it('refuses a gsis/espn match whose last names differ (swapped Sleeper ids) and falls through to the name tiers', () => {
    const r = resolveIds(
      [nv({ key: '00-34270', gsis: '00-34270', espn: '3915486', name: 'Tyler Conklin', team: 'DET', pos: 'TE' })],
      [
        // Sleeper's two records carry each other's gsis_id
        sl({ id: '5094', gsis: '00-34270', espn: '3915486', name: 'Ryan Izzo', positions: ['TE'], active: true }),
        sl({ id: '5133', gsis: '00-34439', espn: '3122920', name: 'Tyler Conklin', team: 'DET', positions: ['TE'] }),
      ],
    );
    expect(r.byNv.get('00-34270')).toEqual({ sleeperId: '5133', nvKey: '00-34270', method: 'name_team_pos' });
    expect(r.conflicts).toEqual([{ nvKey: '00-34270', sleeperId: '5094', method: 'gsis' }]);
  });

  it('a nickname or suffix difference is not a last-name conflict', () => {
    const r = resolveIds(
      [nv({ key: 'a', gsis: 'a', name: 'Marvin Harrison', team: 'ARI', pos: 'WR' })],
      [sl({ id: 'S1', gsis: 'a', name: 'Marvin Harrison Jr.', team: 'ARI', positions: ['WR'] })],
    );
    expect(r.byNv.get('a')!.method).toBe('gsis');
    expect(r.conflicts).toEqual([]);
  });

  it('tier 2: espn_id when Sleeper has no gsis_id (number vs string)', () => {
    const r = resolveIds(
      [nv({ key: '00-2', gsis: '00-2', espn: '4429202', name: 'Israel Abanikanda', team: 'DAL', pos: 'RB' })],
      [sl({ id: 'S2', espn: '4429202', name: 'Izzy Abanikanda', team: 'DAL', positions: ['RB'] })],
    );
    expect(r.byNv.get('00-2')!.method).toBe('espn');
    const r2 = resolveIds(
      [nv({ key: '00-2', gsis: '00-2', espn: '4429202', name: 'Israel Abanikanda', pos: 'RB' })],
      [sl({ id: 'S2', espn: 4429202 as unknown as string, name: 'Izzy Abanikanda', positions: ['RB'] })],
    );
    expect(r2.byNv.get('00-2')!.method).toBe('espn');
  });

  it('tier 3: normalized name + team + position (Jr., periods, D.J./DJ, apostrophes)', () => {
    const r = resolveIds(
      [
        nv({ key: 'a', gsis: 'a', name: 'Marvin Harrison', team: 'ARI', pos: 'WR' }),
        nv({ key: 'b', gsis: 'b', name: 'D.J. Moore', team: 'CHI', pos: 'WR' }),
        nv({ key: 'c', gsis: 'c', name: "Ja'Marr Chase", team: 'CIN', pos: 'WR' }),
        nv({ key: 'd', gsis: 'd', name: 'Jaylen Warren', team: 'PIT', pos: 'HB' }),
      ],
      [
        sl({ id: 'S1', name: 'Marvin Harrison Jr.', team: 'ARI', positions: ['WR'] }),
        sl({ id: 'S2', name: 'DJ Moore', team: 'CHI', positions: ['WR'] }),
        sl({ id: 'S3', name: 'JaMarr Chase', team: 'CIN', positions: ['WR'] }),
        sl({ id: 'S4', name: 'Jaylen Warren', team: 'PIT', positions: ['RB'] }),
      ],
    );
    expect([...r.byNv.values()].map((m) => [m.nvKey, m.sleeperId, m.method])).toEqual([
      ['a', 'S1', 'name_team_pos'], ['b', 'S2', 'name_team_pos'], ['c', 'S3', 'name_team_pos'], ['d', 'S4', 'name_team_pos'],
    ]);
    expect(r.unmatched.size).toBe(0);
  });

  it('team and position disambiguate two players with one name', () => {
    const r = resolveIds(
      [
        nv({ key: 'wr', gsis: 'wr', name: 'Mike Williams', team: 'PIT', pos: 'WR' }),
        nv({ key: 'rb', gsis: 'rb', name: 'Michael Williams', team: 'NE', pos: 'RB' }),
      ],
      [
        sl({ id: 'S-wr', name: 'Mike Williams', team: 'PIT', positions: ['WR'] }),
        sl({ id: 'S-rb', name: 'Mike Williams', team: 'NE', positions: ['RB'] }),
        sl({ id: 'S-old', name: 'Mike Williams', team: null, positions: ['WR'], active: false }),
      ],
    );
    expect(r.byNv.get('wr')!.sleeperId).toBe('S-wr');
    expect(r.byNv.get('rb')!.sleeperId).toBe('S-rb');
  });

  it('an ambiguous name stays unmatched, never guessed (two Sleeper candidates)', () => {
    const r = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Josh Smith', team: 'DAL', pos: 'WR' })],
      [
        sl({ id: 'S1', name: 'Josh Smith', team: 'DAL', positions: ['WR'] }),
        sl({ id: 'S2', name: 'Joshua Smith', team: 'DAL', positions: ['WR'] }),
      ],
    );
    expect(r.byNv.size).toBe(0);
    expect(r.unmatched.get('x')!.reason).toBe('ambiguous');
    expect(r.unmatched.get('x')!.candidates).toHaveLength(2);
  });

  it('an ambiguous name stays unmatched (two nflverse players, one Sleeper candidate)', () => {
    const r = resolveIds(
      [
        nv({ key: 'x', gsis: 'x', name: 'Josh Smith', team: 'DAL', pos: 'WR' }),
        nv({ key: 'y', gsis: 'y', name: 'Joshua Smith', team: 'DAL', pos: 'WR' }),
      ],
      [sl({ id: 'S1', name: 'Josh Smith', team: 'DAL', positions: ['WR'] })],
    );
    expect(r.byNv.size).toBe(0);
    expect(r.unmatched.get('x')!.reason).toBe('ambiguous');
    expect(r.unmatched.get('y')!.reason).toBe('ambiguous');
  });

  it('birth dates can break a tie between same-name, same-team players', () => {
    const r = resolveIds(
      [
        nv({ key: 'x', gsis: 'x', name: 'Josh Smith', team: 'DAL', pos: 'WR', birth: '1999-01-01' }),
        nv({ key: 'y', gsis: 'y', name: 'Josh Smith', team: 'DAL', pos: 'WR', birth: '2001-02-02' }),
      ],
      [
        sl({ id: 'S1', name: 'Josh Smith', team: 'DAL', positions: ['WR'], birth: '2001-02-02' }),
        sl({ id: 'S2', name: 'Josh Smith', team: 'DAL', positions: ['WR'], birth: '1999-01-01' }),
      ],
    );
    expect(r.byNv.get('x')!.sleeperId).toBe('S2');
    expect(r.byNv.get('y')!.sleeperId).toBe('S1');
  });

  it('a position mismatch is not matched', () => {
    const r = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Sam Howell', team: 'SEA', pos: 'QB' })],
      [sl({ id: 'S1', name: 'Sam Howell', team: 'SEA', positions: ['WR'] })],
    );
    expect(r.byNv.size).toBe(0);
    expect(r.unmatched.get('x')!.reason).toBe('no_candidate');
  });

  it('tier 4: a traded player matches on name + position when birth dates agree', () => {
    const r = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Davante Adams', team: 'LA', pos: 'WR', birth: '1992-12-24' })],
      [sl({ id: 'S1', name: 'Davante Adams', team: 'NYJ', positions: ['WR'], birth: '1992-12-24' })],
    );
    expect(r.byNv.get('x')!.method).toBe('name_pos');
  });

  it('tier 4 refuses when the team differs and birth dates are unknown or different', () => {
    const unknown = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Davante Adams', team: 'LA', pos: 'WR' })],
      [sl({ id: 'S1', name: 'Davante Adams', team: 'NYJ', positions: ['WR'], birth: '1992-12-24' })],
    );
    expect(unknown.byNv.size).toBe(0);
    expect(unknown.unmatched.get('x')!.reason).toBe('team_mismatch');
    const differ = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Mike Williams', team: 'LA', pos: 'WR', birth: '1994-10-04' })],
      [sl({ id: 'S1', name: 'Mike Williams', team: 'NYJ', positions: ['WR'], birth: '1999-01-01' })],
    );
    expect(differ.byNv.size).toBe(0);
    expect(differ.unmatched.get('x')!.reason).toBe('team_mismatch');
  });

  it('LA (nflverse) equals LAR (Sleeper) in the team check', () => {
    const r = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Puka Nacua', team: 'LA', pos: 'WR' })],
      [sl({ id: 'S1', name: 'Puka Nacua', team: 'LAR', positions: ['WR'] })],
    );
    expect(r.byNv.get('x')!.method).toBe('name_team_pos');
  });

  it('a snap-only player (pfr key, no gsis) can still match by name', () => {
    const r = resolveIds(
      [nv({ key: 'pfr:RookCo00', pfr: 'RookCo00', gsis: null, name: 'Cody Rookie', team: 'DEN', pos: 'WR' })],
      [sl({ id: 'S9', name: 'Cody Rookie', team: 'DEN', positions: ['WR'] })],
    );
    expect(r.byNv.get('pfr:RookCo00')!.sleeperId).toBe('S9');
  });

  it('earlier tiers win and a Sleeper player is claimed once; duplicate Sleeper records prefer the active one', () => {
    const r = resolveIds(
      [nv({ key: 'x', gsis: 'x', name: 'Jaylen Warren', team: 'PIT', pos: 'RB' })],
      [
        sl({ id: 'old', gsis: 'x', name: 'Jaylen Warren', team: null, positions: ['RB'], active: false }),
        sl({ id: 'new', gsis: 'x', name: 'Jaylen Warren', team: 'PIT', positions: ['RB'], active: true }),
      ],
    );
    expect(r.byNv.get('x')!.sleeperId).toBe('new');
    expect(r.bySleeper.has('old')).toBe(false);
  });

  it('two nflverse rows sharing an espn_id: the second is a duplicate, not a second match', () => {
    const r = resolveIds(
      [
        nv({ key: 'a', gsis: 'a', espn: '77', name: 'Same Guy', pos: 'WR' }),
        nv({ key: 'b', gsis: 'b', espn: '77', name: 'Same Guy', pos: 'WR' }),
      ],
      [sl({ id: 'S1', espn: '77', name: 'Same Guy', positions: ['WR'] })],
    );
    expect(r.bySleeper.get('S1')!.nvKey).toBe('a');
    expect(r.unmatched.get('b')!.reason).toBe('duplicate');
  });

  it('counts matches per method', () => {
    const r = resolveIds(
      [
        nv({ key: 'a', gsis: 'a', name: 'A One', team: 'KC', pos: 'WR' }),
        nv({ key: 'b', gsis: 'b', espn: '5', name: 'B Two', team: 'KC', pos: 'WR' }),
        nv({ key: 'c', gsis: 'c', name: 'C Three', team: 'KC', pos: 'WR' }),
        nv({ key: 'd', gsis: 'd', name: 'D Four', team: 'KC', pos: 'WR' }),
      ],
      [
        sl({ id: '1', gsis: 'a', name: 'A One', positions: ['WR'] }),
        sl({ id: '2', espn: '5', name: 'B Two', positions: ['WR'] }),
        sl({ id: '3', name: 'C Three', team: 'KC', positions: ['WR'] }),
      ],
    );
    expect(methodCounts(r)).toEqual({ gsis: 1, espn: 1, name_team_pos: 1, name_pos: 0 });
    expect(r.unmatched.get('d')!.reason).toBe('no_candidate');
  });
});
