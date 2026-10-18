import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ProjectionRow, SleeperClient } from '../../data';
import {
  INITIAL_LIVE, LIVE_INTERVAL_MS, buildView, createPoller, liveReducer, liveSource, nextKickoff, parseScores, pollPlan, replaySource, restDelay, weekPhase,
} from '../../engine/live';
import type { LiveSnapshot, NflGame, ReplaySource } from '../../engine/live';
import { useData } from '../dataContext';
import { useModel } from '../modelContext';
import { buildCtx } from './ctx';
import { LiveContext } from './liveContext';
import type { LiveValue } from './liveContext';

const REPLAY_TICK_MS = 700;

/** The first game of the following week: from its scores (real kickoff times), else from the plain schedule (the first game day at midnight). */
async function nextWeekKickoff(sleeper: SleeperClient, season: string, week: number): Promise<NflGame | null> {
  const scores = await sleeper.scores(season, week).then((r) => parseScores(r.data), () => [] as NflGame[]);
  const first = nextKickoff(scores, Date.now());
  if (first) return first;
  const sched = await (typeof sleeper.schedule === 'function' ? sleeper.schedule(season).then((r) => r.data, () => []) : Promise.resolve([]));
  const days = sched.filter((g) => g.week === week && typeof g.date === 'string').map((g) => Date.parse(`${g.date}T00:00:00`)).filter((t) => Number.isFinite(t));
  if (!days.length) return null;
  const g = sched.find((x) => x.week === week)!;
  return { id: g.game_id ?? `${g.away}@${g.home}`, home: g.home, away: g.away, kickoff: Math.min(...days), state: 'pre', quarter: '', clock: '', homeScore: null, awayScore: null, elapsed: 0 };
}
const NO_SCORING: Record<string, number> = {};

/** The one live poller for the whole app: game day, the score ticker and the nav's live dot all read it.
    It polls only while NFL games are on (or about to start), pauses while the tab is hidden, backs off on errors and stops when
    every game is final. A replay of last week swaps the real source for a simulated one behind the same interface. */
