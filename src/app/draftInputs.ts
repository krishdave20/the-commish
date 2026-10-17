import { useMemo } from 'react';
import { buildRankings, loadDraftInputs } from '../engine';
import type { DraftInputs, DraftMode, Rankings } from '../engine';
import type { SleeperLeague } from '../data';
import { useData } from './dataContext';
import { useResource } from './hooks';
import type { Resource } from './hooks';
import type { Fetcher } from './resourceStore';

interface Opts {
  mode?: DraftMode;
  /** the draft to read; null reads none (the huddle's offseason rookie class has no draft yet) */
  draftId?: string | null;
  /** the season to project (the NFL season the draft is for); default is the league's own */
  season?: string;
  enabled: boolean;
}

/** Season projections, the draft, FantasyCalc and the players file for the draft engine, through the resource store. */
export function useDraftInputs(league: SleeperLeague | null, o: Opts): Resource<DraftInputs> {
  const { sleeper } = useData();
  const season = o.season ?? league?.season;
  const draftId = o.draftId === undefined ? (league?.draft_id ?? null) : o.draftId;
  const fetcher = useMemo<Fetcher<DraftInputs> | null>(
    () => (sleeper && league && o.enabled && season
      ? async (opt) => {
        const d = await loadDraftInputs(sleeper, { ...league, season }, { draftId, mode: o.mode, force: opt?.force });
        return { data: d, asOf: d.asOf, fromCache: false, stale: false };
      }
      : null),
    [sleeper, league, o.enabled, o.mode, season, draftId],
  );
  return useResource(fetcher && league ? `draft-inputs:${league.league_id}:${o.mode ?? 'auto'}:${season}:${draftId ?? 'none'}` : null, fetcher);
}

/** Rankings from the draft inputs (null until they arrive). */
export function useRankings(league: SleeperLeague | null, inputs: DraftInputs | undefined, mode?: DraftMode): Rankings | null {
  return useMemo(() => {
    if (!league || !inputs) return null;
    try {
      return buildRankings({
        projections: inputs.projections, league, mode: mode ?? inputs.mode, players: inputs.players,
        fantasyCalc: inputs.fantasyCalc.ok ? inputs.fantasyCalc.byId : null,
      });
    } catch {
      return null;
    }
  }, [league, inputs, mode]);
}
