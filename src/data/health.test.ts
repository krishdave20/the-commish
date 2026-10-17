// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from './cache.ts';
import type { HealthContext } from './contract.ts';
import { createDataLayer } from './index.ts';
import { draft, fakeTransport, league, leagueUser, nflState, ok, roster, status, type FakeTransport } from './test-helpers.ts';
import { fantasyCalcUrl, sleeperUrls } from './urls.ts';
import type { NflverseManifest, NflverseSource } from './nflverseTypes.ts';

const ctx: HealthContext = { season: '2026', week: 6, username: 'bob', userId: '7', leagueId: 'L1' };
const NOW = Date.parse('2026-10-16T12:00:00Z');
const MANIFEST_URL = './data/nflverse/manifest.json';
let t: FakeTransport;
let clock: number;

const source = (id: NflverseSource['id'], name: string, season: number | null = 2026): NflverseSource => ({
  id, name, url: `https://github.com/nflverse/nflverse-data/releases/download/x/${name}`, season, etag: '"abc"', lastModified: 'Fri, 16 Oct 2026 11:04:00 GMT', bytes: 5_000_000, fromCache: false,
});
/** a manifest as the nightly job writes it, built `ageH` hours before the test clock */
const manifest = (over: Partial<NflverseManifest> = {}, ageH = 3): NflverseManifest => ({
  schema: 1, generatedAt: new Date(NOW - ageH * 3_600_000).toISOString(), season: 2026, seasonsCovered: [2026], throughWeek: 6,
  participationSeason: 2025, participationIsCurrent: false, routesDefinition: 'proxy', definitions: {},
  sources: [source('pbp', 'play_by_play_2026.csv.gz'), source('snap_counts', 'snap_counts_2026.csv'), source('ftn_charting', 'ftn_charting_2026.csv'),
    source('players', 'players.csv', null), source('pbp_participation', 'pbp_participation_2025.csv', 2025), source('sleeper_players', 'sleeper_players.json', null)],
  files: {}, xtd: { available: true, fitSeason: 2025, version: 1 }, matchMethods: { gsis: 100, espn: 80, name_team_pos: 380, name_pos: 40 }, matched: 600,
  unmatchedCount: 0, ftnJoinRate: 0.98, attribution: 'x', ...over,
});
const mk = () => createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
const withManifest = (m: NflverseManifest) => t.set(MANIFEST_URL, ok(m));
const byId = (rs: Awaited<ReturnType<ReturnType<typeof mk>['api']['healthChecks']>>) => Object.fromEntries(rs.map((r) => [r.id, r]));

/* a transport where every endpoint answers correctly */
function healthy(): FakeTransport {
  return fakeTransport([
    [sleeperUrls.state(), ok(nflState())],
    [sleeperUrls.user('bob'), ok({ user_id: '7', display_name: 'Bob', avatar: null })],
    [sleeperUrls.userLeagues('7', '2026'), ok([league()])],
    [sleeperUrls.league('L1'), ok(league())],
    [sleeperUrls.rosters('L1'), ok([roster(1), roster(2)])],
    [sleeperUrls.users('L1'), ok([leagueUser(1), leagueUser(2)])],
    [sleeperUrls.matchups('L1', 6), ok([{ roster_id: 1, matchup_id: 1, points: 10 }])],
    [sleeperUrls.transactions('L1', 5), ok([])],
    [sleeperUrls.tradedPicks('L1'), ok([])],
    [sleeperUrls.drafts('L1'), ok([draft()])],
    [sleeperUrls.draft('D1'), ok(draft())],
    [sleeperUrls.draftPicks('D1'), ok([{ round: 1, pick_no: 1, player_id: '1', roster_id: 1 }])],
    [sleeperUrls.draftTradedPicks('D1'), ok([])],
    [sleeperUrls.players(), ok({ '1': { player_id: '1', team: 'KC', position: 'QB' } }, 14_000_000)],
    [sleeperUrls.trending('add'), ok([{ player_id: '1', count: 5 }])],
    [sleeperUrls.trending('drop'), ok([{ player_id: '1', count: 5 }])],
    [sleeperUrls.stats('2026', 5), ok({ '1': { pts_ppr: 12 } })],
    [sleeperUrls.projections('2026', 6), ok([{ player_id: '1', stats: { pts_ppr: 12 } }])],
    [sleeperUrls.seasonProjections('2026'), ok([{ player_id: '1', stats: { adp_ppr: 4 } }])],
    [sleeperUrls.schedule('2026'), ok([{ week: 1, home: 'KC', away: 'BUF' }])],
    [fantasyCalcUrl({ isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 }), ok([{ player: { sleeperId: '1' }, value: 9000 }])],
    [fantasyCalcUrl({ isDynasty: false, numQbs: 1, numTeams: 12, ppr: 1 }), ok([{ player: { sleeperId: '1' }, value: 8000 }])],
    [MANIFEST_URL, ok(manifest())],
  ]);
}

