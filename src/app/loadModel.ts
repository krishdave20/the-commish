import { buildModel, loadLeaguePull } from '../engine';
import type { LoadProgress, Model } from '../engine';
import type { SleeperClient } from '../data';

export interface LoadModelCtx {
  leagueId: string;
  userId: string;
  /** skip fresh cache copies */
  force: boolean;
  onProgress: (p: LoadProgress) => void;
}

export interface LoadedModel {
  model: Model;
  /** epoch ms of the oldest piece of source data */
  asOf: number;
  stale: boolean;
  /** first message from a piece that fell back to the cache */
  error?: string;
}

export type LoadModel = (ctx: LoadModelCtx) => Promise<LoadedModel>;

/** Pull a league through the data layer, then build the model. */
export function sleeperLoader(sleeper: SleeperClient | null): LoadModel {
  return async (ctx) => {
    if (!sleeper) throw new Error('No data source is connected.');
    const pull = await loadLeaguePull(sleeper, { leagueId: ctx.leagueId, userId: ctx.userId }, { force: ctx.force, onProgress: ctx.onProgress });
    // let the progress bar paint before the model build takes the thread
    await new Promise((r) => setTimeout(r, 0));
    // the first 20,000 simulated seasons run in a worker afterwards (model.oddsPending until they land)
    const model = buildModel(pull, { userId: ctx.userId, simulate: false });
    return { model, asOf: pull.asOf, stale: pull.stale, error: pull.errors[0] };
  };
}
