// @vitest-environment node
/* One detector at a time on hand-built inputs: fires just over the threshold, stays quiet just under it and below the
   minimum sample. The world is described in testData.ts. */
import { describe, expect, it } from 'vitest';
import {
  blitzBeater, boxCountEdge, buyLow, coverageNote, dynastyMover, rzRoleChange, sellHigh, softSchedule, targetHog, usageSpike, waiverRiser,
} from './detectors/index.ts';
import { DEFAULT_THRESHOLDS } from './thresholds.ts';
import { fcEntry, games, makeInputs, seasonRow, teamRow, weekRow, type World } from './testData.ts';
import type { CoverageRow } from '../data/nflverseTypes.ts';
import type { Detector } from './common.ts';
import type { ModelPlayer } from '../engine/types.ts';
import type { TakeInputs } from './types.ts';

const TH = DEFAULT_THRESHOLDS;

/** Ways a player drops out of next-game takes: roster IR slot, an Out/IR/PUP/Sus/NA status, or a 0 projection. */
const SIDELINED: Array<[string, (p: ModelPlayer) => void]> = [
  ['a roster IR slot', (p) => { p.onIr = true; }],
  ['injury Out', (p) => { p.injury = 'Out'; }],
  ['injury IR', (p) => { p.injury = 'IR'; }],
  ['injury PUP', (p) => { p.injury = 'PUP'; }],
  ['injury Sus', (p) => { p.injury = 'Sus'; }],
  ['injury NA', (p) => { p.injury = 'NA'; }],
  ['a 0 projection next game', (p) => { p.mu[6] = 0; }],
];
function expectSidelinedQuiet(build: () => TakeInputs, detect: Detector, pid: string) {
  expect(detect(build(), TH).length, 'fires when healthy').toBeGreaterThan(0);
  for (const [label, mutate] of SIDELINED) {
    const inp = build();
    mutate(inp.model.players.find((p) => p.pid === pid)!);
    expect(detect(inp, TH), label).toHaveLength(0);
  }
  const q = build();
  q.model.players.find((p) => p.pid === pid)!.injury = 'Questionable';
  expect(detect(q, TH).length, 'Questionable still fires').toBeGreaterThan(0);
}
const wr = (pid = 'p1', extra: Partial<World['players'][number]> = {}) => ({ pid, pos: 'WR' as const, ...extra });

describe('usage_spike', () => {
  /** weeks 2-4 at 30/60 (50%), week 5 at `last` snaps */
  const world = (last: number, priorWeeks = [2, 3, 4]): World => ({
    players: [wr()],
    weekly: [...games('p1', () => ({}), priorWeeks), weekRow('p1', 5, { off_snaps: last })],
  });
  it('fires at +15 points or more', () => {
    const [c] = usageSpike(makeInputs(world(40)), TH); // 66.7% vs 50.0%
    expect(c).toMatchObject({ kind: 'usage_spike', pid: 'p1', week: 6, throughWeek: 5, tone: 'good', sample: { label: 'games', n: 3 } });
    expect(c!.facts).toMatchObject({ kind: 'usage_spike', baseFrom: 2, baseTo: 4 });
  });
  it('fires on exactly +15 points (float-safe)', () => {
    const w = world(0);
    w.weekly = [...games('p1', () => ({ off_snaps: 20, tm_snaps: 40 }), [2, 3, 4]), weekRow('p1', 5, { off_snaps: 26, tm_snaps: 40 })]; // 0.65 vs 0.50
    expect(usageSpike(makeInputs(w), TH)).toHaveLength(1);
  });
  it('stays quiet at +13 points', () => {
    expect(usageSpike(makeInputs(world(38)), TH)).toHaveLength(0); // 63.3% vs 50%
  });
  it('stays quiet below the minimum sample (only two baseline games)', () => {
    expect(usageSpike(makeInputs(world(40, [3, 4])), TH)).toHaveLength(0);
  });
  it('stays quiet when the new share is under 30%, or the latest game is not a full game', () => {
    const w = world(0);
    w.weekly = [...games('p1', () => ({ off_snaps: 3 }), [2, 3, 4]), weekRow('p1', 5, { off_snaps: 15 })]; // 25% vs 5%
    expect(usageSpike(makeInputs(w), TH)).toHaveLength(0);
    const partial = world(40);
    partial.weekly![partial.weekly!.length - 1] = weekRow('p1', 5, { off_snaps: 20, tm_snaps: 30 }); // 30 team snaps: under min_team_snaps
    expect(usageSpike(makeInputs(partial), TH)).toHaveLength(0);
  });
  it('ignores QBs and does nothing without nflverse', () => {
    expect(usageSpike(makeInputs({ ...world(40), players: [{ pid: 'p1', pos: 'QB' }] }), TH)).toHaveLength(0);
    expect(usageSpike(makeInputs({ ...world(40), nflverse: false }), TH)).toHaveLength(0);
  });
  it('honors a tuned threshold', () => {
    const tuned = { ...TH, detectors: { ...TH.detectors, usage_spike: { ...TH.detectors.usage_spike, snap_share_jump: 0.3 } } };
    expect(usageSpike(makeInputs(world(40)), tuned)).toHaveLength(0);
  });
  it('skips sidelined players', () => expectSidelinedQuiet(() => makeInputs(world(40)), usageSpike, 'p1'));
});

