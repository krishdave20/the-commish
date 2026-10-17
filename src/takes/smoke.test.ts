// @vitest-environment node
/* Smoke test on real data: the saved league fixture (reference/fixture) plus the nflverse JSON that the nightly job
   writes to public/data/nflverse/. That folder is generated, so it may be absent (CI); the test then skips and says so. */
import { describe, expect, it } from 'vitest';
import { createCache } from '../data/cache.ts';
import { fixtureDirSource } from '../data/fixtureNode.ts';
import { createDataLayer } from '../data/index.ts';
import { decodeColumnar } from '../data/nflverse.ts';
import type { CoverageRow, NflverseManifest, PlayerSeason, PlayerWeek, TeamWeek } from '../data/nflverseTypes.ts';
import { fixtureTransport } from '../data/transport.ts';
import { fantasyCalcParams, joinFantasyCalc } from '../engine/draft/fantasycalc.ts';
import { FIXTURE_DIR, fixtureModel } from '../engine/test-helpers.ts';
import { buildTakes, validateTake } from './index.ts';
import type { TakeInputs } from './types.ts';

interface NodeFs { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string }
async function nodeFs(): Promise<NodeFs> {
  const name = 'node:fs';
  return (await import(/* @vite-ignore */ name)) as unknown as NodeFs;
}
const NV_DIR = decodeURIComponent(new URL('../../public/data/nflverse/', import.meta.url).pathname);
const fs = await nodeFs();
const have = fs.existsSync(`${NV_DIR}manifest.json`) && fs.existsSync(`${NV_DIR}coverage_2025.json`);
if (!have) console.info(`[takes smoke] skipped: no nflverse JSON in ${NV_DIR} (run \`npm run data:nflverse\` to generate it)`);

const json = (f: string) => JSON.parse(fs.readFileSync(`${NV_DIR}${f}`, 'utf8'));

describe.skipIf(!have)('takes on the saved fixture + local nflverse files', () => {
  async function inputs(isDynasty: boolean): Promise<TakeInputs> {
    const src = await fixtureDirSource(FIXTURE_DIR);
    const layer = createDataLayer({ transport: fixtureTransport(src), cache: createCache({ memoryOnly: true }) });
    const { model, pull } = await fixtureModel();
    const league = (await layer.sleeper.league(src.manifest.league_id)).data;
    const fc = joinFantasyCalc((await layer.sleeper.fantasyCalc({ ...fantasyCalcParams(league), isDynasty })).data);
    const manifest = json('manifest.json') as NflverseManifest;
    const cov = json(`coverage_${manifest.participationSeason}.json`);
    return {
      season: String(manifest.season), week: model.meta.currentWeek, model,
      nflverse: {
        manifest, weekly: decodeColumnar<PlayerWeek>(json(`weekly_${manifest.season}.json`)), season: decodeColumnar<PlayerSeason>(json(`season_${manifest.season}.json`)),
        teams: decodeColumnar<TeamWeek>(json(`teams_${manifest.season}.json`)),
        coverage: { rows: decodeColumnar<CoverageRow>(cov), teams: cov.teams, isCurrent: cov.isCurrent, season: String(cov.season) },
      },
      trendingAdds: pull.trending, fantasyCalc: fc, isDynasty, watchlist: [], tradeTargets: [],
    };
  }

  it('builds a sensible, valid feed for the redraft fixture league', async () => {
    const takes = buildTakes(await inputs(false));
    console.info(`[takes smoke] ${takes.length} takes; by kind: ${JSON.stringify(Object.fromEntries([...new Set(takes.map((t) => t.kind))].map((k) => [k, takes.filter((t) => t.kind === k).length])))}`);
    console.info('[takes smoke] top 10:\n' + takes.slice(0, 10).map((t, i) => `${i + 1}. [${t.relevance}/${t.tone}] ${t.headline}\n     ${t.statLine}${t.whyForYou ? `\n     for you: ${t.whyForYou}` : ''}${t.trackRecord ? `\n     ${t.trackRecord}` : ''}`).join('\n'));
    expect(takes.length).toBeGreaterThanOrEqual(10);
    expect(takes.length).toBeLessThanOrEqual(200);
    for (const t of takes) expect(validateTake(t), `${t.id}: ${t.headline}`).toEqual([]);
    expect(new Set(takes.map((t) => t.id)).size).toBe(takes.length);
    expect(takes.some((t) => t.kind === 'dynasty_mover')).toBe(false);
    expect(takes.filter((t) => t.kind === 'coverage_note').every((t) => t.relevance !== 'league')).toBe(true);
    for (const t of takes.filter((t) => t.kind === 'coverage_note')) expect(t.dataLabel).toBe('last season (2025)');
    // at most 3 per player per week
    const per = new Map<string, number>();
    for (const t of takes) per.set(`${t.pid}:${t.week}`, (per.get(`${t.pid}:${t.week}`) ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(3);
    // no NaN/undefined anywhere in any string, including nested
    expect(JSON.stringify(takes)).not.toMatch(/NaN|undefined|Infinity/);
    expect(takes.some((t) => t.relevance === 'mine')).toBe(true);
  });

  it('adds dynasty movers only when the league is dynasty', async () => {
    const dyn = buildTakes(await inputs(true));
    expect(dyn.filter((t) => t.kind === 'dynasty_mover').length).toBeGreaterThan(0);
    for (const t of dyn) expect(validateTake(t)).toEqual([]);
  });
});
