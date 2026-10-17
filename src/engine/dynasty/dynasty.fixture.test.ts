// @vitest-environment node
/* The league's real FantasyCalc dynasty response (reference/fixture/fantasycalc_dynasty.json.gz), real rosters, players
   file and traded picks: pick rows map to owned picks, and the whole league gets a value and a label. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../../data/cache.ts';
import { createDataLayer } from '../../data/index.ts';
import { fixtureTransport } from '../../data/transport.ts';
import type { PlayersMap, FantasyCalcRow } from '../../data/types.ts';
import { ageOf } from '../../app/playersIndex.ts';
import { fantasyCalcParams, joinFantasyCalc } from '../draft/fantasycalc.ts';
import { fixtureModel } from '../test-helpers.ts';
import { buildDynasty, teamsNow, type DynastyLeague } from './league.ts';
import { indexFcPicks, parsePickId, pickPrice } from './picks.ts';

let dynasty: FantasyCalcRow[], d: DynastyLeague, byId: ReturnType<typeof joinFantasyCalc>;
let players: PlayersMap;
let model: Awaited<ReturnType<typeof fixtureModel>>['model'];

beforeAll(async () => {
  const fx = await fixtureModel();
  model = fx.model;
  const layer = createDataLayer({ transport: fixtureTransport(fx.src), cache: createCache({ memoryOnly: true }) });
  const league = fx.pull.league;
  dynasty = (await layer.sleeper.fantasyCalc({ ...fantasyCalcParams(league), isDynasty: true })).data;
  byId = joinFantasyCalc(dynasty);
  players = (await layer.sleeper.players()).data;
  const tradedPicks = (await layer.sleeper.tradedPicks(fx.manifest.league_id)).data;
  const rosters: Record<number, string[]> = {};
  for (const r of fx.pull.rosters) rosters[r.roster_id] = r.players ?? [];
  const asOf = fx.manifest.captured_at as number;
  d = buildDynasty({
    teams: teamsNow(model), rosters, fc: byId, tradedPicks, league: league as never,
    facts: (pid) => { const rec = players[pid]; return rec ? { age: ageOf(rec, asOf), pos: rec.position ?? undefined } : null; },
  });
});

describe('real FantasyCalc dynasty picks', () => {
  it('every pick row id parses to a season, round and bucket', () => {
    const pickRows = dynasty.filter((r) => r.player.position === 'PICK');
    expect(pickRows).toHaveLength(24);
    for (const r of pickRows) expect(parsePickId(String(r.player.sleeperId))).not.toBeNull();
    const idx = indexFcPicks(byId)!;
    expect(idx.seasons).toEqual([2027, 2028, 2029]);
    expect(idx.maxRound.get(2027)).toBe(4);
    expect(idx.slots.size).toBe(24);
  });
  it('maps next-draft picks to the bucketed rows and later ones to the plain rows, exact', () => {
    const idx = indexFcPicks(byId)!;
    expect(pickPrice(idx, '2027', 1, 'early')).toEqual({ value: 4625, fcId: 'FP_2027_early_0', estimated: false });
    expect(pickPrice(idx, '2027', 2, 'mid')).toEqual({ value: 1550, fcId: 'FP_2027_mid_1', estimated: false });
    expect(pickPrice(idx, '2028', 1, 'mid')).toEqual({ value: 2059, fcId: 'FP_2028_1', estimated: false });
    expect(pickPrice(idx, '2029', 4, 'mid')).toMatchObject({ value: 751, estimated: false });
  });
  it('flags a 5th-round pick and a 2030 pick as estimates', () => {
    const idx = indexFcPicks(byId)!;
    expect(pickPrice(idx, '2027', 5, 'mid')).toMatchObject({ estimated: true, fcId: 'FP_2027_mid_3' });
    expect(pickPrice(idx, '2030', 1, 'mid')).toMatchObject({ estimated: true, fcId: 'FP_2029_1' });
  });
});

describe('the real league, in dynasty terms', () => {
  it('prices the league\'s own 3 rounds × 3 drafts for each of its 12 teams, all from FantasyCalc rows', () => {
    expect(d.seasons).toEqual(['2027', '2028', '2029']);
    expect(d.rounds).toBe(3);
    for (const t of model.teams) {
      const picks = d.picks[t.rid]!;
      expect(picks).toHaveLength(9);
      expect(picks.every((p) => p.value !== null && p.value > 0 && !p.estimated && !p.acquired)).toBe(true);
    }
  });
  it('splits the 12 teams into four early, four mid and four late slots for the next draft', () => {
    const b = Object.values(d.buckets);
    expect([b.filter((x) => x === 'early').length, b.filter((x) => x === 'mid').length, b.filter((x) => x === 'late').length]).toEqual([4, 4, 4]);
  });
  it('values every roster and labels every team', () => {
    expect(d.lens).toHaveLength(12);
    for (const t of model.teams) {
      const v = d.values[t.rid]!;
      expect(v.players).toBeGreaterThan(10000);
      expect(v.total).toBeCloseTo(v.players + v.picks, 6);
      expect(v.youthShare).toBeGreaterThanOrEqual(0);
      expect(v.youthShare).toBeLessThanOrEqual(1);
      expect(Object.values(v.byPosition).reduce((s, x) => s + x, 0)).toBeCloseTo(v.players, 6);
    }
    const labels = new Set(d.lens.map((x) => x.label));
    expect(labels.size).toBeGreaterThanOrEqual(2);
  });
});