describe('target_hog', () => {
  /** team throws 20 passes a game, so 5 targets a game is 25% */
  const world = (perGame: number[], pass = 20): World => ({
    players: [wr()],
    weekly: perGame.map((t, i) => weekRow('p1', 3 + i, { tgt: t })),
    teams: [3, 4, 5].map((k) => teamRow('AAA', k, { pass_att: pass })),
    season: [seasonRow('p1', { tgt_share: 0.22 })],
  });
  it('fires at 25% over 3 games', () => {
    const [c] = targetHog(makeInputs(world([5, 5, 5])), TH);
    expect(c).toMatchObject({ kind: 'target_hog', sample: { label: 'targets', n: 15 }, throughWeek: 5 });
    expect(c!.facts).toMatchObject({ kind: 'target_hog', tgt: 15, teamPass: 60, seasonShare: 0.22 });
  });
  it('stays quiet at 20%', () => expect(targetHog(makeInputs(world([4, 4, 4])), TH)).toHaveLength(0));
  it('stays quiet under the 15-target minimum even at a huge share', () => {
    expect(targetHog(makeInputs(world([4, 4, 4], 10)), TH)).toHaveLength(0); // 12 of 30 = 40%
  });
  it('stays quiet when the window is stale (last game two weeks before the latest team week)', () => {
    const w = world([5, 5, 5]);
    w.weekly = [1, 2, 3].map((k) => weekRow('p1', k, { tgt: 5 }));
    w.teams = [1, 2, 3].map((k) => teamRow('AAA', k, { pass_att: 20 }));
    expect(targetHog(makeInputs(w), TH)).toHaveLength(0);
  });
  it('skips sidelined players', () => expectSidelinedQuiet(() => makeInputs(world([5, 5, 5])), targetHog, 'p1'));
});

describe('buy_low', () => {
  /** 40 WRs; air-yards share falls with the index (index 0 = rank 1); points per game 30 - 0.5 * index, except the target */
  const world = (target: number, targetPpg: number, targetGames = 5): World => {
    const players = Array.from({ length: 40 }, (_, i) => wr(`w${i}`));
    const weekly = players.flatMap((p, i) => games(p.pid, () => ({ tgt: 8 }), i === target ? [1, 2, 3, 4, 5].slice(0, targetGames) : [1, 2, 3, 4, 5]));
    const season = players.map((p, i) => seasonRow(p.pid, { ay_share: 0.4 - 0.005 * i, tgt: 40, games: i === target ? targetGames : 5 }));
    const withPts = players.map((p, i) => ({ ...p, pts: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [k, i === target ? targetPpg : 30 - 0.5 * i])) }));
    return { players: withPts, weekly, season };
  };
  const fires = (w: World, pid: string) => buyLow(makeInputs(w), TH).find((c) => c.pid === pid);
  it('fires for air-yards rank 24 with ppg rank 37', () => {
    const c = fires(world(23, 11.8), 'w23');
    expect(c).toMatchObject({ kind: 'buy_low', tone: 'good', sample: { label: 'games', n: 5 } });
    expect(c!.facts).toMatchObject({ ayRank: 24, ppgRank: 37, pool: 40 });
  });
  it('stays quiet at air-yards rank 25', () => expect(fires(world(24, 5), 'w24')).toBeUndefined());
  it('stays quiet at ppg rank 36', () => expect(fires(world(9, 12.2), 'w9')).toBeUndefined());
  it('stays quiet under the minimum games', () => expect(fires(world(9, 5, 2), 'w9')).toBeUndefined());
  it('uses league-scored points from the model, joined by pid (not nflverse)', () => {
    const w = world(9, 5);
    const c = fires(w, 'w9')!;
    expect(c.facts).toMatchObject({ kind: 'buy_low', ppg: 5 });
  });
});

