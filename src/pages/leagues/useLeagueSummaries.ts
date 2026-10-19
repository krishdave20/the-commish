import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/dataContext';
import { useAccounts, useNflState } from '../../app/hooks';
import type { Freshness } from '../../app/hooks';
import { useLiveMaybe } from '../../app/live/liveContext';
import type { LeagueUser, LinkedAccount, Matchup, NflState, ProjectionRow, SleeperLeague, SleeperRoster } from '../../data';
import { summarizeLeague } from '../../engine/almanac';
import type { LeagueSummary } from '../../engine/almanac';

/** One followed league of one linked account: a card on the dashboard. */
export interface FollowedLeague { key: string; account: LinkedAccount; leagueId: string }

export interface CardState {
  status: 'waiting' | 'loading' | 'done' | 'error';
  summary?: LeagueSummary;
  error?: string;
  /** the NFL week the matchup is for (null: no matchup to show) */
  week: number | null;
}

export const followedOf = (accounts: readonly LinkedAccount[]): FollowedLeague[] =>
  accounts.flatMap((a) => a.leagueIds.map((leagueId) => ({ key: `${a.userId}:${leagueId}`, account: a, leagueId })));

/** The week whose matchup the card shows: the NFL week while the league is being played, else none. */
export function weekFor(league: Pick<SleeperLeague, 'status' | 'season'>, nfl: NflState | undefined): number | null {
  if (!nfl || league.status !== 'in_season' || league.season !== nfl.season) return null;
  return nfl.season_type === 'regular' || nfl.season_type === 'post' ? nfl.week : null;
}

interface Raw { league: SleeperLeague; rosters: SleeperRoster[]; users: LeagueUser[]; matchups: Matchup[] | null; week: number | null }

const POLL_MS = 60_000;

/** A light summary for each followed league, loaded one league at a time through the shared Sleeper client (and so its limiter): the league,
    its rosters and users, and this week's matchups. No model. Once every league is in, one projections file for the week is fetched for the
    pregame numbers. While NFL games are on, the matchups are refreshed once a minute. */
export function useLeagueSummaries(): { entries: FollowedLeague[]; cards: Record<string, CardState>; fresh: Freshness } {
  const { sleeper } = useData();
  const { data: accounts = [] } = useAccounts();
  const nfl = useNflState();
  const live = useLiveMaybe()?.live ?? false;
  // useAccounts hands back a fresh array every render; the list of followed leagues changes only when this signature does
  const entriesKey = accounts.map((a) => `${a.userId}:${a.leagueIds.join(',')}`).join('|');
  const entries = useMemo(() => followedOf(accounts), [entriesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // bumped by Refresh: the first-load effect runs again from scratch
  const [reload, setReload] = useState(0);
  const [cards, setCards] = useState<Record<string, CardState>>({});
  const [asOf, setAsOf] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const raw = useRef(new Map<string, Raw>());
  const proj = useRef(new Map<string, ProjectionRow[]>());
  const nflState = nfl.data;
  const season = nflState?.season ?? '';

  const patch = useCallback((key: string, c: CardState) => setCards((prev) => ({ ...prev, [key]: c })), []);

  const summarize = useCallback((e: FollowedLeague): CardState | null => {
    const r = raw.current.get(e.key);
    if (!r) return null;
    const projections = r.week != null ? proj.current.get(`${r.league.season}:${r.week}`) ?? null : null;
    const summary = summarizeLeague({ league: r.league, rosters: r.rosters, users: r.users, userId: e.account.userId, matchups: r.matchups, week: r.week ?? 0, projections });
    return { status: 'done', summary, week: r.week };
  }, []);

  /** this week's matchups for one league */
  const matchupsFor = useCallback(async (leagueId: string, wk: number, force: boolean): Promise<Matchup[] | null> => {
    if (!sleeper) return null;
    const get = typeof sleeper.liveMatchups === 'function' ? sleeper.liveMatchups : typeof sleeper.matchups === 'function' ? sleeper.matchups : null;
    if (!get) return null;
    const m = await get(leagueId, wk, force ? { force: true } : undefined);
    return m.data;
  }, [sleeper]);

  // first load: one league after another, then the projections, once
  useEffect(() => {
    if (!sleeper || !nflState || entries.length === 0) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      for (const e of entries) {
        if (cancelled) return;
        if (raw.current.has(e.key)) { const s = summarize(e); if (s) patch(e.key, s); continue; }
        patch(e.key, { status: 'loading', week: null });
        try {
          const [l, r, u] = await Promise.all([sleeper.league(e.leagueId), sleeper.rosters(e.leagueId), sleeper.users(e.leagueId)]);
          const wk = weekFor(l.data, nflState);
          const matchups = wk != null ? await matchupsFor(e.leagueId, wk, false).catch(() => null) : null;
          raw.current.set(e.key, { league: l.data, rosters: r.data, users: u.data, matchups, week: wk });
          setAsOf((prev) => Math.min(prev ?? Infinity, l.asOf, r.asOf));
          if (cancelled) return;
          patch(e.key, summarize(e)!);
        } catch (err) {
          if (cancelled) return;
          patch(e.key, { status: 'error', error: err instanceof Error ? err.message : String(err), week: null });
        }
      }
      // pregame numbers: one projections file for the week, shared by every league that is playing
      const wk = [...raw.current.values()].find((r) => r.week != null)?.week;
      if (!cancelled && wk != null && typeof sleeper.projections === 'function' && !proj.current.has(`${season}:${wk}`)) {
        try {
          const p = await sleeper.projections(season, wk);
          proj.current.set(`${season}:${wk}`, p.data);
          if (!cancelled) for (const e of entries) { const s = summarize(e); if (s) patch(e.key, s); }
        } catch { /* the projection is a nicety: the score and the standing are already there */ }
      }
      if (!cancelled) setBusy(false);
    })();
    return () => { cancelled = true; setBusy(false); };
  }, [sleeper, nflState, entries, summarize, matchupsFor, patch, season, reload]);

  /** matchups only, one league at a time, skipping the cache */
  const refreshMatchups = useCallback(async () => {
    setBusy(true);
    for (const e of entries) {
      const r = raw.current.get(e.key);
      if (!r || r.week == null) continue;
      try {
        r.matchups = await matchupsFor(e.leagueId, r.week, true);
        const s = summarize(e);
        if (s) patch(e.key, s);
      } catch { /* keep the card as it was */ }
    }
    setAsOf(Date.now());
    setBusy(false);
  }, [entries, matchupsFor, summarize, patch]);

  // games are on: a minute between looks at the other leagues (the shared live poller covers only the league you are following)
  useEffect(() => {
    if (!live || entries.length < 2) return;
    const t = setInterval(() => { void refreshMatchups(); }, POLL_MS);
    return () => clearInterval(t);
  }, [live, entries, refreshMatchups]);

  const refresh = useCallback(async () => {
    // the whole dashboard again: forget what was loaded and let the first-load effect run
    raw.current.clear();
    proj.current.clear();
    setCards({});
    setAsOf(null);
    setReload((n) => n + 1);
    await nfl.refresh();
  }, [nfl]);

  const loading = busy || Object.values(cards).some((c) => c.status === 'loading');
  const failed = Object.values(cards).find((c) => c.status === 'error')?.error;
  return {
    entries, cards,
    fresh: { asOf: asOf === Infinity ? null : asOf, fromCache: false, stale: false, error: failed, loading: loading || nfl.loading, refresh },
  };
}
