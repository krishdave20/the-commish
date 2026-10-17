// @vitest-environment node
/* The whole pipeline against the saved pull in reference/fixture/: data layer → loadLeaguePull → buildModel → engine.
   Nothing here is hard-coded to a user or league: ids and names come from the manifest and the fixture's own files. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../data/cache.ts';
import { createDataLayer } from '../data/index.ts';
import { fixtureTransport, type Transport } from '../data/transport.ts';
import { applyBaseSim, baseSimInput, simulate, createEngine, buildModel, loadLeaguePull, emptyScenario, SIM_RUNS, type Model } from './index.ts';
import { fixtureModel } from './test-helpers.ts';
import type { FixtureManifest, FixtureSource } from '../data/transport.ts';
import type { LeaguePull } from './types.ts';

let model: Model, pull: LeaguePull, manifest: FixtureManifest, src: FixtureSource;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

beforeAll(async () => {
  ({ model, pull, manifest, src } = await fixtureModel());
});

describe('loadLeaguePull', () => {
  it('uses only the league and user ids it is given (no username lookups) and the planned week ranges', async () => {
    const urls: string[] = [];
    const inner = fixtureTransport(src);
    const spy: Transport = (u, i) => { urls.push(u); return inner(u, i); };
    const layer = createDataLayer({ transport: spy, cache: createCache({ memoryOnly: true }) });
    const progress: number[] = [];
    const p = await loadLeaguePull(layer.sleeper, { leagueId: manifest.league_id, userId: manifest.user_id }, { onProgress: (x) => progress.push(x.done / x.total) });
    expect(urls.some((u) => u.includes('/v1/user/'))).toBe(false);
    expect(urls.every((u) => u in manifest.files)).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
    expect(Object.keys(p.matchups).map(Number)).toEqual(p.plan.matchWeeks);
    expect(Object.keys(p.stats).map(Number)).toEqual(p.plan.statWeeks);
    expect(Object.keys(p.projections).map(Number)).toEqual([...p.plan.calWeeks, ...p.plan.projWeeks]);
    expect(p.leagueId).toBe(manifest.league_id);
    expect(p.userId).toBe(manifest.user_id);
    expect(progress.at(-1)).toBe(1);
  });
  it('asOf is the oldest piece\'s fetch time', async () => {
    const cache = createCache({ memoryOnly: true });
    // one piece (rosters) was fetched long ago but is still inside its freshness window, so it is served from the cache
    await cache.put(`sleeper:/v1/league/${manifest.league_id}/rosters`, await src.load(manifest.files[`https://api.sleeper.app/v1/league/${manifest.league_id}/rosters`]!), 5);
    const layer = createDataLayer({ transport: fixtureTransport(src), cache, now: () => 1000 });
    const p = await loadLeaguePull(layer.sleeper, { leagueId: manifest.league_id, userId: manifest.user_id });
    expect(p.asOf).toBe(5);
    expect(p.stale).toBe(false);
    const fresh = await loadLeaguePull(createDataLayer({ transport: fixtureTransport(src), cache: createCache({ memoryOnly: true }), now: () => 1000 }).sleeper, { leagueId: manifest.league_id, userId: manifest.user_id });
    expect(fresh.asOf).toBe(1000);
  });
  it('survives the trending endpoint failing', async () => {
    const inner = fixtureTransport(src);
    const flaky: Transport = (u, i) => (u.includes('/trending/') ? Promise.reject(new Error('down')) : inner(u, i));
    const layer = createDataLayer({ transport: flaky, cache: createCache({ memoryOnly: true }) });
    const p = await loadLeaguePull(layer.sleeper, { leagueId: manifest.league_id, userId: manifest.user_id });
    expect(p.trending).toEqual([]);
  });
  it('a missing core endpoint fails loudly', async () => {
    const inner = fixtureTransport(src);
    const broken: Transport = (u, i) => (u.endsWith('/rosters') ? Promise.resolve({ status: 500, body: null, bytes: 0, ms: 0 }) : inner(u, i));
    const layer = createDataLayer({ transport: broken, cache: createCache({ memoryOnly: true }) });
    await expect(loadLeaguePull(layer.sleeper, { leagueId: manifest.league_id, userId: manifest.user_id })).rejects.toThrow();
  });
});

describe('model sanity (fixture)', () => {
  it('takes ids and names from the data, not from code', () => {
    expect(model.meta.leagueId).toBe(manifest.league_id);
    expect(model.meta.userId).toBe(manifest.user_id);
    const me = model.teams.find((t) => t.isMe)!;
    expect(me.rid).toBe(model.meRid);
    expect(me.ownerId).toBe(manifest.user_id);
    expect(model.meta.username).toBe(me.manager);
    expect(model.meta.username.toLowerCase()).toBe(manifest.username.toLowerCase());
    expect(model.meta.leagueName).toBe(pull.league.name);
    expect(model.meta.season).toBe(manifest.season);
    expect(model.meta.currentWeek).toBe(manifest.week);
    expect(model.teams.filter((t) => t.isMe).length).toBe(1);
    for (const t of model.teams) expect(t.team.length).toBeGreaterThan(0);
  });
  it('one team per roster', () => {
    expect(model.teams.length).toBe(pull.rosters.length);
    expect(new Set(model.teams.map((t) => t.rid))).toEqual(new Set(pull.rosters.map((r) => r.roster_id)));
  });
  it('playoff odds sum to min(playoff_teams, teams); division odds to the division count; seeds are distributions', () => {
    const nP = Math.min(pull.league.settings.playoff_teams ?? 6, model.teams.length);
    expect(model.meta.playoffTeams).toBe(nP);
    expect(sum(model.teams.map((t) => t.playoffPct))).toBeCloseTo(nP, 6);
    expect(sum(model.teams.map((t) => t.divWinPct))).toBeCloseTo(model.meta.divisions, 6);
    for (const t of model.teams) {
      expect(t.seedPct.length).toBe(nP);
      expect(sum(t.seedPct)).toBeCloseTo(t.playoffPct, 6);
      expect(t.playoffPct).toBeGreaterThanOrEqual(0);
      expect(t.playoffPct).toBeLessThanOrEqual(1);
      expect(t.winsP10).toBeLessThanOrEqual(t.winsP90);
    }
    for (let s = 0; s < nP; s++) expect(sum(model.teams.map((t) => t.seedPct[s]!))).toBeCloseTo(1, 6);
    expect(model.meta.simRuns).toBe(SIM_RUNS);
  });
  it('team weekly SD is in a sane range', () => {
    expect(model.meta.teamWeeklySd).toBeGreaterThan(15);
    expect(model.meta.teamWeeklySd).toBeLessThan(25);
  });
  it('floors ≤ expected ≤ ceilings for every player-week; byes score nothing', () => {
    expect(model.players.length).toBeGreaterThan(100);
    for (const p of model.players) {
      for (let w = model.meta.currentWeek; w <= model.meta.maxWeek; w++) {
        expect(p.lo[w]!, `${p.name} w${w}`).toBeLessThanOrEqual(p.mu[w]!);
        expect(p.mu[w]!, `${p.name} w${w}`).toBeLessThanOrEqual(p.hi[w]!);
        expect(p.mu[w]!).toBeGreaterThanOrEqual(0);
        if (p.opp[w] === 'BYE') expect(p.mu[w]).toBe(0);
      }
    }
  });
  it('calibration: ratios per position, coverage and error are plausible', () => {
    const { floorCeil, ratioSamples } = model.meta;
    for (const pos of model.meta.positions) {
      const [lo, hi] = floorCeil[pos]!;
      expect(lo).toBeLessThan(1);
      expect(hi).toBeGreaterThan(1);
      expect(ratioSamples[pos]).toBeGreaterThanOrEqual(0);
    }
    expect(model.meta.calibrationWeeks.length).toBeLessThanOrEqual(4);
    expect(model.meta.maeProjection).toBeGreaterThan(2);
    expect(model.meta.maeProjection).toBeLessThan(8);
    expect(model.meta.bandCoverage).toBeGreaterThan(0.3);
    expect(model.meta.bandCoverage).toBeLessThan(0.9);
  });
  it('matchup grades are around 1 and every roster slot is covered', () => {
    const dv = model.players.flatMap((p) => Object.values(p.dvp)).filter((x): x is number => x != null);
    expect(dv.length).toBeGreaterThan(100);
    expect(Math.min(...dv)).toBeGreaterThan(0.2);
    expect(Math.max(...dv)).toBeLessThan(3);
    expect(model.meta.slots).toEqual(pull.league.roster_positions.filter((s) => s !== 'BN' && s !== 'IR' && s !== 'TAXI'));
  });
  it('the free-agent pool respects the position caps and every rostered player is owned by a real team', () => {
    const fa = model.players.filter((p) => p.ownerRid === 0);
    const cnt: Record<string, number> = {};
    for (const p of fa) cnt[p.pos] = (cnt[p.pos] ?? 0) + 1;
    expect(cnt.QB).toBeLessThanOrEqual(14);
    expect(cnt.RB).toBeLessThanOrEqual(40);
    expect(cnt.WR).toBeLessThanOrEqual(50);
    expect(cnt.TE).toBeLessThanOrEqual(22);
    expect(cnt.K).toBeLessThanOrEqual(10);
    expect(cnt.DEF).toBeLessThanOrEqual(12);
    const rids = new Set(model.teams.map((t) => t.rid));
    for (const p of model.players) if (p.ownerRid) expect(rids.has(p.ownerRid)).toBe(true);
  });
  it('games are the remaining regular-season matchups; history covers weeks 1..cur', () => {
    const { currentWeek: cur, lastRegularWeek: last } = model.meta;
    expect(model.games.every((g) => g.week >= cur && g.week <= last)).toBe(true);
    expect(model.games.length).toBe((last - cur + 1) * (model.teams.length / 2));
    expect(model.history.filter((h) => h.week < cur).every((h) => h.final)).toBe(true);
    expect(model.history.filter((h) => h.week === cur).every((h) => !h.final)).toBe(true);
    expect(model.history.length).toBe(cur * model.teams.length);
  });
  it('building twice gives identical models (pure), and another user id picks another team', () => {
    const again = buildModel(pull, { userId: manifest.user_id });
    expect(again).toEqual(model);
    const other = pull.rosters.find((r) => r.owner_id && r.owner_id !== manifest.user_id)!;
    const m2 = buildModel(pull, { userId: other.owner_id! });
    expect(m2.meRid).toBe(other.roster_id);
    expect(m2.teams.find((t) => t.isMe)!.ownerId).toBe(other.owner_id);
    expect(m2.teams.map((t) => t.playoffPct)).toEqual(model.teams.map((t) => t.playoffPct));
    // a user who is not in the league falls back to the first team rather than failing
    expect(buildModel(pull, { userId: 'nobody' }).meRid).toBe(pull.rosters[0]!.roster_id);
  });
  it('simulate: false + applyBaseSim reproduces the default model on the fixture', () => {
    const pending = buildModel(pull, { userId: manifest.user_id, simulate: false });
    expect(pending.oddsPending).toBe(true);
    expect(applyBaseSim(pending, simulate(baseSimInput(pending)))).toEqual(model);
  });
  it('team names: team name, else the manager name, never a "Team " prefix', () => {
    for (const t of model.teams) {
      const u = pull.users.find((x) => x.user_id === t.ownerId);
      expect(t.team).toBe(u?.metadata?.team_name || u?.display_name || `roster ${t.rid}`);
    }
  });
  it('survives a JSON round trip (structured-clone safe for workers and caches)', () => {
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });
});

describe('engine on the fixture', () => {
  it('a full 20,000-run simulation takes about a second or less; waiver boards well under a second', () => {
    const eng = createEngine(model);
    let t0 = performance.now();
    const s = eng.simulate(undefined, { runs: SIM_RUNS });
    const simMs = performance.now() - t0;
    expect(s.n).toBe(SIM_RUNS);
    expect(simMs).toBeLessThan(3000);
    t0 = performance.now();
    const w = eng.waivers(undefined, 'reg');
    const wMs = performance.now() - t0;
    expect(w.list.length).toBeGreaterThan(0);
    expect(wMs).toBeLessThan(1000);
    console.log(`[perf] 20k sim ${simMs.toFixed(0)} ms, waiver board ${wMs.toFixed(0)} ms, ideas ${model.ideas.length}`);
  });
  it('the scenario-free simulation reproduces the model\'s own odds (up to the locked current-week lineup)', () => {
    const eng = createEngine(model);
    const s = eng.simulate(undefined, { runs: SIM_RUNS });
    for (const t of model.teams) expect(Math.abs(s.teams[t.rid]!.playoff - t.playoffPct)).toBeLessThan(0.01);
  });
  it('waiver entries are internally consistent', () => {
    const eng = createEngine(model);
    for (const win of ['reg', 'next', 'po'] as const) {
      const b = eng.waivers(undefined, win);
      const gains = b.list.map((x) => x.gain);
      expect(gains).toEqual([...gains].sort((a, c) => c - a));
      for (const e of b.list) {
        expect(e.gain).toBeGreaterThan(0.3);
        expect(e.starts).toBeLessThanOrEqual(e.nweeks);
        expect(e.player.ownerRid).toBe(0);
        expect(model.players.find((p) => p.pid === e.drop.pid)!.ownerRid).toBe(model.meRid);
        expect(e.bid).toBeLessThanOrEqual(Math.round(eng.me.faabLeft * 0.25));
      }
    }
  });
  it('trade ideas are ranked by the smaller gain, deduped by incoming player, at most 8', () => {
    const ideas = model.ideas;
    expect(ideas.length).toBeLessThanOrEqual(8);
    expect(new Set(ideas.map((x) => x.getPid)).size).toBe(ideas.length);
    const mins = ideas.map((x) => Math.min(x.myGain, x.theirGain));
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(createEngine(model).tradeIdeas()).toEqual(ideas);
  });
  it('trade evaluation and odds work end to end on a real idea', () => {
    const eng = createEngine(model);
    const idea = model.ideas[0]!;
    const t = { partnerRid: idea.partnerRid, send: [idea.givePid], get: [idea.getPid] };
    const ev = eng.evaluateTrade(undefined, t);
    expect(ev.myReg).toBeCloseTo(idea.myGain, 1);
    expect(ev.theirReg).toBeCloseTo(idea.theirGain, 1);
    const o = eng.tradeOdds(undefined, t);
    expect(o.before).toBeGreaterThanOrEqual(0);
    expect(o.after).toBeLessThanOrEqual(1);
  });
  it('designations and winsToClinch run on the real league and never contradict each other', () => {
    const eng = createEngine(model);
    const d = eng.designations();
    for (const t of model.teams) {
      const x = d[t.rid]!;
      if (x.clinch) expect(t.playoffPct).toBeGreaterThan(0.5);
      if (x.elim) expect(t.playoffPct).toBeLessThan(0.5);
    }
    const w = eng.winsToClinch();
    expect(w.open).toBeGreaterThan(0);
  });
  it('another team\'s point of view', () => {
    const rid = model.teams.find((t) => !t.isMe)!.rid;
    const e2 = createEngine(model).withTeam(rid);
    expect(e2.meRid).toBe(rid);
    expect(e2.roster(emptyScenario()).every((id) => model.players.find((p) => p.pid === id)!.ownerRid === rid)).toBe(true);
  });
  it('all-play: wins sum to losses, and luck sums to roughly zero', () => {
    const eng = createEngine(model);
    const ap = Object.values(eng.allPlay());
    expect(sum(ap.map((a) => a.w))).toBe(sum(ap.map((a) => a.l)));
    expect(sum(model.teams.map((t) => eng.luck(t.rid)))).toBeCloseTo(0, 6);
  });
});
