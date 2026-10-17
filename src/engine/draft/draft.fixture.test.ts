// @vitest-environment node
/* The draft engine against the saved pull (reference/fixture/): season projections → rankings, the saved 180-pick draft
   replayed through the live helpers, and a mock draft in the league's real draft order. Everything comes from the manifest
   and the fixture's files. */
import { beforeAll, describe, expect, it } from 'vitest';
import { createCache } from '../../data/cache.ts';
import type { SleeperDraft, SleeperLeague } from '../../data/contract.ts';
import { fixtureDirSource } from '../../data/fixtureNode.ts';
import { createDataLayer } from '../../data/index.ts';
import { fixtureTransport } from '../../data/transport.ts';
import type { DraftPick } from '../../data/types.ts';
import { positionsFor } from '../../data/urls.ts';
import { FIXTURE_DIR } from '../test-helpers.ts';
import { createMock } from './mock.ts';
import { draftOrderFor, slotOfUser } from './order.ts';
import { loadDraftInputs } from './load.ts';
import { liveSnapshot } from './live.ts';
import { buildRankings, type Rankings } from './rankings.ts';

let league: SleeperLeague, draft: SleeperDraft, picks: DraftPick[], rankings: Rankings, userId: string;
let layer: ReturnType<typeof createDataLayer>;

beforeAll(async () => {
  const src = await fixtureDirSource(FIXTURE_DIR);
  const m = src.manifest;
  userId = m.user_id;
  layer = createDataLayer({ transport: fixtureTransport(src), cache: createCache({ memoryOnly: true }) });
  league = (await layer.sleeper.league(m.league_id)).data;
  const inputs = await loadDraftInputs(layer.sleeper, league);
  draft = inputs.draft!;
  picks = inputs.picks;
  rankings = buildRankings({ projections: inputs.projections, league, mode: inputs.mode, fantasyCalc: null });
});

describe('rankings from the saved season projections', () => {
  it('loads the draft inputs through the data layer (redraft: no FantasyCalc needed)', async () => {
    const inputs = await loadDraftInputs(layer.sleeper, league);
    expect(inputs.mode).toBe('redraft');
    expect(inputs.fantasyCalc.ok).toBe(false);
    expect(inputs.projections.length).toBeGreaterThan(1000);
    expect(inputs.picks.length).toBe(draft.settings.rounds! * draft.settings.teams!);
    expect(positionsFor(league.roster_positions).length).toBe(6);
  });
  it('the top 12 overall all have an ADP, and starters have positive VOR', () => {
    const top = rankings.rows.slice(0, 12);
    expect(top.every((r) => r.adp != null)).toBe(true);
    console.log('[draft] top 12:\n' + top.map((r) => `${r.rank}. ${r.name} ${r.pos} VOR ${r.vor.toFixed(1)} tier ${r.tier} ADP ${r.adp}`).join('\n'));
    for (const r of rankings.rows) {
      const n = rankings.starters[r.pos]!;
      if (r.posRank <= n) expect(r.vor, `${r.name} ${r.pos}${r.posRank}`).toBeGreaterThanOrEqual(0); // the last starter (ties included) is 0
      if (r.posRank === 1) expect(r.vor, r.name).toBeGreaterThan(0);
    }
    const starters = rankings.rows.filter((r) => r.posRank < rankings.starters[r.pos]!);
    expect(starters.filter((r) => r.vor > 0).length / starters.length).toBeGreaterThan(0.95);
    expect(rankings.adpField).toBe(`adp_${league.scoring_settings.rec === 1 ? 'ppr' : league.scoring_settings.rec === 0.5 ? 'half_ppr' : 'std'}`);
  });
  it('league slots drive the starters: 12 teams × (QB 1, TE 1, K 1, DEF 1) plus RB/WR plus 2 flex each', () => {
    const t = league.total_rosters;
    expect(rankings.teams).toBe(t);
    expect(rankings.starters.QB).toBe(t);
    expect(rankings.starters.RB! + rankings.starters.WR! + rankings.starters.TE!).toBe(t * (2 + 2 + 1 + 2));
  });
});