beforeEach(() => { clock = NOW; t = healthy(); });

describe('health checks', () => {
  it('everything works: ok across Sleeper, FantasyCalc and nflverse; 2025 participation is a warn', async () => {
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(Object.keys(rs)).toHaveLength(30);
    for (const r of Object.values(rs)) {
      if (r.id === 'nflverse.participation') continue;
      expect(r.level, `${r.id}: ${r.message}`).toBe('ok');
    }
    expect(rs['nflverse.participation'].level).toBe('warn');
    expect(rs['nflverse.participation'].message).toMatch(/2025, labeled last season; 2026 not published yet/i);
    expect(rs['sleeper.stats'].documented).toBe(false);
    expect(rs['sleeper.state'].documented).toBe(true);
    expect(rs['fantasycalc.dynasty'].source).toBe('fantasycalc');
    expect(rs['sleeper.state'].url).toBe(sleeperUrls.state());
    expect(rs['sleeper.state'].checkedAt).toBe(clock);
    expect(rs['nflverse.pbp'].source).toBe('nflverse');
  });

  describe('nflverse rows read the nightly job, never GitHub', () => {
    it('one live manifest read serves every row, with no call to GitHub', async () => {
      await mk().api.healthChecks(ctx);
      expect(t.count(MANIFEST_URL)).toBe(1);
      expect(t.calls.filter((c) => c.url.includes('github.com'))).toHaveLength(0);
      expect(t.calls.every((c) => c.method === 'GET')).toBe(true);
    });

    it('a cached manifest does not hide a missing one: the check always goes live', async () => {
      const layer = mk();
      await layer.nflverse.manifest();
      t.set(MANIFEST_URL, status(404));
      const rs = byId(await layer.api.healthChecks(ctx));
      expect(rs['nflverse.manifest'].level).toBe('fail');
    });

    it('no manifest: the manifest row fails with the command to run; the rows that depend on it are skipped warns', async () => {
      t.set(MANIFEST_URL, status(404));
      const rs = byId(await mk().api.healthChecks(ctx));
      expect(rs['nflverse.manifest']).toMatchObject({ level: 'fail', httpStatus: 404 });
      expect(rs['nflverse.manifest'].message).toMatch(/npm run data:nflverse/);
      for (const id of ['nflverse.age', 'nflverse.pbp', 'nflverse.snapCounts', 'nflverse.ftn', 'nflverse.players', 'nflverse.participation', 'nflverse.unmatched']) {
        expect(rs[id].level, id).toBe('warn');
        expect(rs[id].message).toMatch(/skipped/i);
      }
      // the Sleeper rows are untouched
      expect(rs['sleeper.league'].level).toBe('ok');
    });

    it('the dev server answering with index.html counts as no manifest, not a crash', async () => {
      t.set(MANIFEST_URL, ok('<!doctype html><html></html>'));
      const rs = byId(await mk().api.healthChecks(ctx));
      expect(rs['nflverse.manifest'].level).toBe('fail');
    });

    it('age: ok under 36 h, warn under 7 days, fail beyond', async () => {
      for (const [h, level] of [[2, 'ok'], [35, 'ok'], [37, 'warn'], [6 * 24, 'warn'], [8 * 24, 'fail']] as const) {
        withManifest(manifest({}, h));
        const rs = byId(await mk().api.healthChecks(ctx));
        expect(rs['nflverse.age'].level, `${h} h`).toBe(level);
      }
      withManifest(manifest({}, 10));
      expect(byId(await mk().api.healthChecks(ctx))['nflverse.age'].message).toBe('Updated 10 h ago.');
      withManifest(manifest({}, 9 * 24));
      expect(byId(await mk().api.healthChecks(ctx))['nflverse.age'].message).toMatch(/9 days ago/);
    });

    it('each source file must be in the manifest', async () => {
      withManifest(manifest({ sources: manifest().sources.filter((s) => s.id !== 'ftn_charting' && s.id !== 'snap_counts') }));
      const rs = byId(await mk().api.healthChecks(ctx));
      expect(rs['nflverse.ftn']).toMatchObject({ level: 'fail' });
      expect(rs['nflverse.ftn'].message).toMatch(/blitz, play-action/i);
      expect(rs['nflverse.snapCounts'].level).toBe('fail');
      expect(rs['nflverse.pbp'].level).toBe('ok');
      expect(rs['nflverse.pbp'].url).toMatch(/play_by_play_2026/);
    });

    it('participation: warn while it is last season, ok once the current season is published, fail if absent', async () => {
      withManifest(manifest({ participationSeason: 2026, participationIsCurrent: true, sources: manifest().sources.map((s) => (s.id === 'pbp_participation' ? source('pbp_participation', 'pbp_participation_2026.csv', 2026) : s)) }));
      expect((byId(await mk().api.healthChecks(ctx)))['nflverse.participation'].level).toBe('ok');
      withManifest(manifest({ sources: manifest().sources.filter((s) => s.id !== 'pbp_participation') }));
      expect((byId(await mk().api.healthChecks(ctx)))['nflverse.participation'].level).toBe('fail');
    });

    it('unmatched players: ok at 0, warn with the count above 0', async () => {
      withManifest(manifest({ unmatchedCount: 1 }));
      let r = byId(await mk().api.healthChecks(ctx))['nflverse.unmatched'];
      expect(r.level).toBe('warn');
      expect(r.message).toMatch(/^1 player with snaps or targets could not be joined/);
      withManifest(manifest({ unmatchedCount: 7 }));
      r = byId(await mk().api.healthChecks(ctx))['nflverse.unmatched'];
      expect(r.message).toMatch(/^7 players with snaps or targets/);
      expect(r.message).toMatch(/600 Sleeper players joined \(100 by gsis_id, 80 by espn_id, 420 by name\)/);
    });

    it('a manifest built for another season is a warn on the manifest row', async () => {
      withManifest(manifest({ season: 2025 }));
      const r = byId(await mk().api.healthChecks(ctx))['nflverse.manifest'];
      expect(r.level).toBe('warn');
      expect(r.message).toMatch(/built 2025, but the app is on 2026/);
    });
  });

  it('a failing undocumented endpoint is a fail that names the features it feeds', async () => {
    t.set(sleeperUrls.stats('2026', 5), status(500));
    t.set(sleeperUrls.projections('2026', 6), ok({ not: 'a list' }));
    t.set(sleeperUrls.seasonProjections('2026'), () => { throw new TypeError('Failed to fetch'); });
    t.set(sleeperUrls.schedule('2026'), ok([{ wk: 1 }]));
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(rs['sleeper.stats']).toMatchObject({ level: 'fail', httpStatus: 500 });
    expect(rs['sleeper.stats'].message).toMatch(/usage splits and floors\/ceilings/i);
    expect(rs['sleeper.projections'].level).toBe('fail');
    expect(rs['sleeper.projections'].message).toMatch(/player means/i);
    expect(rs['sleeper.seasonProjections'].level).toBe('fail');
    expect(rs['sleeper.seasonProjections'].message).toMatch(/draft rankings and ADP/i);
    expect(rs['sleeper.schedule'].level).toBe('fail');
    expect(rs['sleeper.schedule'].message).toMatch(/matchup grades/i);
    // the rest still reports ok
    expect(rs['sleeper.league'].level).toBe('ok');
  });

  it('well-formed but empty stats are a warn, not a fail', async () => {
    t.set(sleeperUrls.stats('2026', 5), ok({}));
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(rs['sleeper.stats'].level).toBe('warn');
  });

  it('an unknown username (200 null) is a fail on the user row', async () => {
    t.set(sleeperUrls.user('bob'), ok(null));
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(rs['sleeper.user'].level).toBe('fail');
  });

  it('FantasyCalc down is a fail that says the rest keeps working', async () => {
    t.set(fantasyCalcUrl({ isDynasty: true, numQbs: 1, numTeams: 12, ppr: 1 }), status(503));
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(rs['fantasycalc.dynasty'].level).toBe('fail');
    expect(rs['fantasycalc.dynasty'].message).toMatch(/everything else keeps working/);
    expect(rs['fantasycalc.redraft'].level).toBe('ok');
  });

  it('missing context skips those rows with a warn instead of failing', async () => {
    const rs = byId(await mk().api.healthChecks({ season: '2026', week: 6 }));
    expect(rs['sleeper.rosters']).toMatchObject({ level: 'warn' });
    expect(rs['sleeper.user'].message).toMatch(/skipped/i);
    expect(rs['sleeper.draft'].level).toBe('warn');
    expect(rs['sleeper.state'].level).toBe('ok');
  });

  it('uses ctx.draftId when given, instead of the league drafts list', async () => {
    t.set(sleeperUrls.draft('D9'), ok(draft({ draft_id: 'D9' })));
    t.set(sleeperUrls.draftPicks('D9'), ok([]));
    t.set(sleeperUrls.draftTradedPicks('D9'), ok([]));
    await mk().api.healthChecks({ ...ctx, draftId: 'D9' });
    expect(t.count(sleeperUrls.draft('D9'))).toBe(1);
    expect(t.count(sleeperUrls.draft('D1'))).toBe(0);
  });

  it('all calls go through the limiter', async () => {
    const layer = mk();
    const spy = vi.spyOn(layer.limiter, 'run');
    await layer.api.healthChecks(ctx);
    // 21 direct Sleeper/FantasyCalc probes + the players file + the nflverse manifest
    expect(spy).toHaveBeenCalledTimes(23);
  });

  describe('the 14 MB players file', () => {
    it('is fetched once when the cache is empty, then reused', async () => {
      const layer = mk();
      await layer.api.healthChecks(ctx);
      await layer.api.healthChecks(ctx);
      expect(t.count(sleeperUrls.players())).toBe(1);
      const r = byId(await layer.api.healthChecks(ctx))['sleeper.players'];
      expect(r.level).toBe('ok');
      expect(r.message).toMatch(/from the cache/);
    });

    it('is not fetched at all when a fresh copy is cached', async () => {
      const layer = mk();
      await layer.sleeper.players();
      t.calls.length = 0;
      const r = byId(await layer.api.healthChecks(ctx))['sleeper.players'];
      expect(t.count(sleeperUrls.players())).toBe(0);
      expect(r.level).toBe('ok');
    });

    it('failing with no cache is a fail naming player names, injuries and ID joins', async () => {
      t.set(sleeperUrls.players(), status(500));
      const r = byId(await mk().api.healthChecks(ctx))['sleeper.players'];
      expect(r.level).toBe('fail');
      expect(r.message).toMatch(/ID joins/);
    });
  });
});
