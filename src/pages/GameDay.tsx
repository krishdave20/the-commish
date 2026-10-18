import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../app/usePageTitle';
import { dayMode } from '../app/live/day';
import { formatKickoff } from '../app/live/format';
import { useLive } from '../app/live/liveContext';
import { useModel } from '../app/modelContext';
import { FEATURE, PAGES } from '../app/names';
import { Attribution } from '../components/Attribution';
import { PageHeader } from '../components/PageHeader';
import { PageSkeleton } from '../components/Skeleton';
import { PageTabs } from '../components/PageTabs';
import { InfoTip } from '../components/InfoTip';
import { Segmented } from '../components/Segmented';
import { isPreGame } from '../engine/live';
import type { LiveCtx, LiveSnapshot, LiveView, RawChange } from '../engine/live';
import { AroundLeague, DriveChart, GameBalls, Sideline } from './gameday/League';
import { MainEvent } from './gameday/MainEvent';
import { ReplayBar } from './gameday/ReplayBar';
import { useWeekView } from './gameday/useWeekView';
import './gameday/gameday.css';

type Which = 'now' | 'last';
type LeagueTab = 'around' | 'balls' | 'drive' | 'sideline';

const TABS: Array<{ value: LeagueTab; label: string }> = [
  { value: 'around', label: FEATURE.aroundLeague },
  { value: 'balls', label: FEATURE.gameBalls },
  { value: 'drive', label: FEATURE.driveChart },
  { value: 'sideline', label: FEATURE.sideline },
];

interface Shown {
  view: LiveView;
  ctx: LiveCtx;
  snapshot: LiveSnapshot;
  frames: readonly LiveSnapshot[];
  changes: RawChange[];
}

