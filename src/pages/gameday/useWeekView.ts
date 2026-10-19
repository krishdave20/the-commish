import { useEffect, useMemo, useState } from 'react';
import type { ProjectionRow, SleeperClient } from '../../data';
import { buildCtx } from '../../app/live/ctx';
import { useData } from '../../app/dataContext';
import { useModel } from '../../app/modelContext';
import { buildView, pastWeekSource, weekPhase } from '../../engine/live';
import type { LiveCtx, LiveSnapshot, LiveView } from '../../engine/live';

const NO_SCORING: Record<string, number> = {};

export interface WeekView {
  loading: boolean;
  error: string | null;
  snapshot: LiveSnapshot | null;
  ctx: LiveCtx | null;
  view: LiveView | null;
}

interface Entry { snapshot: LiveSnapshot; rows: ProjectionRow[] | null }

/* A finished week never changes, so what was read for it is kept for the visit (per Sleeper client, so a test or an account switch starts clean).
   A week whose games are not all final yet is not kept: it is read again next time. */
const CACHE = new WeakMap<SleeperClient, Map<string, Entry>>();
const cacheOf = (s: SleeperClient) => { let m = CACHE.get(s); if (!m) { m = new Map(); CACHE.set(s, m); } return m; };

/** Read once and kept: the matchups of a past week (`/matchups/{week}`), its NFL games from the scores feed, and its projections (for "projected"
    labels and the pre-kickoff win chance only; the points are actual). */
export async function loadPastWeek(
  sleeper: SleeperClient, o: { leagueId: string; season: string; week: number; positions: readonly string[] | undefined },
): Promise<Entry> {
  const key = `${o.leagueId}|${o.season}|${o.week}`;
  const hit = cacheOf(sleeper).get(key);
  if (hit) return hit;
  const rowsP = typeof sleeper.projections === 'function' && o.positions
    ? sleeper.projections(o.season, o.week, o.positions as never).then((r) => r.data, () => null) : Promise.resolve(null);
  const [snapshot, rows] = await Promise.all([pastWeekSource(sleeper, o).poll(), rowsP]);
  const entry = { snapshot, rows };
  if (weekPhase(snapshot.games, snapshot.clock) === 'final') cacheOf(sleeper).set(key, entry);
  return entry;
}

/** Any finished week, read once (no polling): its final scores and everything derived from them. `enabled` false loads nothing. */
export function useWeekView(week: number, enabled: boolean): WeekView {
  const { sleeper } = useData();
  const { model, extras } = useModel();
  const [got, setGot] = useState<{ key: string; entry: Entry | null; error: string | null } | null>(null);
  const leagueId = model?.meta.leagueId ?? '';
  const season = model?.meta.season ?? '';
  const positions = model?.meta.positions;
  const key = `${leagueId}|${season}|${week}`;
  const can = enabled && !!sleeper && !!model && week >= 1 && typeof sleeper.liveMatchups === 'function';

  useEffect(() => {
    if (!can || !sleeper) return;
    let alive = true;
    void loadPastWeek(sleeper, { leagueId, season, week, positions }).then(
      (entry) => { if (alive) setGot({ key, entry, error: null }); },
      (e: unknown) => { if (alive) setGot({ key, entry: null, error: e instanceof Error ? e.message : String(e) }); },
    );
    return () => { alive = false; };
  }, [can, sleeper, leagueId, season, week, positions, key]);

  const mine = got && got.key === key ? got : null;
  const entry = mine?.entry ?? null;
  const scoring = extras?.scoring ?? extras?.league.scoring_settings ?? NO_SCORING;
  const ctx = useMemo(() => (model && entry ? buildCtx({ model, week, scoring, rows: entry.rows }) : null), [model, week, scoring, entry]);
  const view = useMemo(() => (ctx && entry ? buildView(ctx, entry.snapshot) : null), [ctx, entry]);
  return { loading: can && !mine, error: mine?.error ?? null, snapshot: entry?.snapshot ?? null, ctx, view };
}