describe('sell_high', () => {
  const world = (o: Partial<ReturnType<typeof seasonRow>>): World => ({
    players: [wr()], weekly: games('p1'),
    season: [seasonRow('p1', { tgt: 40, car: 0, rec_td: 4, xtd_rec: 1.9, xtd_rush: 0, td_gap: 2.1, ...o })],
  });
  it('fires at +2.0 or more', () => {
    const [c] = sellHigh(makeInputs(world({ td_gap: 2.0, xtd_rec: 2.0 })), TH);
    expect(c).toMatchObject({ kind: 'sell_high', tone: 'bad', sample: { label: 'opportunities', n: 40 } });
    expect(c!.facts).toMatchObject({ tds: 4, gap: 2 });
  });
  it('stays quiet at +1.9', () => expect(sellHigh(makeInputs(world({ td_gap: 1.9, xtd_rec: 2.1 })), TH)).toHaveLength(0));
  it('stays quiet under 20 opportunities', () => expect(sellHigh(makeInputs(world({ tgt: 12, car: 7 })), TH)).toHaveLength(0));
  it('stays quiet without the xTD model', () => expect(sellHigh(makeInputs(world({ xtd_rec: null, xtd_rush: null, td_gap: null })), TH)).toHaveLength(0));
});

describe('rz_role_change', () => {
  /** weeks 1-2 prior, 3-5 recent; the team runs 3 + 3 inside-10 plays a game */
  const world = (priorTouches: number, recentTouches: number, teamPlays = 3): World => ({
    players: [{ pid: 'p1', pos: 'RB' }],
    weekly: [
      ...games('p1', () => ({ i10_car: priorTouches / 2 }), [1, 2]),
      ...games('p1', () => ({ i10_car: recentTouches / 3 }), [3, 4, 5]),
    ],
    teams: [1, 2, 3, 4, 5].map((k) => teamRow('AAA', k, { i10_pass_att: teamPlays, i10_rush_att: teamPlays })),
  });
  it('fires on a rise of 20+ points of inside-10 share', () => {
    const [c] = rzRoleChange(makeInputs(world(2, 7)), TH); // 2/12 = 16.7% -> 7/18 = 38.9%
    expect(c).toMatchObject({ kind: 'rz_role_change', tone: 'good', sample: { label: 'team inside-10 plays', n: 30 } });
    expect(c!.facts).toMatchObject({ kind: 'rz_role_change', up: true, touchesNow: 7, touchesPrior: 2 });
  });
  it('fires on a fall, with a bad tone', () => {
    const [c] = rzRoleChange(makeInputs(world(7, 2)), TH); // 7/12 = 58.3% -> 2/18 = 11.1%
    expect(c).toMatchObject({ tone: 'bad' });
  });
  it('stays quiet on a 16-point move', () => expect(rzRoleChange(makeInputs(world(2, 6)), TH)).toHaveLength(0)); // 16.7% -> 33.3%
  it('stays quiet when the team has under 6 inside-10 plays in a window', () => {
    expect(rzRoleChange(makeInputs(world(0, 3, 1)), TH)).toHaveLength(0); // prior 4 plays
  });
  it('stays quiet with fewer than 3 touches in either window', () => {
    expect(rzRoleChange(makeInputs(world(0, 2, 3)), TH)).toHaveLength(0);
  });
});