describe('dynasty modes on the saved data', () => {
  it('rookie mode loads the players file for years_exp, keeps only rookies, and survives FantasyCalc being unreachable', async () => {
    const inputs = await loadDraftInputs(layer.sleeper, league, { mode: 'rookie' });
    expect(inputs.players).not.toBeNull();
    expect(inputs.fantasyCalc.ok).toBe(false); // never captured in the fixture → the transport answers 404
    expect(inputs.fantasyCalc.reason).toMatch(/FantasyCalc/);
    const r = buildRankings({ projections: inputs.projections, league, mode: 'rookie', players: inputs.players, fantasyCalc: inputs.fantasyCalc.byId });
    expect(r.adpField).toBe('adp_rookie');
    expect(r.rows.length).toBeGreaterThan(10);
    expect(r.rows.length).toBeLessThan(rankings.rows.length);
    expect(r.rows.every((x) => x.rookie && (x.yearsExp === 0 || x.adp != null))).toBe(true);
  });
  it('startup mode reads the dynasty ADP column', () => {
    const r = buildRankings({ projections: [], league: { ...league, settings: { ...league.settings, type: 2 } } });
    expect(r.mode).toBe('startup');
    expect(r.adpField).toBe('adp_dynasty_ppr');
  });
});

describe('the saved draft replays through the live helpers', () => {
  it('the order built from the draft object reproduces every real pick\'s roster, including slot_to_roster_id', () => {
    const order = draftOrderFor(draft);
    expect(order.length).toBe(picks.length);
    for (const p of picks) {
      const o = order[p.pick_no - 1]!;
      expect(o.rosterId, `pick ${p.pick_no}`).toBe(p.roster_id);
      expect(o.round).toBe(p.round);
    }
  });
  it('180 picks replay without errors; best available never includes a picked player; the clock advances', () => {
    const order = draftOrderFor(draft);
    const me = order.find((o) => o.slot === slotOfUser(draft, userId))!.rosterId;
    const sorted = picks.slice().sort((a, b) => a.pick_no - b.pick_no);
    for (let k = 0; k <= sorted.length; k++) {
      const so_far = sorted.slice(0, k);
      const s = liveSnapshot({ rankings, order, picks: so_far, rosterId: me });
      const gone = new Set(so_far.map((p) => p.player_id));
      expect(s.best.every((r) => !gone.has(r.pid))).toBe(true);
      expect(s.turn.currentPickNo).toBe(k < sorted.length ? k + 1 : null);
      expect(s.values.length).toBe(k);
    }
    const end = liveSnapshot({ rankings, order, picks: sorted, rosterId: me });
    expect(end.needs.roster.length).toBe(draft.settings.rounds);
    expect(end.turn.nextPickNo).toBeNull();
    const withAdp = end.values.filter((v) => v.value != null);
    expect(withAdp.length).toBeGreaterThan(100);
  });
});

describe('a mock draft in the league\'s real order', () => {
  it('runs to the end, the user holds their real slot, and a grade comes back', () => {
    const order = draftOrderFor(draft);
    const slot = slotOfUser(draft, userId)!;
    const me = order.find((o) => o.slot === slot)!.rosterId;
    const m = createMock({ rankings, order, userRosterId: me, seed: 42 });
    const before = m.autoUntilUser();
    expect(before.length).toBe(order.findIndex((o) => o.rosterId === me));
    m.pick(m.available()[0]!.pid);
    m.autoAll();
    expect(m.state.complete).toBe(true);
    expect(m.state.picks.length).toBe(picks.length);
    expect(m.state.picks.filter((p) => p.byUser).length).toBe(1);
    expect(m.state.grade!.teams).toBe(league.total_rosters);
    for (const ids of Object.values(m.state.rosters)) expect(ids.length).toBe(draft.settings.rounds);
  });
});
