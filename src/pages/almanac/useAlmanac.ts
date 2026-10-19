import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../../app/dataContext';
import { useActive, useLeagueBundle, useResource } from '../../app/hooks';
import type { Resource } from '../../app/hooks';
import type { Fetcher } from '../../app/resourceStore';
import type { SleeperLeague } from '../../data';
import { buildAlmanac, loadHistory } from '../../engine/almanac';
import type { Almanac, HistoryData } from '../../engine/almanac';

export interface AlmanacView {
  /** null until the history is loaded */
  almanac: Almanac | null;
  resource: Resource<HistoryData>;
  league: SleeperLeague | null;
  /** the signed-in user's Sleeper id, to find "you" among the managers */
  userId: string | null;
  /** the season the loader is on right now, while it follows the chain back */
  progress: string | null;
  /** a league id typed into the address (`?league=`), honoured in development builds only */
  devLeagueId: string | null;
}

/** The league the almanac is about: the followed league, or (development builds only) any league id in `?league=`. */
function useAlmanacLeague(devLeagueId: string | null): { league: SleeperLeague | null; error: string | undefined } {
  const { sleeper } = useData();
  const bundle = useLeagueBundle(devLeagueId ? null : undefined);
  const fetcher = useMemo<Fetcher<SleeperLeague> | null>(
    () => (devLeagueId && sleeper ? (o) => sleeper.league(devLeagueId, o) : null),
    [devLeagueId, sleeper],
  );
  const other = useResource(devLeagueId ? `almanac-league:${devLeagueId}` : null, fetcher);
  return devLeagueId ? { league: other.data ?? null, error: other.error } : { league: bundle.data?.league ?? null, error: bundle.error };
}

/** Loads the league's history (the loader follows `previous_league_id` back; finished seasons are saved whole, so only the first visit is slow)
    and builds the almanac from it. Shared through the resource store, so the tabs and a return visit cost nothing. */
export function useAlmanac(): AlmanacView {
  const { sleeper } = useData();
  const { data: active } = useActive();
  const [params] = useSearchParams();
  const devLeagueId = import.meta.env.DEV ? (params.get('league') || null) : null;
  const { league } = useAlmanacLeague(devLeagueId);
  const [progress, setProgress] = useState<string | null>(null);

  const fetcher = useMemo<Fetcher<HistoryData> | null>(
    () => (sleeper && league
      ? (o) => loadHistory(sleeper, league, { force: o?.force, onProgress: (p) => setProgress(p.season) })
      : null),
    [sleeper, league],
  );
  const resource = useResource(league ? `almanac:${league.league_id}` : null, fetcher);
  const almanac = useMemo(() => (resource.data ? buildAlmanac(resource.data) : null), [resource.data]);
  return { almanac, resource, league, userId: active?.account.userId ?? null, progress: resource.loading ? progress : null, devLeagueId };
}
