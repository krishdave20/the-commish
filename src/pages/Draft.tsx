import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../app/dataContext';
import { useActive, useLeagueBundle } from '../app/hooks';
import type { Freshness } from '../app/hooks';
import { FEATURE, PAGES } from '../app/names';
import { currentDraft } from '../app/phase';
import { useDraftRoomInputs, useRoomRankings } from '../app/useDraftRoom';
import { usePageTitle } from '../app/usePageTitle';
import { PageHeader } from '../components/PageHeader';
import { Segmented } from '../components/Segmented';
import { inferDraftMode, liveSnapshot } from '../engine';
import type { DraftMode } from '../engine';
import { ClockBanner } from './draft/ClockBanner';
import { ClockTab } from './draft/ClockTab';
import type { ReplayControls } from './draft/ClockTab';
import { MockTab } from './draft/MockTab';
import { ModeBar } from './draft/ModeBar';
import { RankingsTab } from './draft/RankingsTab';
import { DRAFT_TEXT, draftModeOf, myRosterOf, planOrder, teamDirectory } from './draft/model';
import type { DraftRoom, TabKey } from './draft/model';
import { LIVE_INTERVAL_MS, REPLAY_SPEEDS, liveSource, replaySource } from './draft/pickFeed';
import type { PickSource, ReplaySource } from './draft/pickFeed';
import { usePickFeed } from './draft/usePickFeed';
import './draft/draft.css';

const TABS: Array<{ value: TabKey; label: string }> = [
  { value: 'rankings', label: DRAFT_TEXT.rankings },
  { value: 'mock', label: FEATURE.mock },
  { value: 'clock', label: FEATURE.onTheClock },
];
const WATCH_MS = 30_000;

const isTab = (v: string | null): v is TabKey => v === 'rankings' || v === 'mock' || v === 'clock';

/** Draft room: rankings, a mock draft and the live assistant (with a replay of a finished draft). One league at a time:
    switching leagues starts the page over (mode, replay and feed state belong to a league). */
export default function Draft() {
  const { data: active } = useActive();
  return <DraftPage key={active?.leagueId ?? 'none'} />;
}