describe('box_count_edge', () => {
  const world = (ypc: number, carries: number, oppLight: number): World => ({
    players: [{ pid: 'r1', pos: 'RB' }], weekly: games('r1'),
    season: [seasonRow('r1', { ypc_lgt: ypc, lgt_car: carries, ypc: 4.4 })],
    teams: [1, 2, 3, 4, 5].map((k) => teamRow('BBB', k, { def_box_car: 20, def_light_car: oppLight })),
  });
  it('fires at 5.0 ypc vs light boxes against a 35% light-box defense', () => {
    const [c] = boxCountEdge(makeInputs(world(5.0, 15, 7)), TH);
    expect(c).toMatchObject({ kind: 'box_count_edge', week: 6, sample: { label: 'light-box carries', n: 15 }, sources: ['nflverse', 'ftn'] });
    expect(c!.facts).toMatchObject({ opp: 'BBB', oppRate: 0.35, oppCarries: 100 });
  });
  it('stays quiet at 4.9 ypc', () => expect(boxCountEdge(makeInputs(world(4.9, 15, 7)), TH)).toHaveLength(0));
  it('stays quiet when the opponent is at 30%', () => expect(boxCountEdge(makeInputs(world(5.0, 15, 6)), TH)).toHaveLength(0));
  it('stays quiet under 15 light-box carries', () => expect(boxCountEdge(makeInputs(world(6.5, 14, 9)), TH)).toHaveLength(0));
  it('uses the next opponent from the model schedule', () => {
    const w = world(5.0, 15, 7);
    w.players = [{ pid: 'r1', pos: 'RB', opp: { 6: 'CCC', 7: 'BBB' } }];
    expect(boxCountEdge(makeInputs(w), TH)).toHaveLength(0); // CCC has no tendencies on file
  });
  it('only looks at running backs', () => {
    const w = world(5.0, 15, 7);
    w.players = [{ pid: 'r1', pos: 'WR' }];
    expect(boxCountEdge(makeInputs(w), TH)).toHaveLength(0);
  });
  it('skips sidelined players', () => expectSidelinedQuiet(() => makeInputs(world(5.0, 15, 7)), boxCountEdge, 'r1'));
  it('needs an edge: light-box ypc at least 0.5 above his overall ypc', () => {
    const edge = (lgt: number, overall: number) => {
      const w = world(lgt, 15, 7);
      w.season = [seasonRow('r1', { ypc_lgt: lgt, lgt_car: 15, ypc: overall })];
      return boxCountEdge(makeInputs(w), TH);
    };
    expect(edge(5.3, 5.9)).toHaveLength(0); // better overall than in light boxes: no edge
    expect(edge(5.3, 4.9)).toHaveLength(0); // +0.4
    expect(edge(5.4, 4.9)).toHaveLength(1); // +0.5
    expect(edge(5.0, 5.0)).toHaveLength(0);
  });
});

describe('blitz_beater', () => {
  const world = (yb: number, yn: number, bl: number, oppBlitz: number): World => ({
    players: [wr('b1')], weekly: games('b1'),
    season: [seasonRow('b1', { ypt_bl: yb, ypt_nbl: yn, bl_tgt: bl, nbl_tgt: 20 })],
    teams: [1, 2, 3, 4, 5].map((k) => teamRow('BBB', k, { def_db: 40, def_blitz: oppBlitz })),
  });
  it('fires at +2.0 yards a target against a 35% blitz team', () => {
    const [c] = blitzBeater(makeInputs(world(10, 8, 15, 14)), TH);
    expect(c).toMatchObject({ kind: 'blitz_beater', sample: { label: 'blitz targets', n: 15 } });
    expect(c!.facts).toMatchObject({ opp: 'BBB', oppRate: 0.35 });
  });
  it('stays quiet at +1.9', () => expect(blitzBeater(makeInputs(world(9.9, 8, 15, 14)), TH)).toHaveLength(0));
  it('stays quiet against a 32.5% blitz team', () => expect(blitzBeater(makeInputs(world(10, 8, 15, 13)), TH)).toHaveLength(0));
  it('stays quiet under 15 blitz targets', () => expect(blitzBeater(makeInputs(world(14, 8, 14, 20)), TH)).toHaveLength(0));
  it('skips sidelined players', () => expectSidelinedQuiet(() => makeInputs(world(10, 8, 15, 14)), blitzBeater, 'b1'));
});

