/* Shared by the draft grades and team ratings tests: the sample league's 6-team, 24-pick draft, an engine model to match it
   (every drafted player is on a roster and has scored), and a mount function. */
import type { DraftPick, LeagueBundle, SleeperDraft, SleeperLeague } from '../../../data';
import type { Model, Pos } from '../../../engine';
import { handModel } from '../../../engine/test-helpers';
import type { HandPlayer } from '../../../engine/test-helpers';
import { renderApp } from '../../../app/testUtils';
import {
  FAKE_AS_OF, createFakeApi, createFakeSleeper, sampleAccount, sampleBundle, sampleDraft, sampleDraftPicks, sampleLeague, sampleLoadModel,
} from '../../../test/fakes';

const linked = [sampleAccount()];
/** the draft the bots made (fixed seed): 24 picks, 6 teams, 4 rounds */
export const PICKS = sampleDraftPicks(sampleDraft({ status: 'complete' }));

/** The sample league's 6-team, 24-pick draft, with the engine model to match: every drafted player is on a roster and has scored. */
export function seasonModel(picks: DraftPick[], tweak: (m: Model) => void = () => {}): Model {
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'] as const;
  const players: HandPlayer[] = picks.map((p) => ({
    pid: p.player_id, pos: (/^[A-Z]+/.exec(p.player_id)?.[0] ?? 'WR') as Pos, mu: Math.max(2, 22 - p.pick_no * 0.6), owner: p.roster_id ?? 0,
  }));
  const m = handModel({
    cur: 5, last: 8, slots: [...slots], meRid: 3,
    teams: [1, 2, 3, 4, 5, 6].map((rid) => ({ rid, name: `T${rid}`, wins: 6 - rid, losses: rid - 1, pf: 500 - rid * 10 })),
    players,
  });
  for (const p of m.players) for (let w = 1; w <= 5; w++) p.pts[w] = p.mu[5]! * (w === 3 ? 0.5 : 1);
  tweak(m);
  return m;
}

export interface Setup {
  status?: SleeperDraft['status'];
  league?: (l: SleeperLeague) => void;
  tweak?: (m: Model) => void;
  route: string;
}

export function mount(o: Setup) {
  const league = structuredClone(sampleLeague);
  o.league?.(league);
  const bundle: LeagueBundle = sampleBundle(league);
  const draft = sampleDraft({ status: o.status ?? 'complete' });
  bundle.drafts = [draft];
  const api = createFakeApi();
  api.leagueBundle.mockResolvedValue({ data: bundle, asOf: FAKE_AS_OF, fromCache: false, stale: false });
  const sleeper = createFakeSleeper({ draft, picks: o.status === 'pre_draft' ? [] : PICKS });
  const model = seasonModel(PICKS, o.tweak);
  const utils = renderApp({ linked, api, sleeper, route: o.route, loadModel: sampleLoadModel(() => model) });
  return { ...utils, model };
}


/** the model's players for one drafting team, in pick order */
export function picksOf(m: Model, rid: number) {
  return PICKS.filter((p) => p.roster_id === rid).map((p) => m.players.find((x) => x.pid === p.player_id)!);
}
