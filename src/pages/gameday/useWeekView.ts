import { useEffect, useMemo, useState } from 'react';

const NO_SCORING: Record<string, number> = {};
import type { ProjectionRow } from '../../data';
import { buildCtx } from '../../app/live/ctx';
import { useData } from '../../app/dataContext';
import { useModel } from '../../app/modelContext';
import { buildView, liveSource } from '../../engine/live';
import type { LiveCtx, LiveSnapshot, LiveView } from '../../engine/live';

export interface WeekView {
  loading: boolean;
  error: string | null;
  snapshot: LiveSnapshot | null;
  ctx: LiveCtx | null;
  view: LiveView | null;
}

/** One finished week, read once (no polling): last week's finals on an off-day. */
export function useWeekView(week: number, enabled: boolean): WeekView {
  const { sleeper } = useData();
  const { model, extras } = useModel();
  const [got, setGot] = useState<{ key: string; snapshot: LiveSnapshot | null; rows: ProjectionRow[] | null; error: string | null } | null>(null);
  const leagueId = model?.meta.leagueId ?? '';
  const season = model?.meta.season ?? '';
  const positions = model?.meta.positions;
  const key = `${leagueId}|${season}|${week}`;
  const can = enabled && !!sleeper && !!model && week >= 1 && typeof sleeper.liveMatchups === 'function';

  useEffect(() => {
    if (!can || !sleeper || !positions) return;
    let alive = true;
    const rowsP = typeof sleeper.projections === 'function' ? sleeper.projections(season, week, positions).then((r) => r.data, () => null) : Promise.resolve(null);
    void Promise.all([liveSource(sleeper, { leagueId, season, week }).poll(), rowsP]).then(
      ([snapshot, rows]) => { if (alive) setGot({ key, snapshot, rows, error: null }); },
      (e: unknown) => { if (alive) setGot({ key, snapshot: null, rows: null, error: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { alive = false; };
  }, [can, sleeper, leagueId, season, week, positions, key]);

  const mine = got && got.key === key ? got : null;
  const scoring = extras?.scoring ?? extras?.league.scoring_settings ?? NO_SCORING;
  const ctx = useMemo(() => (model && mine?.snapshot ? buildCtx({ model, week, scoring, rows: mine.rows }) : null), [model, week, scoring, mine]);
  const view = useMemo(() => (ctx && mine?.snapshot ? buildView(ctx, mine.snapshot) : null), [ctx, mine]);
  return { loading: can && !mine, error: mine?.error ?? null, snapshot: mine?.snapshot ?? null, ctx, view };
}
