import { useMemo } from 'react';
import { useLiveMaybe } from '../../../app/live/liveContext';
import { useModel, useScenario } from '../../../app/modelContext';
import { useNflverse } from '../../../app/nflverseData';
import { replacementLevels, sidesFromLive, sidesFromModel } from '../../../engine/hinges';
import type { HingeOpts, HingeSide } from '../../../engine/hinges';

export interface MatchupData {
  week: number;
  mine: HingeSide;
  theirs: HingeSide;
  /** live: the numbers come from the games in progress; model: before kickoff, from the week's expectations (and the what-if) */
  source: 'live' | 'model';
  /** options for `hingesOf` */
  opts: HingeOpts;
}

const NONE: Record<string, number> = {};

/** This week's matchup for the signed-in team, whichever source is better: the live feed once any starter of either side has played
    (points already scored stay), else the model's own week (with the what-if applied). Null while there is no model or no opponent. */
export function useMatchupData(): MatchupData | null {
  const { model } = useModel();
  const { scenario } = useScenario();
  const live = useLiveMaybe();
  const { bundle } = useNflverse();

  const liveMatchup = live && !live.replay && live.week === live.currentWeek ? live.view?.mine ?? null : null;
  const sides = useMemo(() => {
    if (!model) return null;
    if (liveMatchup) {
      const s = sidesFromLive(liveMatchup);
      if ([...s.mine.starters, ...s.theirs.starters].some((p) => p.state !== 'pre')) return { ...s, source: 'live' as const };
    }
    const m = sidesFromModel(model, scenario);
    return m ? { ...m, source: 'model' as const } : null;
  }, [model, scenario, liveMatchup]);

  const replacement = useMemo(() => (model ? replacementLevels(model, model.meta.currentWeek) : NONE), [model]);
  const snaps = useMemo(() => new Map((bundle?.season ?? []).map((r) => [r.pid, r.snap_pct])), [bundle]);
  const averages = useMemo(() => new Map((model?.players ?? []).map((p) => [p.pid, p.seasonAvg])), [model]);

  return useMemo(() => {
    if (!model || !sides) return null;
    return {
      week: model.meta.currentWeek, mine: sides.mine, theirs: sides.theirs, source: sides.source,
      opts: { sd: model.meta.teamWeeklySd, replacement, perGame: (pid) => averages.get(pid), snaps: (pid) => snaps.get(pid) },
    };
  }, [model, sides, replacement, snaps, averages]);
}
