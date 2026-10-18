import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/dataContext';
import { useResource } from '../../app/hooks';
import type { Fetcher } from '../../app/resourceStore';
import { useLive } from '../../app/live/liveContext';
import { compactWeek, overlayLive, parseGameRows } from '../../engine/nfl';
import type { NfGame, WeekOfStats } from '../../engine/nfl';
import { fetchSeasonResults, fetchSeasonStats, fetchWeekGames } from './data';

export interface WeekGames {
  games: NfGame[] | null;
  asOf: number | null;
  loading: boolean;
  error: string | undefined;
  stale: boolean;
  /** goes back to the network for this week (the live poller is refreshed by the page) */
  refresh: () => Promise<void>;
}

/** One NFL week's games. Week 0 means "off" (the hook then returns nothing, so a page can call it twice without doubling up).
    For the week in progress the live poller is the source of state, clock and scores (one poller for the whole app); the scores feed
    adds what the poller does not carry, and is read again (a cached read, 30 s) when the poller brings new data. */
export function useWeekGames(season: string, week: number, currentWeek: number): WeekGames {
  const { sleeper } = useData();
  const live = useLive();
  const isCurrent = week > 0 && week === currentWeek;
  const kind = week < currentWeek ? 'past' : 'now';
  const key = season && week > 0 && sleeper ? `nfl-week:${season}:${week}:${kind}` : null;
  const fetcher = useMemo<Fetcher<NfGame[]> | null>(
    () => (sleeper && season && week > 0 ? (o) => fetchWeekGames(sleeper, season, week, currentWeek, o) : null),
    [sleeper, season, week, currentWeek],
  );
  const res = useResource(key, fetcher);

  const snap = isCurrent && !live.replay ? live.snapshot : null;
  const stamp = snap?.at ?? null;
  const anyLive = !!snap?.games.some((g) => g.state === 'live');
  const [fresh, setFresh] = useState<{ key: string; rows: NfGame[] } | null>(null);
  useEffect(() => {
    if (!key || !sleeper || !isCurrent || stamp === null || !anyLive || typeof sleeper.scores !== 'function') return;
    let alive = true;
    void sleeper.scores(season, week).then((r) => { if (alive) setFresh({ key, rows: parseGameRows(r.data, week) }); }, () => undefined);
    return () => { alive = false; };
  }, [key, sleeper, isCurrent, stamp, anyLive, season, week]);

  const base = fresh && fresh.key === key ? fresh.rows : res.data ?? null;
  const games = useMemo<NfGame[] | null>(() => {
    if (!snap) return base;
    if (base) return overlayLive(base, snap.games);
    return snap.games.length
      ? snap.games.map((g): NfGame => ({ ...g, week, channel: null, stadiumCity: null, homeRecord: null, awayRecord: null, line: null }))
      : null;
  }, [base, snap, week]);

  return {
    games, asOf: snap ? Math.max(snap.at, res.asOf ?? 0) : res.asOf, loading: week > 0 && res.loading && !games, error: res.error, stale: res.stale,
    refresh: res.refresh,
  };
}

export interface SeasonResults {
  /** the finished weeks have been read (the standings are complete) */
  ready: boolean;
  /** every game of weeks 1 to currentWeek (the current week from the poller), final or not */
  games: NfGame[];
  asOf: number | null;
  loading: boolean;
  error: string | undefined;
  stale: boolean;
  refresh: () => Promise<void>;
}

/** The games the standings are built from: finished weeks from the scores feed, plus the current week. `enabled` false loads nothing. */
export function useSeasonResults(season: string, currentWeek: number, current: NfGame[] | null, enabled: boolean): SeasonResults {
  const { sleeper } = useData();
  const key = enabled && season && currentWeek > 0 && sleeper ? `nfl-results:${season}:${currentWeek}` : null;
  const fetcher = useMemo<Fetcher<NfGame[]> | null>(
    () => (sleeper && season ? (o) => fetchSeasonResults(sleeper, season, currentWeek, o) : null),
    [sleeper, season, currentWeek],
  );
  const res = useResource(key, fetcher);
  const games = useMemo(() => [...(res.data ?? []), ...(current ?? [])], [res.data, current]);
  return { games, ready: res.data !== undefined, asOf: res.asOf, loading: res.loading, error: res.error, stale: res.stale, refresh: res.refresh };
}

export interface SeasonStats {
  /** weeks 1 to the current week, in order (the current week from the 30 s stats read) */
  weeks: WeekOfStats[];
  asOf: number | null;
  loading: boolean;
  error: string | undefined;
  stale: boolean;
  refresh: () => Promise<void>;
}

/** The stat lines the league leaders sum. Finished weeks are kept for a day; the current week is read at the live TTL, again whenever the live
    poller brings new data while a game is on. `enabled` false loads nothing. */
export function useSeasonStats(season: string, currentWeek: number, enabled: boolean): SeasonStats {
  const { sleeper } = useData();
  const live = useLive();
  const key = enabled && season && currentWeek > 0 && sleeper ? `nfl-stats:${season}:${currentWeek}` : null;
  const fetcher = useMemo<Fetcher<WeekOfStats[]> | null>(
    () => (sleeper && season && typeof sleeper.pastStats === 'function' ? (o) => fetchSeasonStats(sleeper, season, currentWeek, o) : null),
    [sleeper, season, currentWeek],
  );
  const res = useResource(key, fetcher);

  const stamp = !live.replay && live.snapshot?.games.some((g) => g.state === 'live') ? live.snapshot.at : 0;
  const [cur, setCur] = useState<{ key: string; stats: WeekOfStats['stats']; at: number } | null>(null);
  const curKey = `${season}:${currentWeek}`;
  useEffect(() => {
    if (!enabled || !sleeper || !season || currentWeek < 1) return;
    const read = typeof sleeper.liveStats === 'function' ? sleeper.liveStats : sleeper.stats;
    if (typeof read !== 'function') return;
    let alive = true;
    void read(season, currentWeek).then((r) => { if (alive) setCur({ key: curKey, stats: compactWeek(r.data), at: r.asOf }); }, () => undefined);
    return () => { alive = false; };
  }, [enabled, sleeper, season, currentWeek, curKey, stamp]);

  const weeks = useMemo<WeekOfStats[]>(
    () => [...(res.data ?? []), ...(cur && cur.key === curKey ? [{ week: currentWeek, stats: cur.stats }] : [])],
    [res.data, cur, curKey, currentWeek],
  );
  const refreshPast = res.refresh;
  const refresh = useCallback(async () => {
    await refreshPast();
    if (sleeper && season && currentWeek > 0) {
      const read = typeof sleeper.liveStats === 'function' ? sleeper.liveStats : sleeper.stats;
      if (typeof read === 'function') { const r = await read(season, currentWeek, { force: true }); setCur({ key: curKey, stats: compactWeek(r.data), at: r.asOf }); }
    }
  }, [refreshPast, sleeper, season, currentWeek, curKey]);
  return {
    weeks, asOf: res.asOf === null ? null : Math.min(res.asOf, cur && cur.key === curKey ? cur.at : res.asOf),
    loading: res.loading || (enabled && !!key && !(cur && cur.key === curKey)), error: res.error, stale: res.stale, refresh,
  };
}
