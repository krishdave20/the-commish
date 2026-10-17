// @vitest-environment node
/* Real FantasyCalc responses saved in reference/fixture/ (captured with `fixture:capture -- --only fantasycalc`). */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../../data/cache.ts';
import type { SleeperLeague } from '../../data/contract.ts';
import { fixtureDirSource } from '../../data/fixtureNode.ts';
import { createDataLayer } from '../../data/index.ts';
import { fixtureTransport } from '../../data/transport.ts';
import type { FantasyCalcRow, ProjectionRow } from '../../data/types.ts';
import { fantasyCalcUrl } from '../../data/urls.ts';
import { FIXTURE_DIR } from '../test-helpers.ts';
import { fantasyCalcParams, joinFantasyCalc, loadFantasyCalc } from './fantasycalc.ts';
import { buildRankings } from './rankings.ts';

let league: SleeperLeague, layer: ReturnType<typeof createDataLayer>;
let redraft: FantasyCalcRow[], dynasty: FantasyCalcRow[], projections: ProjectionRow[];

beforeAll(async () => {
  const src = await fixtureDirSource(FIXTURE_DIR);
  const m = src.manifest;
  layer = createDataLayer({ transport: fixtureTransport(src), cache: createCache({ memoryOnly: true }) });
  league = (await layer.sleeper.league(m.league_id)).data;
  const p = fantasyCalcParams(league);
  redraft = (await layer.sleeper.fantasyCalc({ ...p, isDynasty: false })).data;
  dynasty = (await layer.sleeper.fantasyCalc({ ...p, isDynasty: true })).data;
  projections = (await layer.sleeper.seasonProjections(m.season)).data;
});

describe('FantasyCalc rows captured from the real API', () => {
  it('the fixture holds the league\'s own params and the isDynasty=true variant', () => {
    const p = fantasyCalcParams(league);
    expect(fantasyCalcUrl(p)).toMatch(/^https:\/\/api\.fantasycalc\.com\/values\/current\?isDynasty=(true|false)&numQbs=\d&numTeams=\d+&ppr=[01.5]+$/);
    expect(redraft.length).toBeGreaterThan(100);
    expect(dynasty.length).toBeGreaterThan(redraft.length); // dynasty lists rookies, picks and prospects too
  });
  it('joinFantasyCalc maps real rows to Sleeper ids with value, ranks and trend30Day', () => {
    const j = joinFantasyCalc(redraft);
    const ids = Object.keys(j);
    expect(ids.length).toBeGreaterThan(100);
    expect(ids.length).toBeLessThanOrEqual(redraft.length);
    for (const e of Object.values(j)) {
      expect(e.sleeperId).toMatch(/^\d+$/);
      expect(e.value).toBeGreaterThan(0);
      expect(e.name.length).toBeGreaterThan(0);
      expect(typeof e.overallRank).toBe('number');
      expect(typeof e.positionRank).toBe('number');
    }
    // trend30Day is present on the real rows (not just the optional fallback field)
    const withTrend = redraft.filter((r) => typeof (r as Record<string, unknown>).trend30Day === 'number').length;
    expect(withTrend).toBe(redraft.length);
    expect(Object.values(j).every((e) => typeof e.trend30Day === 'number')).toBe(true);
    const top = Object.values(j).sort((a, b) => a.overallRank! - b.overallRank!)[0]!;
    expect(top.value).toBe(Math.max(...Object.values(j).map((e) => e.value)));
  });
  it('most FantasyCalc players join to Sleeper\'s season projections', () => {
    const j = joinFantasyCalc(redraft);
    const have = new Set(projections.map((r) => r.player_id));
    const hit = Object.keys(j).filter((id) => have.has(id)).length;
    expect(hit / Object.keys(j).length).toBeGreaterThan(0.9);
  });
  it('dynasty rows join too; draft picks come through under FantasyCalc\'s own ids with position PICK', () => {
    const j = joinFantasyCalc(dynasty);
    expect(Object.keys(j).length).toBeGreaterThan(Object.keys(joinFantasyCalc(redraft)).length);
    const picks = Object.values(j).filter((e) => e.position === 'PICK');
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((e) => !/^\d+$/.test(e.sleeperId) && e.value > 0)).toBe(true);
    expect(Object.values(j).filter((e) => e.position !== 'PICK').every((e) => /^\d+$/.test(e.sleeperId))).toBe(true);
  });
  it('loadFantasyCalc works against the fixture for the league\'s params, and blends into a startup ranking', async () => {
    const r = await loadFantasyCalc(layer.sleeper, league);
    expect(r.ok).toBe(true);
    expect(r.params).toEqual(fantasyCalcParams(league));
    const startup = buildRankings({ projections, league: { ...league, settings: { ...league.settings, type: 2 } }, mode: 'startup', fantasyCalc: r.byId });
    expect(startup.rows.filter((x) => x.fc).length).toBeGreaterThan(100);
    expect(startup.rows.every((x, i) => x.rank === i + 1)).toBe(true);
  });
});
