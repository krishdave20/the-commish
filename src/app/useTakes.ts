import { useMemo } from 'react';
import { isDynasty } from '../engine';
import type { Take, TakeInputs } from '../takes/types';
import { useLeagueBundle } from './hooks';
import { useModel } from './modelContext';
import { useNflverse } from './nflverseData';
import { useFantasyCalc } from './playersData';
import { useBuildTakes } from './takesEngine';
import { useTrendingAdds } from './trending';
import { useWatchlist } from './useWatchlist';

export interface TakesState {
  /** ranked as the engine returns them (your players first, then waiver and trade targets, then league-wide) */
  takes: Take[];
  /** the model is built, so the engine could run */
  ready: boolean;
  /** the nightly nflverse files fed the detectors */
  usesNflverse: boolean;
  nflverseLoading: boolean;
  /** latest week with play-by-play, when nflverse is loaded */
  throughWeek: number | null;
  /** "Play-by-play and snap data: nflverse. …" when nflverse is loaded */
  attribution: string | null;
  /** FantasyCalc values fed the detectors (dynasty leagues only) */
  usesFantasyCalc: boolean;
  /** the engine threw; `takes` is empty and the page says so quietly */
  error: string | undefined;
  /** reload the nflverse files (the page's Refresh also rebuilds the model) */
  refreshNflverse: () => Promise<void>;
}

/** Assembles the takes engine's inputs from the model, the nflverse bundle, trending adds, FantasyCalc (dynasty only), the
    watchlist and (later) the trade analyzer, and runs it in a memo. Anything missing means fewer takes, never a crash. */
export function useTakes(): TakesState {
  const { model, extras } = useModel();
  const nv = useNflverse();
  const trending = useTrendingAdds();
  const bundle = useLeagueBundle();
  const watch = useWatchlist();
  const build = useBuildTakes();
  const league = extras?.league ?? bundle.data?.league ?? null;
  const dynasty = league ? isDynasty(league) : false;
  const fc = useFantasyCalc(dynasty ? league : null);
  const fcById = dynasty && fc?.ok ? fc.byId : null;
  const nflverse = nv.bundle;
  const trendingRows = trending.data;

  const out = useMemo<{ takes: Take[]; error: string | undefined }>(() => {
    if (!model) return { takes: [], error: undefined };
    const inputs: TakeInputs = {
      season: model.meta.season,
      week: model.meta.currentWeek,
      model,
      nflverse: nflverse
        ? {
          manifest: nflverse.manifest,
          weekly: nflverse.weekly,
          season: nflverse.season,
          teams: nflverse.teams,
          coverage: nflverse.coverage
            ? { rows: nflverse.coverage.rows, teams: nflverse.coverage.teams, isCurrent: nflverse.coverage.isCurrent, season: String(nflverse.coverage.season) }
            : null,
        }
        : null,
      trendingAdds: trendingRows ?? [],
      fantasyCalc: fcById,
      isDynasty: dynasty,
      watchlist: watch.list,
      tradeTargets: [],
    };
    try {
      return { takes: build(inputs), error: undefined };
    } catch (e) {
      return { takes: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [model, nflverse, trendingRows, fcById, dynasty, watch.list, build]);

  return {
    takes: out.takes,
    ready: !!model,
    usesNflverse: !!nflverse,
    nflverseLoading: nv.loading,
    throughWeek: nflverse?.manifest.throughWeek ?? null,
    attribution: nflverse?.manifest.attribution ?? null,
    usesFantasyCalc: !!fcById,
    error: out.error,
    refreshNflverse: nv.refresh,
  };
}