describe('soft_schedule', () => {
  const world = (grades: Array<number | null>, mu = 10, bye = false): World => ({
    players: [{
      pid: 's1', pos: 'WR', mu,
      opp: bye ? { 6: 'X1', 7: 'BYE', 8: 'X2', 9: 'X3' } : { 6: 'X1', 7: 'X2', 8: 'X3' },
      dvp: bye ? { 6: grades[0] ?? null, 7: null, 8: grades[1] ?? null, 9: grades[2] ?? null } : { 6: grades[0] ?? null, 7: grades[1] ?? null, 8: grades[2] ?? null },
    }],
    weekly: games('s1'),
  });
  it('fires when the next 3 grades are all 1.15 or more', () => {
    const [c] = softSchedule(makeInputs(world([1.15, 1.2, 1.4])), TH);
    expect(c).toMatchObject({ kind: 'soft_schedule', week: 6, sample: { label: 'matchups', n: 3 }, sources: ['sleeper'] });
    expect(c!.facts).toMatchObject({ opps: ['X1', 'X2', 'X3'], grades: [1.15, 1.2, 1.4], weeks: [6, 7, 8] });
  });
  it('stays quiet when one of the three is 1.14', () => expect(softSchedule(makeInputs(world([1.3, 1.14, 1.3])), TH)).toHaveLength(0));
  it('stays quiet when a grade is unknown', () => expect(softSchedule(makeInputs(world([1.3, null, 1.3])), TH)).toHaveLength(0));
  it('skips the bye and counts the next three games', () => {
    const [c] = softSchedule(makeInputs(world([1.2, 1.2, 1.2], 10, true)), TH);
    expect(c!.facts).toMatchObject({ weeks: [6, 8, 9] });
  });
  it('stays quiet for a player who is not projected to matter', () => expect(softSchedule(makeInputs(world([1.3, 1.3, 1.3], 3)), TH)).toHaveLength(0));
  it('starts after this week once his game has kicked off', () => {
    const w = world([1.3, 1.3, 1.3]);
    w.players[0]!.played = true;
    expect(softSchedule(makeInputs(w), TH)).toHaveLength(0); // week 6 is behind him, so only weeks 7-8 have grades (9 has none)
  });
  it('skips sidelined players', () => expectSidelinedQuiet(() => makeInputs(world([1.3, 1.3, 1.3])), softSchedule, 's1'));
});

describe('waiver_riser', () => {
  /** weeks 2-4 at 50% snaps, week 5 at `last` of 60 */
  const world = (adds: number, last: number, owner = 0): World => ({
    players: [{ pid: 'f1', pos: 'RB', owner }],
    weekly: [...games('f1', () => ({}), [2, 3, 4]), weekRow('f1', 5, { off_snaps: last })],
    trending: [{ player_id: 'f1', count: adds }],
  });
  it('fires with 1,000 adds and +10 points of snap share', () => {
    const [c] = waiverRiser(makeInputs(world(1000, 36)), TH);
    expect(c).toMatchObject({ kind: 'waiver_riser', sample: { label: 'games', n: 3 } });
    expect(c!.facts).toMatchObject({ adds: 1000, measure: 'snap share' });
  });
  it('stays quiet at 999 adds', () => expect(waiverRiser(makeInputs(world(999, 40)), TH)).toHaveLength(0));
  it('stays quiet at +8 points of usage', () => expect(waiverRiser(makeInputs(world(5000, 35)), TH)).toHaveLength(0));
  it('only speaks about free agents', () => expect(waiverRiser(makeInputs(world(5000, 45, 2)), TH)).toHaveLength(0));
  it('can use rush share when snaps are flat', () => {
    const w = world(5000, 30);
    w.weekly = [...games('f1', () => ({ rush_share: 0.2 }), [2, 3, 4]), weekRow('f1', 5, { off_snaps: 30, rush_share: 0.32 })];
    expect(waiverRiser(makeInputs(w), TH)[0]!.facts).toMatchObject({ measure: 'rush share' });
  });
});