function DraftPage() {
  usePageTitle(PAGES.draft.path);
  const { sleeper } = useData();
  const bundle = useLeagueBundle();
  const { data: active } = useActive();
  const [params, setParams] = useSearchParams();
  const userId = active?.account.userId ?? null;
  const data = bundle.data;
  const league = data?.league ?? null;
  const listed = data && league ? currentDraft(league, data.drafts) : null;
  const draftId = listed?.draft_id ?? league?.draft_id ?? null;

  const [picked, setPicked] = useState<{ leagueId: string; mode: DraftMode } | null>(null);
  const wanted: DraftMode = league ? (picked?.leagueId === league.league_id ? picked.mode : inferDraftMode(league, listed)) : 'redraft';
  const inputs = useDraftRoomInputs(league, { mode: wanted, draftId, enabled: !!league });
  const rankings = useRoomRankings(league, inputs.data);
  const draft = inputs.data?.draft ?? listed;
  const draftMode = league ? draftModeOf(league, draft) : 'redraft';
  const live = draft?.status === 'drafting' || draft?.status === 'paused';

  /* ---------- the pick feed: live, or a replay of the finished draft ---------- */
  const [replaySrc, setReplaySrc] = useState<ReplaySource | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const savedPicks = inputs.data?.picks;
  const tradedPicks = inputs.data?.tradedPicks;

  const livePlan = useMemo(
    () => (league ? planOrder(league, draft, tradedPicks ?? [], draftMode) : null),
    [league, draft, tradedPicks, draftMode],
  );
  const source = useMemo<PickSource | null>(() => {
    if (replaySrc) return replaySrc;
    if (live && sleeper && draftId && livePlan) return liveSource(sleeper, draftId, livePlan.order.length);
    return null;
  }, [replaySrc, live, sleeper, draftId, livePlan]);
  const replaying = replaySrc !== null;
  const stepMs = REPLAY_SPEEDS.find((s) => s.value === speed)?.ms || 1000;
  const feed = usePickFeed({
    source,
    intervalMs: replaying ? stepMs : LIVE_INTERVAL_MS,
    auto: replaying ? speed !== 0 && !paused : true,
    immediate: !replaying,
  });

  /* a draft that has not started: look again every 30 s, and reload when it begins */
  const watchSource = useMemo<PickSource | null>(
    () => (sleeper && draftId && draft?.status === 'pre_draft'
      ? { kind: 'live', poll: async () => { const s = (await sleeper.draft(draftId, { force: true })).data.status; return { picks: [], status: s, complete: s !== 'pre_draft' }; } }
      : null),
    [sleeper, draftId, draft?.status],
  );
  const watch = usePickFeed({ source: watchSource, intervalMs: WATCH_MS, immediate: false });
  const { refresh: refreshInputs } = inputs;
  useEffect(() => { if (watch.state.status && watch.state.status !== 'pre_draft') void refreshInputs(); }, [watch.state.status, refreshInputs]);

  const replay: ReplayControls = {
    active: replaying, speed, paused, cursor: replaying ? feed.state.picks.length : 0, total: savedPicks?.length ?? 0, done: feed.state.complete,
    start: () => { if (savedPicks) { setReplaySrc(replaySource(savedPicks)); setPaused(false); } },
    exit: () => setReplaySrc(null),
    restart: () => { if (savedPicks) { setReplaySrc(replaySource(savedPicks)); setPaused(false); } },
    step: () => { void feed.pollNow(); },
    setSpeed: (s) => { setSpeed(s); setPaused(false); },
    setPaused,
  };

  /* ---------- tabs ---------- */
  // 'live' is accepted as an alias for the on-the-clock tab (older links and the huddle used it)
  const rawTab = params.get('tab');
  const tabParam = rawTab === 'live' ? 'clock' : rawTab;
  const tab: TabKey = isTab(tabParam) ? tabParam : live ? 'clock' : 'rankings';
  const setTab = useCallback((t: TabKey) => { setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true }); }, [setParams]);
  const leagueId = league?.league_id ?? null;
  const setMode = useCallback((m: DraftMode) => { if (leagueId) setPicked({ leagueId, mode: m }); }, [leagueId, setPicked]);

  /* ---------- what the tabs share ---------- */
  const room = useMemo<DraftRoom | null>(() => {
    if (!data || !league || !rankings || !inputs.data) return null;
    const teams = teamDirectory(data, userId);
    const order = (livePlan ?? planOrder(league, draft, [], draftMode)).order;
    return {
      bundle: data, league, draft, draftMode, inputs: inputs.data, rankings, mode: rankings.mode, teams, userId,
      myRosterId: myRosterOf(data, draft, userId, order), fcUsed: inputs.data.fantasyCalc.ok && rankings.mode !== 'redraft', setMode,
    };
  }, [data, league, rankings, inputs.data, userId, livePlan, draft, draftMode, setMode]);

  const mockPlan = useMemo(
    () => (room && league ? planOrder(league, draft, inputs.data?.tradedPicks ?? [], room.mode) : null),
    [room, league, draft, inputs.data?.tradedPicks],
  );
  const snapshot = useMemo(
    () => (room && source && livePlan && room.mode === room.draftMode
      ? liveSnapshot({ rankings: room.rankings, order: livePlan.order, picks: feed.state.picks, rosterId: room.myRosterId ?? -1 })
      : null),
    [room, source, livePlan, feed.state.picks],
  );
  const onClock = snapshot && snapshot.turn.picksBetween === 0 && snapshot.turn.currentPickNo !== null ? livePlan?.order.find((o) => o.pickNo === snapshot.turn.currentPickNo) : undefined;

  const header: Freshness = {
    asOf: inputs.asOf ?? bundle.asOf, fromCache: inputs.fromCache && bundle.fromCache, stale: inputs.stale || bundle.stale,
    error: inputs.error ?? bundle.error, loading: inputs.loading || bundle.loading,
    refresh: async () => { await Promise.all([bundle.refresh(), inputs.refresh()]); },
  };
  const hidePicks = feed.state.picks.length ? feed.state.picks : (savedPicks ?? []);

  return (
    <div className="page page-fade">
      <PageHeader kicker={league ? `${PAGES.draft.kicker} · ${league.season} season` : PAGES.draft.kicker} title={PAGES.draft.name} data={header} />

      {!active?.leagueId && <p className="note">no league is selected yet. use “add an account” in the sidebar to follow one.</p>}
      {active?.leagueId && !data && !bundle.loading && <p className="note neg-c" role="status">league data is not available yet. try refresh.</p>}
      {league && !room && (
        <p className={`note${inputs.error && !inputs.loading ? ' neg-c' : ''}`} role="status">
          {inputs.error && !inputs.loading ? `could not load the draft room. ${inputs.error}` : 'scoring season projections with your league’s settings…'}
        </p>
      )}

      {room && mockPlan && (
        <>
          {onClock && source && <ClockBanner pickNo={onClock.pickNo} round={onClock.round} slot={onClock.slot} replay={source.kind === 'replay'} />}
          <ModeBar league={room.league} draftMode={draftMode} shown={room.mode} wanted={wanted} rankings={room.rankings} inputs={room.inputs} onChange={setMode} />
          <Segmented label="Draft room section" value={tab} onChange={setTab} options={TABS} />

          {tab === 'rankings' && <RankingsTab room={room} picks={hidePicks} />}
          {tab === 'mock' && <MockTab key={`${room.mode}:${inputs.asOf}`} room={room} plan={mockPlan} />}
          {tab === 'clock' && livePlan && (
            <ClockTab
              room={room} plan={livePlan} feed={feed.state} source={source?.kind ?? null} snapshot={snapshot} replay={replay}
              canReplay={draft?.status === 'complete' && (savedPicks?.length ?? 0) > 0} draftPicks={savedPicks?.length ?? 0}
            />
          )}
        </>
      )}
    </div>
  );
}
