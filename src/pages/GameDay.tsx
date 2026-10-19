import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePageTitle } from '../app/usePageTitle';
import { dayMode } from '../app/live/day';
import { formatKickoff } from '../app/live/format';
import { useLive } from '../app/live/liveContext';
import { useModel } from '../app/modelContext';
import { FEATURE, PAGES } from '../app/names';
import { FieldStrip } from '../components/art/FieldStrip';
import { Attribution } from '../components/Attribution';
import { PageHeader } from '../components/PageHeader';
import { PageSkeleton } from '../components/Skeleton';
import { PageTabs } from '../components/PageTabs';
import { InfoTip } from '../components/InfoTip';
import { Segmented } from '../components/Segmented';
import { gamesByTeam, isPreGame, standingsMoves, storylines } from '../engine/live';
import type { LiveCtx, LiveSnapshot, LiveView, RawChange } from '../engine/live';
import { AroundLeague } from './gameday/Around';
import { SORTS } from './gameday/aroundSort';
import type { SortKey } from './gameday/aroundSort';
import { DriveTab } from './gameday/DriveTab';
import { GameBalls, Sideline } from './gameday/League';
import { MainEvent } from './gameday/MainEvent';
import { GamesContext, HeadToHead, HeadToHeadFor, Hinges } from './gameday/matchup';
import { ReplayBar } from './gameday/ReplayBar';
import { StandingsMoves, Storylines } from './gameday/Storylines';
import { useWeekView } from './gameday/useWeekView';
import { WeekPicker } from './gameday/WeekPicker';
import { weekList } from './gameday/weekRange';
import { resolveWeek } from './gameday/weekParam';
import './gameday/gameday.css';

type LeagueTab = 'around' | 'h2h' | 'hinges' | 'balls' | 'drive' | 'sideline';