export function LiveProvider({ children }: { children: ReactNode }) {
  const { sleeper } = useData();
  const { model, extras, refresh: refreshModel } = useModel();
  const refreshModelRef = useRef(refreshModel);
  useEffect(() => { refreshModelRef.current = refreshModel; }, [refreshModel]);
  const [state, dispatch] = useReducer(liveReducer, INITIAL_LIVE);
  const [replay, setReplay] = useState<ReplaySource | null>(null);
  const [replayWeek, setReplayWeek] = useState<number | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ key: string; rows: ProjectionRow[] } | null>(null);
  const [upcoming, setUpcoming] = useState<{ key: string; game: NflGame | null } | null>(null);
  const onGameDay = useRef(false);
  const poller = useRef<ReturnType<typeof createPoller<LiveSnapshot>> | null>(null);

  const can = !!(sleeper && model && typeof sleeper.liveMatchups === 'function' && typeof sleeper.scores === 'function');
  const season = model?.meta.season ?? '';
  const leagueId = model?.meta.leagueId ?? '';
  const currentWeek = model?.meta.currentWeek ?? 0;
  const week = replay && replayWeek ? replayWeek : currentWeek;
  const scoring = extras?.scoring ?? extras?.league.scoring_settings ?? NO_SCORING;
  const positions = model?.meta.positions;

  /* the week's projections (cached 6 h by the data layer: the model's own pull already holds this week and the last four) */
  const rowsKey = `${leagueId}|${season}|${week}`;
  useEffect(() => {
    if (!can || !sleeper || !positions || typeof sleeper.projections !== 'function' || week < 1) return;
    let alive = true;
    void sleeper.projections(season, week, positions).then(
      (r) => { if (alive) setRows({ key: rowsKey, rows: r.data }); },
      () => { if (alive) setRows({ key: rowsKey, rows: [] }); },
    );
    return () => { alive = false; };
  }, [can, sleeper, season, week, positions, rowsKey]);
  const projRows = rows && rows.key === rowsKey ? rows.rows : null;

  // wait for the week's projections (a cached read, normally): the model's own number for a player who already played is his actual
  // points, which would make the pre-game win chance flicker from a wrong value to the right one
  const waitRows = can && !!sleeper && typeof sleeper.projections === 'function' && projRows === null;
  const ctx = useMemo(
    () => (model && week > 0 && !waitRows ? buildCtx({ model, week, scoring, rows: projRows }) : null),
    [model, week, scoring, projRows, waitRows],
  );

  const liveSrc = useMemo(
    () => (can && sleeper && currentWeek > 0 ? liveSource(sleeper, { leagueId, season, week: currentWeek }) : null),
    [can, sleeper, leagueId, season, currentWeek],
  );
  const source = replay ?? liveSrc;
  const upKey = `${leagueId}|${season}|${currentWeek + 1}`;

  /* the poller */
  useEffect(() => {
    dispatch({ type: 'reset' });
    if (!source) { poller.current = null; return; }
    let n = 0;
    // after the last game of the week the poller rests until the next kickoff instead of stopping for good
    let resting = false;
    let restFor = 0;
    const p = createPoller<LiveSnapshot>({
      baseMs: LIVE_INTERVAL_MS,
      poll: async (manual) => {
        if (resting && sleeper && source.kind === 'live' && typeof sleeper.nflState === 'function') {
          // woken from a rest: has the NFL calendar moved on to a new week? Then rebuild the model for it, which swaps this source.
          const st = await sleeper.nflState({ force: true }).then((r) => r.data, () => null);
          if (st && st.season_type === 'regular' && st.week !== currentWeek) void refreshModelRef.current();
        }
        // the first poll may use a fresh cached copy; later ones skip the cache on the game day page, and elsewhere lean on the 30 s TTL
        const snap = await source.poll({ force: manual || (n++ > 0 && onGameDay.current) });
        resting = false;
        if (source.kind === 'live' && sleeper && pollPlan(snap.games, Date.now()).mode === 'stop') {
          const at = await nextWeekKickoff(sleeper, season, currentWeek + 1);
          setUpcoming({ key: upKey, game: at });
          restFor = restDelay(at?.kickoff ?? null, Date.now());
          resting = true;
        }
        return snap;
      },
      next: (snap) => {
        if (source.kind === 'replay') return snap.complete ? null : REPLAY_TICK_MS;
        if (resting) return restFor;
        const plan = pollPlan(snap.games, Date.now());
        return plan.mode === 'stop' ? restDelay(null, Date.now()) : plan.delay;
      },
      onResult: (snapshot) => dispatch({ type: 'polled', snapshot }),
      onError: (e) => dispatch({ type: 'failed', message: e instanceof Error ? e.message : String(e) }),
    });
    poller.current = p;
    p.start();
    return () => { p.stop(); if (poller.current === p) poller.current = null; };
  }, [source, sleeper, season, currentWeek, upKey]);

  const snapshot = state.snapshot;
  const phase = useMemo(() => (snapshot ? weekPhase(snapshot.games, snapshot.clock) : 'unknown'), [snapshot]);
  const view = useMemo(() => (ctx && snapshot ? buildView(ctx, snapshot) : null), [ctx, snapshot]);
  const live = phase === 'live' || (!!replay && !snapshot?.complete);

  /* the next kickoff: this week's, or next week's (fetched when the poller rests) once this week is over */
  const here = snapshot ? nextKickoff(snapshot.games, snapshot.clock) : null;
  const nextGame = here ?? (!replay && upcoming && upcoming.key === upKey ? upcoming.game : null);

  const startReplay = useCallback(async () => {
    if (!sleeper || !model || currentWeek < 2) { setReplayError('there is no finished week to replay yet.'); return; }
    const w = currentWeek - 1;
    setReplayLoading(true);
    setReplayError(null);
    try {
      const [m, s, pr] = await Promise.all([
        sleeper.liveMatchups(leagueId, w),
        sleeper.scores(season, w),
        typeof sleeper.projections === 'function' ? sleeper.projections(season, w, model.meta.positions).then((r) => r.data, () => null) : Promise.resolve(null),
      ]);
      const games = parseScores(s.data).filter((g) => g.kickoff !== null);
      if (!games.length) throw new Error('last week’s kickoff times are not available.');
      const c = buildCtx({ model, week: w, scoring, rows: pr });
      setReplayWeek(w);
      setReplay(replaySource({ week: w, matchups: m.data, games, teamOf: (pid) => c.players[pid]?.nfl ?? null }));
    } catch (e) {
      setReplayError(e instanceof Error ? e.message : String(e));
    } finally {
      setReplayLoading(false);
    }
  }, [sleeper, model, currentWeek, leagueId, season, scoring]);

  const stopReplay = useCallback(() => { setReplay(null); setReplayWeek(null); setReplayError(null); }, []);
  const refresh = useCallback(async () => { await poller.current?.pollNow(); }, []);
  const setOnGameDay = useCallback((on: boolean) => { onGameDay.current = on; }, []);

  const value = useMemo<LiveValue>(() => ({
    available: can, loading: can && !snapshot && !state.error, error: state.error, week, currentWeek, ctx, state, snapshot, view, phase, live,
    asOf: snapshot?.at ?? null, nextGame, replay, replayLoading, replayError, startReplay, stopReplay, refresh, setOnGameDay,
  }), [can, snapshot, state, week, currentWeek, ctx, view, phase, live, nextGame, replay, replayLoading, replayError, startReplay, stopReplay, refresh, setOnGameDay]);

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