describe('dynasty_mover', () => {
  /** 100 skill players worth 3000 whose 30-day changes are -50..+49 */
  const fc = () => Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`d${i}`, fcEntry(`d${i}`, { trend30Day: i - 50, position: ['QB', 'RB', 'WR', 'TE'][i % 4]! })]));
  const world = (o: Partial<World>): World => ({ players: [], isDynasty: true, fc: fc(), ...o });
  it('fires in dynasty leagues for the top and bottom 5%', () => {
    const cs = dynastyMover(makeInputs(world({})), TH);
    expect(cs.filter((c) => c.facts.kind === 'dynasty_mover' && c.facts.up)).toHaveLength(5);
    expect(cs.filter((c) => c.facts.kind === 'dynasty_mover' && !c.facts.up)).toHaveLength(5);
    expect(cs.find((c) => c.pid === 'd99')).toMatchObject({ tone: 'good', sources: ['fantasycalc'], sample: { label: 'players compared', n: 100 } });
    expect(cs.find((c) => c.pid === 'd0')).toMatchObject({ tone: 'bad' });
    expect(cs.find((c) => c.pid === 'd94')).toBeUndefined();
  });
  it('does NOT fire in redraft leagues', () => expect(dynastyMover(makeInputs(world({ isDynasty: false })), TH)).toHaveLength(0));
  it('does nothing without FantasyCalc or with too few players to rank', () => {
    expect(dynastyMover(makeInputs(world({ fc: null })), TH)).toHaveLength(0);
    expect(dynastyMover(makeInputs(world({ fc: Object.fromEntries(Object.entries(fc()).slice(0, 10)) })), TH)).toHaveLength(0);
  });
  it('ignores picks, tiny values and new listings', () => {
    const f = fc();
    f.pk = fcEntry('pk', { position: 'PICK', trend30Day: 9999 });
    f.lo = fcEntry('lo', { value: 20, trend30Day: 5000 });
    f.nw = fcEntry('nw', { value: 900, trend30Day: 900 });
    const cs = dynastyMover(makeInputs(world({ fc: f })), TH);
    expect(cs.map((c) => c.pid)).not.toContain('pk');
    expect(cs.map((c) => c.pid)).not.toContain('lo');
    expect(cs.map((c) => c.pid)).not.toContain('nw');
  });
});

describe('coverage_note', () => {
  const row = (o: Partial<CoverageRow> = {}): CoverageRow => ({
    pid: 'c1', team: 'AAA', routes: 150, tgt: 20, rec: 12, yds: 200, td: 1,
    man_routes: 30, man_tgt: 6, man_rec: 4, man_yds: 60, man_td: 0, zone_routes: 100, zone_tgt: 14, zone_rec: 8, zone_yds: 140, zone_td: 1,
    yprr: 1.3, tprr: 0.13, yprr_man: 2.0, tprr_man: 0.2, yprr_zone: 1.4, tprr_zone: 0.14, ...o,
  });
  const world = (r: CoverageRow, manRate: number | null, isCurrent = false): World => ({
    players: [wr('c1')], weekly: games('c1'),
    coverage: { rows: [r], teams: { BBB: { dropbacks: 600, man: 0, zone: 0, man_rate: manRate, shells: {} } }, isCurrent, season: isCurrent ? '2026' : '2025' },
  });
  it('fires when a man-beater faces a man-heavy defense, labeled last season (2025)', () => {
    const [c] = coverageNote(makeInputs(world(row(), 0.6)), TH);
    expect(c).toMatchObject({ kind: 'coverage_note', tone: 'watch', dataLabel: 'last season (2025)', week: 6, sample: { label: 'routes in the smaller split', n: 30 } });
    expect(c!.facts).toMatchObject({ better: 'man', oppCoverage: 'man', match: true, opp: 'BBB' });
  });
  it('flags a clash: better against zone, opponent plays man', () => {
    const [c] = coverageNote(makeInputs(world(row({ yprr_man: 1.4, yprr_zone: 2.0 }), 0.6)), TH);
    expect(c!.facts).toMatchObject({ better: 'zone', oppCoverage: 'man', match: false });
    expect(c!.dataLabel).toBe('last season (2025)');
  });
  it('stays quiet at a 0.59 yards-per-route gap, a 59% opponent, or under 20 routes', () => {
    expect(coverageNote(makeInputs(world(row({ yprr_man: 1.99, yprr_zone: 1.4 }), 0.6)), TH)).toHaveLength(0);
    expect(coverageNote(makeInputs(world(row(), 0.59)), TH)).toHaveLength(0); // opponent is 59% man, 41% zone
    expect(coverageNote(makeInputs(world(row({ man_routes: 19 }), 0.6)), TH)).toHaveLength(0);
  });
  it('drops the label once the coverage data is this season\'s', () => {
    const [c] = coverageNote(makeInputs(world(row(), 0.6, true)), TH);
    expect(c!.dataLabel).toBeNull();
    expect(c!.tone).toBe('good');
  });
  it('needs the opponent\'s tendency and the coverage file', () => {
    expect(coverageNote(makeInputs(world(row(), null)), TH)).toHaveLength(0);
    expect(coverageNote(makeInputs({ players: [wr('c1')] }), TH)).toHaveLength(0);
  });
  it('skips sidelined players', () => expectSidelinedQuiet(() => makeInputs(world(row(), 0.6)), coverageNote, 'c1'));
});
