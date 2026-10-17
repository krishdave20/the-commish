// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from './cache.ts';
import type { HealthContext } from './contract.ts';
import { createDataLayer } from './index.ts';
import { draft, fakeTransport, league, leagueUser, nflState, ok, roster, status, type FakeTransport } from './test-helpers.ts';
import { fantasyCalcUrl, nflverseUrls, sleeperUrls } from './urls.ts';

const ctx: HealthContext = { season: '2026', week: 6, username: 'bob', userId: '7', leagueId: 'L1' };
let t: FakeTransport;
let clock: number;
const mk = () => createDataLayer({ transport: t, cache: createCache({ memoryOnly: true }), now: () => clock });
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
    [/nflverse-data\/releases\/download\//, ok(null, 5_000_000)],
    [nflverseUrls.participation('2026'), status(404)],
  ]);
}

beforeEach(() => { clock = 5_000_000; t = healthy(); });

describe('health checks', () => {
  it('everything works: ok across Sleeper and FantasyCalc, 2026 participation is a warn', async () => {
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(Object.keys(rs)).toHaveLength(28);
    for (const r of Object.values(rs)) {
      if (r.id === 'nflverse.participation') continue;
      expect(r.level, `${r.id}: ${r.message}`).toBe('ok');
    }
    expect(rs['nflverse.participation']).toMatchObject({ level: 'warn', httpStatus: 404 });
    expect(rs['nflverse.participation'].message).toMatch(/not published yet; 2025 used, labeled last season/i);
    expect(rs['sleeper.stats'].documented).toBe(false);
    expect(rs['sleeper.state'].documented).toBe(true);
    expect(rs['fantasycalc.dynasty'].source).toBe('fantasycalc');
    expect(rs['sleeper.state'].url).toBe(sleeperUrls.state());
    expect(rs['sleeper.state'].checkedAt).toBe(clock);
  });

  it('uses HEAD for nflverse and GET for the rest', async () => {
    await mk().api.healthChecks(ctx);
    const nv = t.calls.filter((c) => c.url.includes('nflverse-data'));
    expect(nv).toHaveLength(6);
    expect(nv.every((c) => c.method === 'HEAD')).toBe(true);
    expect(t.calls.filter((c) => !c.url.includes('nflverse-data')).every((c) => c.method === 'GET')).toBe(true);
    expect(nflverseUrls.participation('2025')).toBe(nv.find((c) => c.url.includes('_2025'))!.url);
  });

  it('nflverse blocked by CORS (TypeError) is a warn with the milestone-3 message', async () => {
    t.set(/nflverse-data/, () => { throw new TypeError('Failed to fetch'); });
    const rs = byId(await mk().api.healthChecks(ctx));
    for (const id of ['nflverse.pbp', 'nflverse.snapCounts', 'nflverse.ftn', 'nflverse.participationPrev', 'nflverse.participation', 'nflverse.players']) {
      expect(rs[id].level).toBe('warn');
      expect(rs[id].message).toBe('Blocked by the browser (no CORS on GitHub releases). Will come from the nightly data job in milestone 3.');
    }
  });

  it('a missing (non-participation) nflverse file is a fail', async () => {
    t.set(nflverseUrls.pbp('2026'), status(404));
    const rs = byId(await mk().api.healthChecks(ctx));
    expect(rs['nflverse.pbp'].level).toBe('fail');
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
    // 27 direct probes + the players file (fetched once through the client's own limiter use)
    expect(spy).toHaveBeenCalledTimes(28);
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
