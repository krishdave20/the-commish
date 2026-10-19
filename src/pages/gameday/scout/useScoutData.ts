/* What the scouting tab reads beyond the matchup on screen: the finished weeks before it (matchups and projections, for the season
   tendencies), the league's transactions, and player names for the moves. Each is read through the data layer's own cache; the finished weeks
   are also kept in memory for the visit (per Sleeper client), like the game day week views. */
import { useEffect, useMemo, useState } from 'react';
import { buildCtx } from '../../../app/live/ctx';
import { useData } from '../../../app/dataContext';
import { useModel } from '../../../app/modelContext';
import { usePlayersFileIf } from './usePlayersFileIf';
import { buildView, rowsFromMatchups } from '../../../engine/live';
import type { LiveRow, LiveView } from '../../../engine/live';
import type { ProjectionRow, SleeperClient, Transaction } from '../../../data';

const NO_SCORING: Record<string, number> = {};

interface PastEntry { rows: LiveRow[]; proj: ProjectionRow[] | null }

const CACHE = new WeakMap<SleeperClient, Map<string, PastEntry>>();
const cacheOf = (s: SleeperClient) => { let m = CACHE.get(s); if (!m) { m = new Map(); CACHE.set(s, m); } return m; };

async function loadPast(sleeper: SleeperClient, o: { leagueId: string; season: string; week: number; positions: readonly string[] | undefined }): Promise<PastEntry | null> {
  const key = `${o.leagueId}|${o.season}|${o.week}`;
  const hit = cacheOf(sleeper).get(key);
  if (hit) return hit;
  const matchups = await sleeper.matchups(o.leagueId, o.week).then((r) => r.data, () => null);
  if (!matchups || matchups.length === 0) return null;
  const proj = typeof sleeper.projections === 'function' && o.positions
    ? await sleeper.projections(o.season, o.week, o.positions as never).then((r) => r.data, () => null) : null;
  const entry = { rows: rowsFromMatchups(matchups), proj: proj && proj.length ? proj : null };
  cacheOf(sleeper).set(key, entry);
  return entry;
}

export interface PastViews {
  loading: boolean;
  /** each finished week before `week`, as the engine's own view of it */
  views: Array<{ view: LiveView; projected: boolean }>;
}

/** Weeks 1 to `week - 1`. `enabled` false loads nothing. A week Sleeper has no matchups for is skipped. */
export function usePastViews(week: number, enabled: boolean): PastViews {
  const { sleeper } = useData();
  const { model, extras } = useModel();
  const leagueId = model?.meta.leagueId ?? '';
  const season = model?.meta.season ?? '';
  const positions = model?.meta.positions;
  const can = enabled && !!sleeper && !!model && week > 1 && typeof sleeper.matchups === 'function';
  const key = `${leagueId}|${season}|${week}`;
  const [got, setGot] = useState<{ key: string; entries: Array<[number, PastEntry]> } | null>(null);

  useEffect(() => {
    if (!can || !sleeper) return;
    let alive = true;
    const weeks = Array.from({ length: week - 1 }, (_, i) => i + 1);
    void Promise.all(weeks.map((w) => loadPast(sleeper, { leagueId, season, week: w, positions }).then((e) => [w, e] as const, () => [w, null] as const)))
      .then((all) => { if (alive) setGot({ key, entries: all.filter((x): x is [number, PastEntry] => x[1] !== null) }); });
    return () => { alive = false; };
  }, [can, sleeper, leagueId, season, week, positions, key]);

  const scoring = extras?.scoring ?? extras?.league.scoring_settings ?? NO_SCORING;
  const mine = got && got.key === key ? got : null;
  const views = useMemo(() => {
    if (!model || !mine) return [];
    return mine.entries.map(([w, e]) => {
      const ctx = buildCtx({ model, week: w, scoring, rows: e.proj });
      const view = buildView(ctx, { week: w, at: 0, clock: 0, kind: 'live', rows: e.rows, games: [], gamesKnown: false });
      return { view, projected: e.proj !== null };
    });
  }, [model, mine, scoring]);
  return { loading: can && !mine, views };
}

/** The league's transactions of weeks `week - 1` and `week`. Empty while loading or when the client has no transactions endpoint. */
export function useTransactions(week: number, enabled: boolean): { loading: boolean; transactions: Transaction[] } {
  const { sleeper } = useData();
  const { model } = useModel();
  const leagueId = model?.meta.leagueId ?? '';
  const can = enabled && !!sleeper && !!leagueId && week >= 1 && typeof sleeper.transactions === 'function';
  const key = `${leagueId}|${week}`;
  const [got, setGot] = useState<{ key: string; list: Transaction[] } | null>(null);

  useEffect(() => {
    if (!can || !sleeper) return;
    let alive = true;
    const weeks = week > 1 ? [week - 1, week] : [week];
    void Promise.all(weeks.map((w) => sleeper.transactions(leagueId, w).then((r) => r.data, () => [] as Transaction[])))
      .then((lists) => {
        if (!alive) return;
        // a transaction belongs to one week, but never trust two reads not to overlap
        const seen = new Set<string>();
        setGot({ key, list: lists.flat().filter((t) => !seen.has(t.transaction_id) && !!seen.add(t.transaction_id)) });
      });
    return () => { alive = false; };
  }, [can, sleeper, leagueId, week, key]);

  const mine = got && got.key === key ? got : null;
  return { loading: can && !mine, transactions: mine?.list ?? [] };
}

/** Names for players the model does not carry (long-dropped free agents): the players file, fetched only when `needed`. */
export { usePlayersFileIf };