export default function GameDay() {
  const m = useModel();
  const live = useLive();
  const [params, setParams] = useSearchParams();
  const page = PAGES.gameday;
  usePageTitle(page.path);

  // polls skip the 30 s cache while this page is open
  const { setOnGameDay } = live;
  useEffect(() => { setOnGameDay(true); return () => setOnGameDay(false); }, [setOnGameDay]);

  const now = live.snapshot?.clock ?? 0;
  const mode = live.snapshot ? dayMode(live.phase, live.snapshot.games, now) : 'live';
  const lastWeek = live.currentWeek - 1;
  const asked = params.get('week');
  // an off-day opens on last week's finals; the switch below brings back this week's projections
  const which: Which = live.replay ? 'now' : asked === 'last' ? 'last' : asked === 'now' ? 'now' : mode === 'off' && lastWeek >= 1 && !!live.snapshot ? 'last' : 'now';
  const wk = useWeekView(lastWeek, which === 'last' && lastWeek >= 1 && !live.replay);

  const { view: wkView, ctx: wkCtx, snapshot: wkSnap } = wk;
  const { view: liveView, ctx: liveCtx, snapshot: liveSnap, state: liveState } = live;
  const shown = useMemo<Shown | null>(() => (
    which === 'last'
      ? (wkView && wkCtx && wkSnap ? { view: wkView, ctx: wkCtx, snapshot: wkSnap, frames: [wkSnap], changes: [] } : null)
      : (liveView && liveCtx && liveSnap ? { view: liveView, ctx: liveCtx, snapshot: liveSnap, frames: liveState.frames, changes: liveState.changes } : null)
  ), [which, wkView, wkCtx, wkSnap, liveView, liveCtx, liveSnap, liveState]);

  const setParam = (k: string, v: string | null, replace = true) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (v === null) out.delete(k); else out.set(k, v);
      return out;
    }, { replace });
  };

  const focusId = Number(params.get('m'));
  const focus = useMemo(() => {
    if (!shown) return null;
    return shown.view.matchups.find((x) => x.id === focusId) ?? shown.view.mine ?? shown.view.matchups[0] ?? null;
  }, [shown, focusId]);
  const focusIsMine = !!focus && (focus.a.isMe || focus.b.isMe);

  const header = {
    asOf: live.asOf, fromCache: false, stale: false, error: live.error ?? wk.error ?? undefined,
    loading: live.loading || (which === 'last' && wk.loading), refresh: live.refresh,
  };

  if (!m.engine || !live.available) {
    return (
      <div className="page page-fade">
        <PageHeader kicker={page.kicker} title={page.name} data={m} />
        <p className={`note${m.error && !m.loading ? ' neg-c' : ''}`} role="status">
          {m.loading ? 'pulling your league and building the model.' : m.error ? `could not build the model. ${m.error}` : 'game day needs a league. link one from check in.'}
        </p>
        {m.loading && <PageSkeleton />}
      </div>
    );
  }

  const projected = shown ? isPreGame(shown.view) : false;
  const statusFor = () => {
    if (live.replay) return { label: `replay · week ${live.week}`, live: !live.snapshot?.complete, replay: true };
    if (which === 'last') return { label: `week ${lastWeek} · final`, live: false };
    if (mode === 'live') return { label: 'live', live: true };
    if (mode === 'final') return { label: `week ${live.week} · final`, live: false };
    if (mode === 'pre' && live.nextGame?.kickoff) return { label: `kickoff ${formatKickoff(live.nextGame.kickoff)}`, live: false };
    if (mode === 'between') return { label: `week ${live.week} · between games`, live: false };
    return { label: `week ${live.week} · projected`, live: false };
  };
  const nextLine = !live.live && live.nextGame?.kickoff
    ? `next kickoff: ${formatKickoff(live.nextGame.kickoff)} · ${live.nextGame.away} at ${live.nextGame.home}`.toLowerCase()
    : null;

  return (
    <div className="page page-fade gd">
      <PageHeader kicker={page.kicker} title={page.name} data={header} />

      <div className="gd-toolbar">
        {!live.replay && lastWeek >= 1 && (
          <Segmented
            label="week" value={which} onChange={(v) => setParam('week', v)}
            options={[{ value: 'now', label: `week ${live.currentWeek}` }, { value: 'last', label: `week ${lastWeek}` }]}
          />
        )}
        <ReplayBar />
      </div>
      {nextLine && <p className="gd-next">{nextLine}</p>}

      {shown && !focus ? (
        <p className="note" role="status">no matchups this week. a bye or an open week has nothing to score.</p>
      ) : !shown || !focus ? (
        <>
          <p className="note" role="status">
            {live.error ? `could not load the scores. ${live.error}` : which === 'last' && wk.error ? `could not load last week. ${wk.error}` : 'loading this week’s matchups…'}
          </p>
          {(live.loading || wk.loading) && <PageSkeleton cards={2} />}
        </>
      ) : (
        <>
          <MainEvent
            key={`${which}-${focus.id}`}
            m={focus} ctx={shown.ctx} frames={shown.frames} projected={projected} assumed={shown.view.assumed} status={statusFor()}
            onBackToMine={!focusIsMine && shown.view.mine ? () => setParam('m', null) : undefined}
          />
          <section className="gd-league" aria-label="around the league">
            <PageTabs tabs={TABS} label="league view" defaultTab="around">
              {(tab) => (
                <>
                  {tab === 'around' && (
                    <div className="gd-panel">
                      <div className="title-row">
                        <h2>{FEATURE.aroundLeague}</h2>
                        <InfoTip label={FEATURE.aroundLeague}>
                          <p>every other matchup. upset alert: a team that had under a 35% chance before kickoff and is ahead now. nail-biter: the closest matchup (within 12 points) with players still to play. blowout: the biggest margin, from 35 points. tap a card to make it the main event.</p>
                        </InfoTip>
                      </div>
                      <AroundLeague
                        matchups={shown.view.matchups} focusId={focus.id} projected={projected}
                        onOpen={(id) => { setParam('m', String(id)); window.scrollTo?.({ top: 0 }); }}
                      />
                    </div>
                  )}
                  {tab === 'balls' && (
                    <div className="gd-panel">
                      <div className="title-row">
                        <h2>{FEATURE.gameBalls}</h2>
                        <InfoTip label={FEATURE.gameBalls}><p>the five highest-scoring starters of the week across the league, by league scoring.</p></InfoTip>
                      </div>
                      <GameBalls balls={shown.view.gameBalls} />
                    </div>
                  )}
                  {tab === 'drive' && (
                    <div className="gd-panel">
                      <div className="title-row">
                        <h2>{FEATURE.driveChart}</h2>
                        <InfoTip label={FEATURE.driveChart}><p>each update compared with the one before: every starter whose points changed. kept in memory for this visit only, so it starts empty when you open the page.</p></InfoTip>
                      </div>
                      <DriveChart
                        changes={shown.changes} ctx={shown.ctx} snapshot={shown.snapshot}
                        empty={which === 'last' ? 'replay last week to watch the plays arrive.' : 'no scoring updates yet. plays appear here as they happen.'}
                      />
                    </div>
                  )}
                  {tab === 'sideline' && (
                    <div className="gd-panel">
                      <div className="title-row">
                        <h2>{FEATURE.sideline}</h2>
                        <InfoTip label={FEATURE.sideline}><p>points a team would have gained with the best lineup its roster allowed (by actual points so far) compared with the lineup it started.</p></InfoTip>
                      </div>
                      <Sideline rows={shown.view.bench} />
                    </div>
                  )}
                </>
              )}
            </PageTabs>
          </section>
        </>
      )}
      <Attribution sources={['sleeper']} />
    </div>
  );
}
