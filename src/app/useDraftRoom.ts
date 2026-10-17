import { useMemo, useState } from 'react';
import { buildRankings, loadDraftInputs } from '../engine';
import type { DraftInputs, DraftMode, Rankings } from '../engine';
import type { SleeperLeague } from '../data';
import { useData } from './dataContext';
import { useResource } from './hooks';
import type { Resource } from './hooks';
import type { Fetcher } from './resourceStore';

interface Opts {
  mode: DraftMode;
  draftId: string | null;
  enabled: boolean;
}

/** Draft inputs for the draft room. Like useDraftInputs, but the draft's status is always read fresh (draft day changes it),
    and Refresh pulls everything again, FantasyCalc included. While another mode's inputs load, the last ones stay. */
export function useDraftRoomInputs(league: SleeperLeague | null, o: Opts): Resource<DraftInputs> & { switching: boolean } {
  const { sleeper } = useData();
  const season = league?.season;
  const fetcher = useMemo<Fetcher<DraftInputs> | null>(
    () => (sleeper && league && o.enabled && season
      ? async (opt) => {
        let out = await loadDraftInputs(sleeper, league, { draftId: o.draftId, mode: o.mode, force: opt?.force });
        if (o.draftId) {
          // a cached "pre_draft" must not hide a draft that has started
          const fresh = await sleeper.draft(o.draftId, { force: true }).then((r) => r.data, () => null);
          if (fresh) out = { ...out, draft: fresh };
        }
        return { data: out, asOf: out.asOf, fromCache: false, stale: false };
      }
      : null),
    [sleeper, league, o.enabled, o.mode, o.draftId, season],
  );
  const res = useResource(fetcher && league ? `draft-room:${league.league_id}:${o.mode}:${season}:${o.draftId ?? 'none'}` : null, fetcher);

  // keep showing the previous mode's inputs while the new mode's arrive (no flash of an empty page)
  const [held, setHeld] = useState<{ leagueId: string; data: DraftInputs } | null>(null);
  if (res.data && league && held?.data !== res.data) setHeld({ leagueId: league.league_id, data: res.data });
  const shown = res.data ?? (held && league && held.leagueId === league.league_id ? held.data : undefined);
  return { ...res, data: shown, switching: !res.data && !!shown };
}

/** Rankings for the inputs as they were loaded (their own mode), so the table never mixes modes. Null until inputs arrive. */
export function useRoomRankings(league: SleeperLeague | null, inputs: DraftInputs | undefined): Rankings | null {
  return useMemo(() => {
    if (!league || !inputs) return null;
    try {
      return buildRankings({
        projections: inputs.projections, league, mode: inputs.mode, players: inputs.players,
        fantasyCalc: inputs.fantasyCalc.ok ? inputs.fantasyCalc.byId : null,
      });
    } catch {
      return null;
    }
  }, [league, inputs]);
}
