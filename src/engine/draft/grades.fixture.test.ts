// @vitest-environment node
/* Draft grades and team ratings on the saved pull (reference/fixture/): the real 180-pick draft, graded for all 12 teams, and the
   power ratings from the saved rosters. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../../data/cache.ts';
import type { SleeperLeague } from '../../data/contract.ts';
import { createDataLayer } from '../../data/index.ts';
import { fixtureTransport } from '../../data/transport.ts';
import { makeScorer } from '../model.ts';
import { fixtureModel } from '../test-helpers.ts';
import type { Model } from '../types.ts';
import { gradeDraft, playerPerformance, showLetter } from './grades.ts';
import type { DraftGrades } from './grades.ts';
import { loadDraftInputs } from './load.ts';
import { rateTeams } from './ratings.ts';
import type { Ratings } from './ratings.ts';
import { buildRankings } from './rankings.ts';

let model: Model, league: SleeperLeague, grades: DraftGrades, ratings: Ratings;

beforeAll(async () => {
  const fx = await fixtureModel();
  model = fx.model;
  const layer = createDataLayer({ transport: fixtureTransport(fx.src), cache: createCache({ memoryOnly: true }) });
  league = (await layer.sleeper.league(fx.manifest.league_id)).data;
  const inputs = await loadDraftInputs(layer.sleeper, league);
  const rankings = buildRankings({ projections: inputs.projections, league, mode: inputs.mode, fantasyCalc: null });
  const rosters: Record<number, string[]> = {};
  for (const t of model.teams) rosters[t.rid] = [];
  for (const p of model.players) if (p.ownerRid > 0) rosters[p.ownerRid]!.push(p.pid);
  const performance = playerPerformance(inputs.picks.map((p) => p.player_id), model, { stats: fx.pull.stats, score: makeScorer(league.scoring_settings ?? {}) });
  const field = playerPerformance(model.players.map((p) => p.pid), model);
  const pool = model.players.map((p) => ({ pos: p.pos, total: (field[p.pid]?.toDate ?? 0) + (field[p.pid]?.ros ?? 0) }));
  grades = gradeDraft({ rankings, picks: inputs.picks, performance, rosters, pool, rosterIds: model.teams.map((t) => t.rid) });
  ratings = rateTeams({ model });
});

describe('draft grades on the saved draft', () => {
  it('grades all 12 teams on all 180 picks, 15 each', () => {
    expect(grades.picks).toHaveLength(180);
    expect(grades.teams).toHaveLength(12);
    expect(grades.teams.every((t) => t.picks.length === 15)).toBe(true);
    expect(grades.rounds).toBe(15);
    expect(grades.bestByRound).toHaveLength(15);
  });
  it('ranks run 1..12 on both grades, with a letter for each', () => {
    for (const k of ['draftDay', 'hindsight'] as const) {
      expect(grades.teams.map((t) => t[k].rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    }
    expect(grades.teams.every((t) => /^[A-F][+-]?$/.test(t.draftDay.letter) && /^[A-F][+-]?$/.test(t.hindsight.letter))).toBe(true);
  });
  it('the expectation curve never rises, and about as many picks beat it as miss it', () => {
    for (let i = 1; i < grades.curve.length; i++) expect(grades.curve[i]!).toBeLessThanOrEqual(grades.curve[i - 1]!);
    const beat = grades.picks.filter((p) => p.overExp > 0).length / grades.picks.length;
    console.log(`[grades] share of picks over expectation: ${(beat * 100).toFixed(0)}%`);
    expect(beat).toBeGreaterThan(0.3);
    expect(beat).toBeLessThan(0.6);
  });
  it('every pick is kept, traded or dropped, and most are still with the team that drafted them', () => {
    const kept = grades.picks.filter((p) => p.status === 'kept').length;
    expect(kept).toBeGreaterThan(60);
    expect(grades.picks.every((p) => ['kept', 'traded', 'dropped'].includes(p.status))).toBe(true);
  });
  it('has steals, busts and a got-away pick for most teams', () => {
    expect(grades.steals).toHaveLength(5);
    expect(grades.busts).toHaveLength(5);
    expect(grades.teams.filter((t) => t.gotAway).length).toBeGreaterThan(6);
  });
  it('prints the owner\'s team', () => {
    const me = grades.teams.find((t) => t.rosterId === model.meRid)!;
    const nm = (rid: number) => model.teams.find((t) => t.rid === rid)!.team;
    const f = (p: typeof me.best) => (p ? `${p.name} (${p.pos} ${p.pickNo}: ${p.overExp.toFixed(0)} pts)` : '-');
    console.log(`[grades] ${nm(me.rosterId)}: draft day ${showLetter(me.draftDay.letter)} (#${me.draftDay.rank}) -> hindsight ${showLetter(me.hindsight.letter)} (#${me.hindsight.rank}); best ${f(me.best)}; worst ${f(me.worst)}; kept ${me.kept}/15`);
    console.log('[grades] league order:\n' + grades.teams.map((t) => `${t.hindsight.rank}. ${nm(t.rosterId)} ${showLetter(t.draftDay.letter)} -> ${showLetter(t.hindsight.letter)} ${t.hindsight.overExp.toFixed(0)}`).join('\n'));
    expect(me).toBeDefined();
  });
});

describe('team ratings on the saved rosters', () => {
  it('rates all 12 teams, best power first, with the four position groups plus flex', () => {
    expect(ratings.teams).toHaveLength(12);
    expect(ratings.teams.map((t) => t.powerRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ratings.groups).toEqual(['QB', 'RB', 'WR', 'TE', 'FLEX']);
    expect(ratings.teams.every((t) => t.groups.length === 5 && t.need !== null)).toBe(true);
    expect(ratings.dynasty).toBe(false);
    expect(ratings.teams.every((t) => t.dynasty === null)).toBe(true);
  });
  it('ROS strength is the model\'s own expected points over the remaining weeks', () => {
    const { currentWeek: cur, lastRegularWeek: last } = model.meta;
    expect(ratings.weeks).toEqual(Array.from({ length: last - cur + 1 }, (_, i) => cur + i));
    for (const t of ratings.teams) expect(t.rosPts).toBeGreaterThan(0);
    // week-by-week the total tracks the model's team.exp (the current week exactly; later weeks agree to a point or two of rounding)
    const mt = model.teams.find((x) => x.rid === ratings.teams[0]!.rid)!;
    const direct = ratings.weeks.reduce((s, w) => s + mt.exp[w]!, 0);
    expect(Math.abs(ratings.teams[0]!.rosPts - direct)).toBeLessThan(ratings.weeks.length);
  });
  it('prints the top three', () => {
    console.log('[ratings] top 3:\n' + ratings.teams.slice(0, 3).map((t) => `${t.powerRank}. ${t.team} power ${t.power.toFixed(1)} roster says ${t.powerRank}, record says ${t.recordRank} (${t.delta >= 0 ? '+' : ''}${t.delta}) need ${t.need} surplus ${t.surplus}`).join('\n'));
    expect(ratings.teams[0]!.power).toBeGreaterThan(ratings.teams[11]!.power);
  });
});

it('the league is a redraft league', () => {
  expect(league.settings.type).not.toBe(2);
});
