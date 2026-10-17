/* Fetch what the draft room needs through the data layer: season projections, the draft and its picks, FantasyCalc
   (never fails), and, for rookie drafts, the players file for years_exp. */
import type { SleeperDraft, SleeperLeague, TradedPick } from '../../data/contract.ts';
import { positionsFor } from '../../data/urls.ts';
import type { SleeperClient } from '../../data/sleeper.ts';
import type { DraftPick, PlayersMap, ProjectionRow } from '../../data/types.ts';
import { inferDraftMode, type DraftMode } from './adp.ts';
import { loadFantasyCalc, type FcResult } from './fantasycalc.ts';

export interface DraftInputs {
  mode: DraftMode;
  projections: ProjectionRow[];
  fantasyCalc: FcResult;
  draft: SleeperDraft | null;
  picks: DraftPick[];
  tradedPicks: TradedPick[];
  players: PlayersMap | null;
  /** oldest fetch time among the pieces */
  asOf: number;
}

/** `draftId` defaults to the league's draft_id. Only startup/rookie drafts load FantasyCalc and (rookie) the players file. */
export async function loadDraftInputs(sleeper: SleeperClient, league: SleeperLeague, opts: { draftId?: string | null; mode?: DraftMode; force?: boolean } = {}): Promise<DraftInputs> {
  const o = { force: opts.force };
  const draftId = opts.draftId === undefined ? league.draft_id : opts.draftId;
  const draftF = draftId ? await sleeper.draft(draftId, o).catch(() => null) : null;
  const mode = opts.mode ?? inferDraftMode(league, draftF?.data);
  const [proj, picks, traded, fc, players] = await Promise.all([
    sleeper.seasonProjections(league.season, positionsFor(league.roster_positions), o),
    draftId ? sleeper.draftPicks(draftId, o) : Promise.resolve(null),
    draftId ? sleeper.draftTradedPicks(draftId, o) : Promise.resolve(null),
    mode === 'redraft' ? Promise.resolve(null) : loadFantasyCalc(sleeper, league),
    mode === 'rookie' ? sleeper.players(o).catch(() => null) : Promise.resolve(null),
  ]);
  const times = [proj.asOf, draftF?.asOf, picks?.asOf, traded?.asOf, players?.asOf].filter((t): t is number => typeof t === 'number');
  return {
    mode, projections: proj.data, draft: draftF?.data ?? null, picks: picks?.data ?? [], tradedPicks: traded?.data ?? [], players: players?.data ?? null,
    fantasyCalc: fc ?? { ok: false, params: { isDynasty: false, numQbs: 1, numTeams: league.total_rosters, ppr: 1 }, byId: {}, reason: 'not used for redraft drafts', asOf: null, stale: false },
    asOf: Math.min(...times),
  };
}