const ALL_TABS: Array<{ value: LeagueTab; label: string }> = [
  { value: 'around', label: FEATURE.aroundLeague },
  { value: 'h2h', label: 'head to head' },
  { value: 'hinges', label: 'hinges on' },
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
  const [sort, setSort] = useState<SortKey>('live');
  const page = PAGES.gameday;
  usePageTitle(page.path);

  // polls skip the 30 s cache while this page is open
  const { setOnGameDay } = live;
  useEffect(() => { setOnGameDay(true); return () => setOnGameDay(false); }, [setOnGameDay]);

  const now = live.snapshot?.clock ?? 0;
  const mode = live.snapshot ? dayMode(live.phase, live.snapshot.games, now) : 'live';
  const currentWeek = live.currentWeek;
  // which week: a replay pins its own week; else ?week=N; an off-day opens on last week's finals
  const selected = live.replay ? live.week : resolveWeek(params.get('week'), currentWeek, mode === 'off' && currentWeek > 1 && !!live.snapshot);
  const fromLive = !!live.replay || selected === currentWeek;
  // a finished week with no replay is read once (and kept); the week in progress and a replay come from the one shared poller
  const wk = useWeekView(selected, !fromLive);

  const { view: wkView, ctx: wkCtx, snapshot: wkSnap } = wk;
  const { view: liveView, ctx: liveCtx, snapshot: liveSnap, state: liveState } = live;
  const shown = useMemo<Shown | null>(() => (
    !fromLive
      ? (wkView && wkCtx && wkSnap ? { view: wkView, ctx: wkCtx, snapshot: wkSnap, frames: [wkSnap], changes: [] } : null)
      : (liveView && liveCtx && liveSnap ? { view: liveView, ctx: liveCtx, snapshot: liveSnap, frames: liveState.frames, changes: liveState.changes } : null)
  ), [fromLive, wkView, wkCtx, wkSnap, liveView, liveCtx, liveSnap, liveState]);

  const setParam = (k: string, v: string | null, replace = true) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (v === null) out.delete(k); else out.set(k, v);
      return out;
    }, { replace });
  };
  const pickWeek = (w: number) => {
    if (live.replay && w !== live.week) live.stopReplay();
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      out.set('week', String(w));
      out.delete('m');
      return out;
    }, { replace: false });
  };

  const focusId = Number(params.get('m'));
  const focus = useMemo(() => {
    if (!shown) return null;
    return shown.view.matchups.find((x) => x.id === focusId) ?? shown.view.mine ?? shown.view.matchups[0] ?? null;
  }, [shown, focusId]);
  const focusIsMine = !!focus && (focus.a.isMe || focus.b.isMe);
  const games = useMemo(() => (shown ? gamesByTeam(shown.snapshot.games) : null), [shown]);

  /* the week's story: standings movement and the storylines, both from the matchups on screen */
  const model = m.model;
  const over = !!shown && shown.view.counts.yet + shown.view.counts.live === 0;
  const moves = useMemo(() => {
    if (!model || !shown) return [];
    return standingsMoves({
      teams: model.teams.map((t) => ({ rid: t.rid, name: t.team, divId: t.divId, isMe: t.isMe })),
      history: model.history, week: selected, lastRegularWeek: model.meta.lastRegularWeek,
      results: shown.view.matchups.filter((x) => x.started).map((x) => ({ a: x.a.rid, b: x.b.rid, ptsA: x.a.actual, ptsB: x.b.actual })),
      rules: { playoffTeams: model.meta.playoffTeams, divisions: model.meta.divisions },
    });
  }, [model, shown, selected]);
  const stories = useMemo(() => (
    shown && model ? storylines({ view: shown.view, ctx: shown.ctx, frames: shown.frames, moves, past: over, playoffTeams: model.meta.playoffTeams }) : []
  ), [shown, model, moves, over]);

  const header = {
    asOf: live.asOf, fromCache: false, stale: false, error: live.error ?? wk.error ?? undefined,
    loading: live.loading || (!fromLive && wk.loading), refresh: live.refresh,
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
  const isCurrent = selected === currentWeek;
  const review = !fromLive;
  const statusFor = () => {
    if (live.replay) return { label: `replay · week ${live.week}`, live: !live.snapshot?.complete, replay: true };
    if (!isCurrent) return { label: `week ${selected} · final`, live: false };
    if (mode === 'live') return { label: 'live', live: true };
    if (mode === 'final') return { label: `week ${live.week} · final`, live: false };
    if (mode === 'pre' && live.nextGame?.kickoff) return { label: `kickoff ${formatKickoff(live.nextGame.kickoff)}`, live: false };
    if (mode === 'between') return { label: `week ${live.week} · between games`, live: false };
    return { label: `week ${live.week} · projected`, live: false };
  };
  const nextLine = !live.live && live.nextGame?.kickoff
    ? `next kickoff: ${formatKickoff(live.nextGame.kickoff)} · ${live.nextGame.away} at ${live.nextGame.home}`.toLowerCase()
    : null;
  const tabs = ALL_TABS.filter((t) => t.value !== 'hinges' || (isCurrent && !live.replay));
  const playoffStart = model?.meta.playoff?.weekStart ?? (model && model.meta.lastRegularWeek > 0 ? model.meta.lastRegularWeek + 1 : null);

  return (
    <div className="page page-fade gd">
      <PageHeader kicker={page.kicker} title={page.name} data={header} />

      <div className="gd-toolbar">
        {currentWeek >= 1 && (
          <WeekPicker weeks={weekList(currentWeek)} value={selected} currentWeek={currentWeek} playoffStart={playoffStart} onSelect={pickWeek} />
        )}
        <ReplayBar week={selected} />
      </div>
      {(nextLine || mode === 'off') && (
        <div className="gd-next-row">
          {nextLine && <p className="gd-next">{nextLine}</p>}
          {mode === 'off' && !live.replay && <FieldStrip className="gd-off-art" size={120} />}
        </div>
      )}

      {shown && !focus ? (
        <p className="note" role="status">no matchups this week. a bye or an open week has nothing to score.</p>
      ) : !shown || !focus ? (
        <>
          <p className="note" role="status">
            {live.error ? `could not load the scores. ${live.error}` : !fromLive && wk.error ? `could not load week ${selected}. ${wk.error}` : `loading week ${selected}’s matchups…`}
          </p>
          {(live.loading || wk.loading) && <PageSkeleton cards={2} />}
        </>
      ) : (
        <GamesContext.Provider value={games}>
          <MainEvent
            key={`${selected}-${focus.id}`}
            m={focus} ctx={shown.ctx} frames={shown.frames} projected={projected} assumed={shown.view.assumed} status={statusFor()}
            onBackToMine={!focusIsMine && shown.view.mine ? () => setParam('m', null) : undefined}
          />
          <section className="gd-league" aria-label="around the league">
            <PageTabs tabs={tabs} label="league view" defaultTab="around">
              {(tab) => (
                <>
                  {tab === 'around' && (
                    <div className="gd-panel">
                      <div className="title-row">
                        <h2>{review ? `week ${selected} in review` : FEATURE.aroundLeague}</h2>
                        <InfoTip label={FEATURE.aroundLeague}>
                          <p>every other matchup, with each team’s two best starters, the score, the win chance and who is left. when a starter is live you see who is on the field and what his game looks like. upset alert: a team that had under a 35% chance before kickoff and is ahead now. nail-biter: the closest matchup (within 12 points) with players still to play. blowout: the biggest margin, from 35 points. tap a card to make it the main event.</p>
                          <p>the storylines are plain rules over this week’s numbers: the highest score, the closest finish, the biggest swing in win chance, the top player, a loss the bench would have won, the most points left on the bench, and who moves in the standings.</p>
                        </InfoTip>
                      </div>
                      <Storylines stories={stories} onOpen={(id) => { setParam('m', String(id)); window.scrollTo?.({ top: 0 }); }} />
                      {model && (review || moves.some((x) => x.delta !== 0 || x.line !== null)) && (
                        <StandingsMoves moves={moves} playoffTeams={model.meta.playoffTeams} past={over} week={selected} />
                      )}
                      <div className="gd-sort">
                        <span className="gd-h3">sort</span>
                        <Segmented label="sort matchups" value={sort} onChange={setSort} options={SORTS} />
                      </div>
                      <AroundLeague
                        matchups={shown.view.matchups} focusId={focus.id} projected={projected} sort={sort}
                        onOpen={(id) => { setParam('m', String(id)); window.scrollTo?.({ top: 0 }); }}
                      />
                    </div>
                  )}
                  {/* your matchup in depth: the current week reads the model, the what-if and the live feed itself; any other week reads the matchup on screen */}
                  {tab === 'h2h' && (
                    <div className="gd-panel">
                      {isCurrent && !live.replay ? <HeadToHead /> : shown.view.mine ? <HeadToHeadFor m={shown.view.mine} /> : <p className="note">you have no matchup this week.</p>}
                    </div>
                  )}
                  {tab === 'hinges' && <div className="gd-panel"><Hinges /></div>}
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
                        <InfoTip label={FEATURE.driveChart}>
                          <p>each update compared with the one before: every starter whose points changed. kept in memory for this visit only, so it starts empty when you open the page.</p>
                          <p>on the field, each play is a football, oldest at the left end zone and newest at the right, with an arrow pushing into the latest. bigger means more points. green is your team, warm red your opponent, small and pale the rest of the league; a hollow ball is a correction that took points away. the thin line is the running margin: above midfield you are ahead. tap a play to read it.</p>
                        </InfoTip>
                      </div>
                      <DriveTab view={shown.view} ctx={shown.ctx} frames={shown.frames} changes={shown.changes} focus={focus} feed={fromLive} />
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
        </GamesContext.Provider>
      )}
      <Attribution sources={['sleeper']} />
    </div>
  );
}
