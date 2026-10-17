// @vitest-environment node
/* End-to-end aggregation on tiny synthetic CSVs: pbp, FTN, snaps, participation, players.csv and a Sleeper player map.
   Every expected number is worked out by hand in the comments. No network, no files. */
import { describe, expect, it } from 'vitest';
import { WEEKLY_COLS } from '../../src/data/nflverseTypes.ts';
import { decodeColumnar } from '../../src/data/nflverse.ts';
import type { CoverageFile, SeasonFile, TeamsFile, UnmatchedFile, WeeklyFile } from '../../src/data/nflverseTypes.ts';
import type { PlayerRecord } from '../../src/data/types.ts';
import type { XtdModel } from '../../src/stats/index.ts';
import { fromArray, parseCsv } from './csv.ts';
import { buildOutputs, type PipelineInputs } from './pipeline.ts';
import { dropbackMap, participationRows, toFtn, toPlay, toPlayersCsv, toSnap } from './rows.ts';

/** rows of objects -> CSV text (header = union of keys, in first-seen order) */
function csv(rows: Array<Record<string, string | number>>): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: string | number | undefined) => (v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

const G1 = '2026_01_BBB_AAA';
const G2 = '2026_02_AAA_BBB';
const base = { season_type: 'REG', posteam: 'AAA', defteam: 'BBB' };
let pid = 0;
const play = (game: string, week: number, o: Record<string, string | number>) =>
  ({ ...base, game_id: game, week, play_id: ++pid, play_type: 'pass', pass_attempt: 1, two_point_attempt: 0, ...o });

/* week 1, AAA offense (hand totals in the test below) */
const PBP = csv([
  play(G1, 1, { yardline_100: 50, air_yards: 10, receiver_player_id: '00-W1', complete_pass: 1, receiving_yards: 15, qb_dropback: 1 }), // 1  W1 catch, blitzed, play action
  play(G1, 1, { yardline_100: 60, air_yards: 20, receiver_player_id: '00-W1', complete_pass: 0, qb_dropback: 1 }), // 2  W1 incomplete, no blitz, not catchable
  play(G1, 1, { yardline_100: 8, air_yards: 8, receiver_player_id: '00-W2', complete_pass: 1, receiving_yards: 8, pass_touchdown: 1, touchdown: 1, qb_dropback: 1 }), // 3  W2 TD, contested
  play(G1, 1, { yardline_100: 35, sack: 1, qb_dropback: 1 }), // 4  sack: a dropback, not a pass attempt
  play(G1, 1, { yardline_100: 40, air_yards: 12, complete_pass: 0, qb_dropback: 1 }), // 5  throwaway: no receiver, still a pass attempt with air yards
  play(G1, 1, { play_type: 'run', pass_attempt: 0, rush_attempt: 1, yardline_100: 30, rusher_player_id: '00-R1', rushing_yards: 4 }), // 6  R1, 8 in the box
  play(G1, 1, { play_type: 'run', pass_attempt: 0, rush_attempt: 1, yardline_100: 9, rusher_player_id: '00-R1', rushing_yards: 6 }), // 7  R1, 6 in the box, inside 10
  play(G1, 1, { play_type: 'run', pass_attempt: 0, rush_attempt: 1, yardline_100: 1, rusher_player_id: '00-R1', rushing_yards: 1, rush_touchdown: 1, touchdown: 1 }), // 8  R1 TD, 7 in the box
  play(G1, 1, { play_type: 'run', pass_attempt: 0, rush_attempt: 1, yardline_100: 40, rusher_player_id: '00-Q1', rushing_yards: 7, qb_scramble: 1, qb_dropback: 1 }), // 9  scramble: run + dropback
  play(G1, 1, { play_type: 'qb_kneel', pass_attempt: 0, rush_attempt: 0, yardline_100: 20, rusher_player_id: '00-Q1' }), // 10 kneel: ignored
  play(G1, 1, { yardline_100: 2, air_yards: 2, receiver_player_id: '00-W1', complete_pass: 1, receiving_yards: 2, two_point_attempt: 1, qb_dropback: 1 }), // 11 two-point try: ignored
  play(G1, 1, { play_type: 'no_play', yardline_100: 50, air_yards: 9, receiver_player_id: '00-W1', qb_dropback: 1 }), // 12 penalty: ignored
  /* week 1, BBB offense */
  { ...base, posteam: 'BBB', defteam: 'AAA', game_id: G1, week: 1, play_id: ++pid, play_type: 'pass', pass_attempt: 1, two_point_attempt: 0, yardline_100: 70, air_yards: 5, receiver_player_id: '00-B1', complete_pass: 1, receiving_yards: 10, qb_dropback: 1 },
  { ...base, posteam: 'BBB', defteam: 'AAA', game_id: G1, week: 1, play_id: ++pid, play_type: 'run', pass_attempt: 0, rush_attempt: 1, two_point_attempt: 0, yardline_100: 60, rusher_player_id: '00-B2', rushing_yards: 3 },
  /* week 2, AAA offense */
  play(G2, 2, { yardline_100: 45, air_yards: 15, receiver_player_id: '00-W1', complete_pass: 1, receiving_yards: 20, qb_dropback: 1 }),
  play(G2, 2, { yardline_100: 30, air_yards: 5, receiver_player_id: '00-W2', complete_pass: 0, qb_dropback: 1 }),
  /* a playoff play must be ignored */
  { ...base, season_type: 'POST', game_id: '2026_19_AAA_BBB', week: 19, play_id: ++pid, play_type: 'pass', pass_attempt: 1, receiver_player_id: '00-W1', air_yards: 50, yardline_100: 50 },
]);

const ftnRow = (game: string, id: number, o: Record<string, string | number>) => ({ nflverse_game_id: game, nflverse_play_id: id, n_blitzers: 0, n_pass_rushers: 4, n_defense_box: 0, is_play_action: 'FALSE', is_screen_pass: 'FALSE', is_catchable_ball: 'FALSE', is_contested_ball: 'FALSE', is_drop: 'FALSE', ...o });
const FTN = csv([
  ftnRow(G1, 1, { n_blitzers: 1, n_pass_rushers: 5, is_play_action: 'TRUE', is_catchable_ball: 'TRUE' }),
  ftnRow(G1, 2, {}),
  ftnRow(G1, 3, { is_catchable_ball: 'TRUE', is_contested_ball: 'TRUE' }),
  ftnRow(G1, 4, {}),
  ftnRow(G1, 5, { is_screen_pass: 'TRUE' }),
  ftnRow(G1, 6, { n_pass_rushers: 0, n_defense_box: 8 }),
  ftnRow(G1, 7, { n_pass_rushers: 0, n_defense_box: 6 }),
  ftnRow(G1, 8, { n_pass_rushers: 0, n_defense_box: 7 }),
  ftnRow(G1, 9, { n_pass_rushers: 0, n_defense_box: 0 }), // scramble: dropback with no rusher count charted
]);

const snap = (game: string, week: number, name: string, pfr: string, position: string, team: string, snaps: number) =>
  ({ game_id: game, week, season: 2026, game_type: 'REG', player: name, pfr_player_id: pfr, position, team, opponent: team === 'AAA' ? 'BBB' : 'AAA', offense_snaps: snaps, offense_pct: snaps / 10 });
const SNAPS = csv([
  snap(G1, 1, 'Quinn Quarter', 'QuarQu00', 'QB', 'AAA', 10),
  snap(G1, 1, 'Wes One', 'OneWe00', 'WR', 'AAA', 9),
  snap(G1, 1, 'Wanda Two', 'TwoWa00', 'WR', 'AAA', 6),
  snap(G1, 1, 'Rick Runner', 'RunnRi00', 'RB', 'AAA', 5),
  snap(G1, 1, 'Ned Nobody', 'NobodNe00', 'WR', 'AAA', 4), // in no Sleeper map
  snap(G1, 1, 'Olive Lineman', 'LineOl00', 'T', 'AAA', 10), // a lineman: counts for team snaps only
  snap(G2, 2, 'Quinn Quarter', 'QuarQu00', 'QB', 'AAA', 10),
  snap(G2, 2, 'Wes One', 'OneWe00', 'WR', 'AAA', 8),
  { ...snap(G1, 1, 'Dee Fender', 'FendDe00', 'CB', 'AAA', 0), defense_snaps: 60 },
]);

const player = (gsis: string, name: string, pfr: string, espn: string, position: string, team: string, birth = '') =>
  ({ gsis_id: gsis, display_name: name, pfr_id: pfr, espn_id: espn, position, latest_team: team, birth_date: birth });
const PLAYERS = csv([
  player('00-Q1', 'Quinn Quarter', 'QuarQu00', '', 'QB', 'AAA'),
  player('00-W1', 'Wes One', 'OneWe00', '111', 'WR', 'AAA'),
  player('00-W2', 'Wanda Two', 'TwoWa00', '222', 'WR', 'AAA'),
  player('00-R1', 'Rick Runner', 'RunnRi00', '', 'RB', 'AAA'),
  player('00-B1', 'Bo Bee', '', '', 'WR', 'BBB'),
  player('00-B2', 'Bee Two', '', '', 'RB', 'BBB'),
]);

const sleeper = (id: string, name: string, position: string, team: string, extra: Partial<PlayerRecord> = {}): PlayerRecord =>
  ({ player_id: id, full_name: name, first_name: name.split(' ')[0], last_name: name.split(' ')[1], position, team, status: 'Active', fantasy_positions: [position], ...extra });
const SLEEPER: Record<string, PlayerRecord> = {
  S1: sleeper('S1', 'Quinn Quarter', 'QB', 'AAA', { gsis_id: '00-Q1' }), // gsis
  S2: sleeper('S2', 'Wes One', 'WR', 'AAA', { gsis_id: '00-W1', espn_id: '111' }), // gsis
  S3: sleeper('S3', 'Wanda Two', 'WR', 'AAA', { espn_id: 222 }), // espn (a number, as Sleeper sends it)
  S4: sleeper('S4', 'Rick Runner', 'RB', 'AAA'), // name + team + position
  S5: sleeper('S5', 'Bo Bee', 'WR', 'BBB', { gsis_id: '00-B1' }),
  S9: sleeper('S9', 'Some Kicker', 'K', 'AAA'),
};

const MODEL: XtdModel = {
  version: 1, fit_season: 2025,
  buckets: [
    { play_type: 'pass', yardline_from: 1, yardline_to: 10, p_td: 0.4, n: 50 },
    { play_type: 'pass', yardline_from: 11, yardline_to: 99, p_td: 0.1, n: 500 },
    { play_type: 'rush', yardline_from: 1, yardline_to: 5, p_td: 0.5, n: 50 },
    { play_type: 'rush', yardline_from: 6, yardline_to: 99, p_td: 0.1, n: 500 },
  ],
};

/* participation for the six week-1 AAA dropbacks (plays 1 to 5 and 9): W1, W2, R1 on the field each time. Plays 1, 4, 5 man (COVER_1), plays 2, 3, 9 zone (COVER_3). */
const part = (game: string, playId: number, mz: 'MAN_COVERAGE' | 'ZONE_COVERAGE', cov: string) => ({
  nflverse_game_id: game, play_id: playId, possession_team: 'AAA', offense_players: '00-Q1;00-W1;00-W2;00-R1;00-OL', offense_positions: 'QB;WR;WR;RB;T',
  defense_man_zone_type: mz, defense_coverage_type: cov, route: '',
});
const PART = csv([
  part(G1, 1, 'MAN_COVERAGE', 'COVER_1'), part(G1, 2, 'ZONE_COVERAGE', 'COVER_3'), part(G1, 3, 'ZONE_COVERAGE', 'COVER_3'),
  part(G1, 4, 'MAN_COVERAGE', 'COVER_1'), part(G1, 5, 'MAN_COVERAGE', 'COVER_1'), part(G1, 9, 'ZONE_COVERAGE', 'COVER_3'),
  part(G1, 6, 'MAN_COVERAGE', 'COVER_1'), // a run: ignored by coverage
]);

function inputs(over: Partial<PipelineInputs> = {}): PipelineInputs {
  const plays = parseCsv(PBP).map(toPlay).filter((p) => p !== null);
  return {
    season: 2026, participationSeason: 2026, generatedAt: '2026-10-16T12:00:00.000Z',
    plays,
    ftn: new Map(parseCsv(FTN).map(toFtn).filter((x) => x !== null)),
    snaps: parseCsv(SNAPS).map(toSnap).filter((s) => s !== null),
    playersCsv: parseCsv(PLAYERS).map(toPlayersCsv).filter((p) => p !== null),
    sleeperPlayers: SLEEPER, xtd: MODEL,
    partPlays: dropbackMap(plays),
    partRows: () => participationRows(fromArray(parseCsv(PART))),
    sources: [],
    ...over,
  };
}

const json = <T,>(out: Awaited<ReturnType<typeof buildOutputs>>, name: string) => JSON.parse(out.files[name]) as T;
const rowsOf = <T,>(f: { cols: string[]; rows: Array<Array<string | number | null>> }) => decodeColumnar<T>(f);
type Row = Record<string, number | string | null>;

describe('pbp to team and player totals (hand-computed)', () => {
  it('team week 1 for AAA: pass attempts exclude the sack, the two-point try and the penalty; runs include the scramble, not the kneel', async () => {
    const out = await buildOutputs(inputs());
    const teams = rowsOf<Row>(json<TeamsFile>(out, 'teams_2026.json'));
    const aaa1 = teams.find((t) => t.team === 'AAA' && t.week === 1)!;
    // pass attempts: plays 1, 2, 3, 5 = 4 (sack, 2-pt, no_play out); air yards 10 + 20 + 8 + 12 = 50
    expect(aaa1).toMatchObject({ opp: 'BBB', pass_att: 4, air_yds: 50, rush_att: 4, dropbacks: 6 });
    // red zone (yardline_100 <= 20): the TD pass at 8 / runs at 9 and 1
    expect(aaa1).toMatchObject({ rz_pass_att: 1, i10_pass_att: 1, rz_rush_att: 2, i10_rush_att: 2 });
    // team snaps = the most snaps any AAA player had (the lineman's 10)
    expect(aaa1.off_snaps).toBe(10);
    expect(teams.find((t) => t.team === 'AAA' && t.week === 2)).toMatchObject({ pass_att: 2, air_yds: 20, rush_att: 0 });
  });

  it('weekly: W1 week 1 usage, shares, WOPR and FTN splits', async () => {
    const out = await buildOutputs(inputs());
    const w1 = rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json')).find((r) => r.pid === 'S2' && r.week === 1)!;
    expect(w1).toMatchObject({
      team: 'AAA', opp: 'BBB', off_snaps: 9, tm_snaps: 10, tgt: 2, rec: 1, rec_yds: 15, rec_td: 0, air_yds: 30, ftn_tgt: 2,
      // only the first target was catchable, and it was caught
      catchable_tgt: 1, catchable_rec: 1, drops: 0,
      bl_tgt: 1, bl_rec: 1, bl_yds: 15, nbl_tgt: 1, nbl_rec: 0, nbl_yds: 0, pa_tgt: 1, scr_tgt: 0, cont_tgt: 0, cont_rec: 0,
      rz_tgt: 0, i10_tgt: 0, ez_tgt: 0,
    });
    expect(w1.snap_pct).toBe(0.9); // 9 / 10
    expect(w1.tgt_share).toBe(0.5); // 2 / 4
    expect(w1.ay_share).toBe(0.6); // 30 / 50
    expect(w1.wopr).toBe(1.17); // 1.5 * 0.5 + 0.7 * 0.6
    // xTD: both targets are beyond the 10, 0.1 each; no TD scored
    expect(w1.xtd_rec).toBe(0.2);
    expect(w1.xtd_rush).toBe(0);
  });

  it('weekly: W2 scores a red-zone end-zone TD, contested', async () => {
    const out = await buildOutputs(inputs());
    const w2 = rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json')).find((r) => r.pid === 'S3' && r.week === 1)!;
    expect(w2).toMatchObject({ tgt: 1, rec: 1, rec_yds: 8, rec_td: 1, air_yds: 8, rz_tgt: 1, i10_tgt: 1, ez_tgt: 1, cont_tgt: 1, cont_rec: 1, catchable_tgt: 1 });
    expect(w2.tgt_share).toBe(0.25); // 1 / 4
    expect(w2.ay_share).toBe(0.16); // 8 / 50
    expect(w2.wopr).toBe(0.487); // 0.375 + 0.112
    expect(w2.rz_tgt_share).toBe(1); // 1 / 1
    expect(w2.xtd_rec).toBe(0.4);
  });

  it('weekly: R1 carries, box splits, red-zone carry share', async () => {
    const out = await buildOutputs(inputs());
    const r1 = rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json')).find((r) => r.pid === 'S4' && r.week === 1)!;
    expect(r1).toMatchObject({ car: 3, rush_yds: 11, rush_td: 1, rz_car: 2, i10_car: 2, box_car: 3, stk_car: 1, stk_yds: 4, lgt_car: 1, lgt_yds: 6, off_snaps: 5 });
    expect(r1.rush_share).toBe(0.75); // 3 / 4 team runs (the scramble is one of them)
    expect(r1.rz_car_share).toBe(1); // 2 / 2
    expect(r1.i10_car_share).toBe(1);
    expect(r1.snap_pct).toBe(0.5);
    // xTD rush: yardline 30 -> 0.1, 9 -> 0.1, 1 -> 0.5
    expect(r1.xtd_rush).toBe(0.7);
  });

  it('the QB scramble is a carry for the QB; the kneel is not', async () => {
    const out = await buildOutputs(inputs());
    const q = rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json')).find((r) => r.pid === 'S1' && r.week === 1)!;
    expect(q).toMatchObject({ car: 1, rush_yds: 7, box_car: 0 }); // box unknown (0) on the scramble
    expect(q.rush_share).toBe(0.25);
  });

  it('playoff weeks and non-skill players do not appear', async () => {
    const out = await buildOutputs(inputs());
    const weeks = new Set(rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json')).map((r) => r.week));
    expect([...weeks].sort()).toEqual([1, 2]);
    expect(json<SeasonFile>(out, 'season_2026.json').throughWeek).toBe(2);
  });

  it('columns are the documented list and rows are sorted by player then week', async () => {
    const out = await buildOutputs(inputs());
    const f = json<WeeklyFile>(out, 'weekly_2026.json');
    expect(f.cols).toEqual([...WEEKLY_COLS]);
    expect(f.rows.every((r) => r.length === f.cols.length)).toBe(true);
    const keys = f.rows.map((r) => `${r[0]}|${String(r[1]).padStart(2, '0')}`);
    expect(keys).toEqual([...keys].sort());
  });
});

describe('season to date', () => {
  it('sums counts, and divides by the team totals of the weeks he played', async () => {
    const out = await buildOutputs(inputs());
    const s = rowsOf<Row>(json<SeasonFile>(out, 'season_2026.json'));
    const w1 = s.find((r) => r.pid === 'S2')!;
    // targets 2 + 1; receptions 1 + 1; yards 15 + 20; air yards 30 + 15
    expect(w1).toMatchObject({ team: 'AAA', games: 2, tgt: 3, rec: 2, rec_yds: 35, air_yds: 45, off_snaps: 17, tm_snaps: 20 });
    expect(w1.snap_pct).toBe(0.85); // 17 / 20
    expect(w1.tgt_share).toBe(0.5); // 3 / (4 + 2)
    expect(w1.ay_share).toBe(0.643); // 45 / (50 + 20)
    expect(w1.wopr).toBe(1.2); // 1.5 * 0.5 + 0.7 * 0.643
    expect(w1.adot).toBe(15); // 45 / 3
    expect(w1.ypt).toBe(11.67); // 35 / 3
    expect(w1.catch_rate).toBe(1); // 1 catchable target, caught (week 2's catch has no FTN row, so it is not in either side)
    expect(w1.tgt_per_snap).toBe(0.176); // 3 / 17
    expect(w1.pa_share).toBe(0.5); // 1 play-action of 2 charted targets (week 2 has no FTN rows)
    expect(w1.ypt_bl).toBe(15);
    expect(w1.ypt_nbl).toBe(0);
    // no touchdowns, 0.1 + 0.1 + 0.1 expected
    expect(w1.xtd_rec).toBe(0.3);
    expect(w1.td_gap).toBe(-0.3);
  });

  it('a week with a target but no snaps still counts as a game and adds its team totals', async () => {
    const out = await buildOutputs(inputs());
    const w2 = rowsOf<Row>(json<SeasonFile>(out, 'season_2026.json')).find((r) => r.pid === 'S3')!;
    expect(w2.games).toBe(2);
    expect(w2.tgt).toBe(2);
    expect(w2.tgt_share).toBe(0.333); // 2 / 6
    expect(w2.td_gap).toBe(0.5); // 1 TD - (0.4 + 0.1): the targets at yardline 8 and 30
  });

  it('RB: ypc into stacked and light boxes, and the touchdown gap', async () => {
    const out = await buildOutputs(inputs());
    const r1 = rowsOf<Row>(json<SeasonFile>(out, 'season_2026.json')).find((r) => r.pid === 'S4')!;
    expect(r1.ypc).toBe(3.67); // 11 / 3
    expect(r1.ypc_stk).toBe(4); // 4 / 1
    expect(r1.ypc_lgt).toBe(6); // 6 / 1
    expect(r1.td_gap).toBe(0.3); // 1 TD - 0.7
    expect(r1.tgt_per_snap).toBe(0);
    expect(r1.catch_rate).toBeNull(); // no catchable targets: null, not 0
    expect(r1.adot).toBeNull();
  });
});

describe('defense-faced tendencies', () => {
  it('BBB faced: blitz rate over charted dropbacks, light and stacked box rates, man rate from participation', async () => {
    const out = await buildOutputs(inputs());
    const f = json<TeamsFile>(out, 'teams_2026.json');
    expect(f.hasManZone).toBe(true);
    const bbb = rowsOf<Row>(f).find((t) => t.team === 'BBB' && t.week === 1)!;
    // charted dropbacks: plays 1 to 5 (the scramble has no rusher count) = 5; one blitz
    expect(bbb).toMatchObject({ def_db: 5, def_blitz: 1, def_blitz_rate: 0.2 });
    // charted boxes on runs: 8, 6, 7 -> stacked 1, light 1 of 3
    expect(bbb).toMatchObject({ def_box_car: 3, def_light_car: 1, def_light_rate: 0.333, def_stk_car: 1, def_stk_rate: 0.333 });
    // man on plays 1, 4, 5; zone on 2, 3, 9
    expect(bbb).toMatchObject({ def_mz_db: 6, def_man: 3, def_man_rate: 0.5 });
  });

  it('when participation is last season, the man/zone fields are null and the flag says so', async () => {
    const out = await buildOutputs(inputs({ participationSeason: 2025 }));
    const f = json<TeamsFile>(out, 'teams_2026.json');
    expect(f.hasManZone).toBe(false);
    const bbb = rowsOf<Row>(f).find((t) => t.team === 'BBB' && t.week === 1)!;
    expect(bbb.def_mz_db).toBeNull();
    expect(bbb.def_man_rate).toBeNull();
    expect(bbb.def_blitz_rate).toBe(0.2);
  });
});

describe('coverage (participation)', () => {
  it('routes are the dropbacks the player was on the field for as WR, TE or RB', async () => {
    const out = await buildOutputs(inputs());
    const c = json<CoverageFile>(out, 'coverage_2026.json');
    expect(c).toMatchObject({ season: 2026, isCurrent: true });
    const rows = rowsOf<Row>(c);
    const w1 = rows.find((r) => r.pid === 'S2')!;
    // six dropbacks; W1 targeted on plays 1 (man) and 2 (zone)
    expect(w1).toMatchObject({ routes: 6, tgt: 2, rec: 1, yds: 15, td: 0, man_routes: 3, man_tgt: 1, man_rec: 1, man_yds: 15, zone_routes: 3, zone_tgt: 1, zone_rec: 0, zone_yds: 0 });
    expect(w1.yprr).toBe(2.5); // 15 / 6
    expect(w1.tprr).toBe(0.333);
    expect(w1.yprr_man).toBe(5); // 15 / 3
    expect(w1.yprr_zone).toBe(0);
    const w2 = rows.find((r) => r.pid === 'S3')!;
    expect(w2).toMatchObject({ routes: 6, tgt: 1, rec: 1, yds: 8, td: 1, zone_tgt: 1, zone_td: 1 });
    expect(w2.yprr).toBe(1.33);
    // the RB runs routes too (route proxy); the QB and lineman do not
    expect(rows.find((r) => r.pid === 'S4')!.routes).toBe(6);
    expect(rows.find((r) => r.pid === 'S1')).toBeUndefined();
  });

  it('shells split routes and targets by coverage type', async () => {
    const out = await buildOutputs(inputs());
    const c = json<CoverageFile>(out, 'coverage_2026.json');
    expect(c.shells.S2).toEqual({ COVER_1: [3, 1, 1, 15, 0], COVER_3: [3, 1, 0, 0, 0] });
    expect(c.teams.BBB).toEqual({ dropbacks: 6, man: 3, zone: 3, man_rate: 0.5, shells: { COVER_1: 3, COVER_3: 3 } });
  });

  it('the file is named for the participation season, and "last season" is flagged', async () => {
    const out = await buildOutputs(inputs({ participationSeason: 2025 }));
    expect(Object.keys(out.files)).toContain('coverage_2025.json');
    expect(Object.keys(out.files)).not.toContain('coverage_2026.json');
    expect(json<CoverageFile>(out, 'coverage_2025.json')).toMatchObject({ season: 2025, isCurrent: false });
    expect(out.manifest).toMatchObject({ participationSeason: 2025, participationIsCurrent: false });
    expect(out.manifest.routesDefinition).toMatch(/targeted receiver/);
  });
});

describe('the ID join inside the pipeline', () => {
  it('records the match method per player and lists who could not be joined', async () => {
    const out = await buildOutputs(inputs());
    // S1, S2, S5 by gsis; S3 by espn; S4 by name
    expect(out.manifest.matchMethods).toEqual({ gsis: 3, espn: 1, name_team_pos: 1, name_pos: 0 });
    expect(out.manifest.matched).toBe(5);
    const u = json<UnmatchedFile>(out, 'unmatched.json');
    expect(out.manifest.unmatchedCount).toBe(u.players.length);
    // Ned Nobody (4 snaps, no Sleeper player) and Bee Two (a carry, no Sleeper player); sorted by snaps
    expect(u.players.map((p) => [p.name, p.pos, p.team, p.off_snaps, p.car, p.reason])).toEqual([
      ['Ned Nobody', 'WR', 'AAA', 4, 0, 'no_candidate'],
      ['Bee Two', 'RB', 'BBB', 0, 1, 'no_candidate'],
    ]);
    // linemen, kickers and defenders are not listed
    expect(u.players.some((p) => p.pos === 'T' || p.pos === 'CB')).toBe(false);
  });

  it('unmatched players do not appear in the player files', async () => {
    const out = await buildOutputs(inputs());
    const pids = new Set(rowsOf<Row>(json<SeasonFile>(out, 'season_2026.json')).map((r) => r.pid));
    expect([...pids].sort()).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
  });

  it('snaps join through pfr id -> players.csv -> gsis, so a player’s snaps and targets land on one row', async () => {
    const out = await buildOutputs(inputs());
    const w = rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json')).filter((r) => r.pid === 'S2');
    expect(w).toHaveLength(2);
    expect(w[0]).toMatchObject({ off_snaps: 9, tgt: 2 });
  });
});

describe('manifest and the xTD model', () => {
  it('without a model, xTD and the gap are null and the manifest says so', async () => {
    const out = await buildOutputs(inputs({ xtd: null }));
    expect(out.manifest.xtd).toEqual({ available: false, fitSeason: null, version: null });
    const r1 = rowsOf<Row>(json<SeasonFile>(out, 'season_2026.json')).find((r) => r.pid === 'S4')!;
    expect(r1.xtd_rush).toBeNull();
    expect(r1.xtd_rec).toBeNull();
    expect(r1.td_gap).toBeNull();
    expect(r1.rush_td).toBe(1); // real counts stay
    const w = rowsOf<Row>(json<WeeklyFile>(out, 'weekly_2026.json'))[0];
    expect(w.xtd_rec).toBeNull();
  });

  it('with a model, the manifest carries its version and fit season', async () => {
    const out = await buildOutputs(inputs());
    expect(out.manifest.xtd).toEqual({ available: true, fitSeason: 2025, version: 1 });
  });

  it('carries the attribution, season, week, FTN join rate, file sizes and the definitions', async () => {
    const out = await buildOutputs(inputs());
    const m = out.manifest;
    expect(m).toMatchObject({
      schema: 1, season: 2026, seasonsCovered: [2026], throughWeek: 2, generatedAt: '2026-10-16T12:00:00.000Z',
      attribution: 'Play-by-play and snap data: nflverse. Charting data: FTN Data via nflverse.',
    });
    // 9 of AAA's 11 counted dropbacks/runs have FTN rows (plays 1-9) and none of BBB's 2, nor week 2's 2: 9 / 13
    expect(m.ftnJoinRate).toBe(0.692);
    expect(Object.keys(m.files).sort()).toEqual(['coverage_2026.json', 'season_2026.json', 'teams_2026.json', 'unmatched.json', 'weekly_2026.json']);
    expect(m.files['weekly_2026.json']).toBe(Buffer.byteLength(out.files['weekly_2026.json']));
    expect(m.definitions.tgt_share).toMatch(/team pass attempts/);
    expect(JSON.parse(out.files['manifest.json'])).toEqual(JSON.parse(JSON.stringify(m)));
  });

  it('stays small', async () => {
    const out = await buildOutputs(inputs());
    expect(Object.values(out.files).every((f) => f.length < 3_000_000)).toBe(true);
  });
});
