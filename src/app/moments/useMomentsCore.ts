/* Assembles the moments engine's context from the app's own hooks, and runs the engine on a slow clock. Two layers:
   `useBasics` + `useMomentsCore` (cheap: league, clock, model, live games, the draft pick feed) serve the live activity and the page banners;
   `useFullExtras` adds the heavier pieces (hot takes, rankings for the tier to study, the draft grade, dynasty movers) for the huddle. */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { LeagueBundle, NflState, Phase, SleeperDraft, SleeperLeague } from '../../data';
import { bestAvailable, isDynasty, myNeeds, picksUntilMyTurn, slotOfUser } from '../../engine';
import { draftGradeFromPicks, hero, momentModel, moments, ongoing, oddsAtStartOf, waiverInfo } from '../../engine/moments';
import type { DraftCtx, DraftLiveInfo, MomentCtx, MomentModel, MomentTake, OffseasonCtx } from '../../engine/moments';
import { WAIVER_TZ } from '../../engine/moments';
import { LOSERS_COPY } from '../names';
import { draftModeOf, myRosterOf, planOrder, teamDirectory, teamLabel } from '../../pages/draft/model';
import { liveSource } from '../../pages/draft/pickFeed';
import { usePickFeed } from '../../pages/draft/usePickFeed';
import { buildStandings } from '../../pages/standings';
import { useDraftInputs, useRankings } from '../draftInputs';
import { useData } from '../dataContext';
import { useActive, useLeagueBundle, useNflState } from '../hooks';
import { useLiveMaybe } from '../live/liveContext';
import type { LiveValue } from '../live/liveContext';
import { useModel } from '../modelContext';
import { currentDraft, safeDetectPhase } from '../phase';
import { useFantasyCalc } from '../playersData';
import { loadPrefs, PREFS_EVENT } from '../prefs';
import { usePrepChecks } from '../prepChecks';
import { useComputed } from '../useComputed';
import { useTakes } from '../useTakes';
import { kickoffsOf, liveMatchOf, settingsOf } from './build';
import { applyNowParam, isNowOverridden } from './nowOverride';
import { NO_MOMENTS } from './momentsContext';
import type { MomentsValue } from './momentsContext';
import { useMomentClock } from './useMomentClock';
import { useOddsSnapshots } from './useOddsSnapshots';

export interface Basics {
  bundle: LeagueBundle | undefined;
  league: SleeperLeague | null;
  nfl: NflState | undefined;
  /** the phase in force (a preview can force one) */
  phase: Phase | null;
  forced: Phase | null;
  draft: SleeperDraft | null;
  userId: string | null;
  now: number;
  previewing: boolean;
  live: LiveValue | null;
}

export interface Extras {
  tierPos: string | null;
  grade: DraftCtx['grade'];
  takes: MomentTake[];
  offseason: OffseasonCtx | null;
}

function usePrefsLosers() {
  const [mode, setMode] = useState(() => loadPrefs().losers);
  useEffect(() => {
    const on = () => setMode(loadPrefs().losers);
    window.addEventListener(PREFS_EVENT, on);
    return () => window.removeEventListener(PREFS_EVENT, on);
  }, []);
  return mode;
}

export function useBasics(forced: Phase | null = null): Basics {
  const bundle = useLeagueBundle().data;
  const nfl = useNflState().data;
  const { data: active } = useActive();
  const live = useLiveMaybe();
  const loc = useLocation();
  // a `?now=` typed in the app (the hash route's query) takes effect at once
  useEffect(() => { applyNowParam(new URLSearchParams(loc.search).get('now')); }, [loc.search]);
  const now = useMomentClock();
  const league = bundle?.league ?? null;
  const draft = bundle && league ? currentDraft(league, bundle.drafts) : null;
  const detected = useMemo(() => (bundle && nfl ? safeDetectPhase(nfl, bundle.league, draft) : null), [bundle, nfl, draft]);
  return { bundle, league, nfl, phase: forced ?? detected, forced, draft, userId: active?.account.userId ?? null, now, previewing: isNowOverridden(), live };
}

const waivers = new WeakMap<object, MomentModel['waiver']>();
const models = new WeakMap<object, { key: string; value: MomentModel | null }>();

/** The heavier extras. Hooks here run for the huddle only. */
export function useFullExtras(b: Basics, week: number | null): Extras {
  const { league, bundle, nfl, phase, draft, userId } = b;
  const gradeNeeded = !!draft && draft.status === 'complete' && phase === 'in_season' && week !== null && week <= 3;
  const preDraft = phase === 'pre_draft';
  const inputs = useDraftInputs(league, { draftId: draft?.draft_id ?? null, enabled: !!league && (preDraft || gradeNeeded) });
  const rankings = useRankings(league, inputs.data);
  const tierPos = preDraft ? rankings?.rows[0]?.pos.toLowerCase() ?? null : null;
  const grade = useMemo<DraftCtx['grade']>(() => {
    if (!gradeNeeded || !rankings || !inputs.data || !bundle || !league) return null;
    try {
      const order = planOrder(league, draft, bundle.tradedPicks, draftModeOf(league, draft)).order;
      const rid = myRosterOf(bundle, draft, userId, order);
      return rid === null ? null : draftGradeFromPicks(rankings, inputs.data.picks, rid);
    } catch { return null; }
  }, [gradeNeeded, rankings, inputs.data, bundle, league, draft, userId]);

  const takes = useTakes().takes;
  const myTakes = useMemo<MomentTake[]>(() => takes.filter((t) => t.relevance === 'mine').slice(0, 1).map((t) => ({ id: t.id, pid: t.pid, headline: t.headline, statLine: t.statLine })), [takes]);

  const offseason = phase === 'offseason';
  const dynasty = !!league && isDynasty(league);
  const fc = useFantasyCalc(offseason && dynasty ? league : null);
  const season = nfl?.league_season ?? nfl?.season ?? league?.season ?? '';
  const rookieInputs = useDraftInputs(league, { mode: 'rookie', draftId: null, season, enabled: offseason && !!league });
  const rookieRankings = useRankings(league, rookieInputs.data, 'rookie');
  const off = useMemo<OffseasonCtx | null>(() => {
    if (!offseason || !bundle) return null;
    const mine = new Set<string>();
    for (const r of bundle.rosters) if (!!userId && (r.owner_id === userId || !!r.co_owners?.includes(userId))) for (const id of r.players ?? []) mine.add(id);
    const movers = fc?.ok ? Object.values(fc.byId).filter((e) => e.position !== 'PICK' && mine.has(e.sleeperId) && !!e.trend30Day).map((e) => ({ name: e.name, delta: e.trend30Day ?? 0 })) : [];
    const rookies = rookieRankings ? rookieRankings.rows.filter((r) => r.pos !== 'K' && r.pos !== 'DEF').slice(0, 3).map((r) => ({ name: r.name, pos: r.pos })) : [];
    return movers.length || rookies.length ? { movers, rookies } : null;
  }, [offseason, bundle, userId, fc, rookieRankings]);
  return { tierPos, grade, takes: myTakes, offseason: off };
}

/** Everything the context needs that is not extra, then the engine run. `extras` null leaves the heavier moments out. */
export function useMomentsCore(b: Basics, extras: Extras | null): MomentsValue {
  const { sleeper } = useData();
  const { engine, model: rawModel } = useModel();
  const { bundle, league, nfl, phase, forced, draft, userId, now, previewing, live } = b;
  const losersMode = usePrefsLosers();

  /* games and my live matchup */
  const kickoffs = useMemo(() => {
    const snap = live && !live.replay ? live.snapshot : null;
    return snap && snap.gamesKnown && snap.week === live!.currentWeek ? kickoffsOf(snap.games, now, previewing) : [];
  }, [live, now, previewing]);
  const nextGames = useMemo(() => {
    const g = live && !live.replay ? live.nextGame : null;
    const here = new Set(live?.snapshot?.games.map((x) => x.id) ?? []);
    return g && !here.has(g.id) ? kickoffsOf([g], now, previewing) : [];
  }, [live, now, previewing]);
  const weekOver = kickoffs.length > 0 && kickoffs.every((g) => g.state === 'final');
  // under a preview clock the feed describes today: a live score only fits a moment when games are on (or the slate is half over)
  const gamesOn = kickoffs.some((g) => g.state === 'live') || (kickoffs.some((g) => g.state === 'final') && kickoffs.some((g) => g.state === 'pre'));
  const liveMatch = useMemo(
    () => (live && !live.replay && (!previewing || gamesOn) ? liveMatchOf(live.view?.mine ?? null, live.view?.week) : null),
    [live, previewing, gamesOn],
  );

  /* the model: the lineup and the race are quick; the waiver board is the slow part and is only worked out the day it matters */
  const faab = league?.settings.waiver_type === 2;
  const needWaiver = !!engine && phase !== 'offseason' && phase !== 'pre_draft' && phase !== 'drafting';
  const board = useComputed(() => {
    if (!engine || !needWaiver) return null;
    if (!waivers.has(engine)) waivers.set(engine, waiverInfo(engine, faab));
    return waivers.get(engine) ?? null;
  }, [engine, needWaiver, faab]);
  const losers = useMemo(() => {
    if (losersMode === 'match') return null;
    const c = LOSERS_COPY[losersMode];
    return { name: c.name, champ: c.champ, which: losersMode === 'toilet' ? ('flush' as const) : ('consolation' as const) };
  }, [losersMode]);
  const model = useMemo<MomentModel | null>(() => {
    if (!engine || !rawModel) return null;
    const key = `${weekOver}|${board.value?.top?.pid ?? (board.value ? 'none' : 'wait')}|${losersMode}|${rawModel.oddsPending}`;
    const hit = models.get(engine);
    if (hit && hit.key === key) return hit.value;
    let value: MomentModel | null = null;
    try { value = momentModel(engine, { weekOver, waiver: board.value ?? undefined, losers }); } catch { value = null; }
    models.set(engine, { key, value });
    return value;
  }, [engine, rawModel, weekOver, board.value, losers, losersMode]);
  const snaps = useOddsSnapshots(league?.league_id ?? null, model?.week ?? null, model?.playoffPct ?? null, !previewing && !!model);

  /* the draft: pick feed while it is on */
  const plan = useMemo(() => {
    if (!league || !bundle || !draft) return null;
    try { return planOrder(league, draft, bundle.tradedPicks, draftModeOf(league, draft)); } catch { return null; }
  }, [league, bundle, draft]);
  const source = useMemo(
    () => (phase === 'drafting' && sleeper && draft && plan ? liveSource(sleeper, draft.draft_id, plan.order.length) : null),
    [phase, sleeper, draft, plan],
  );
  const feed = usePickFeed({ source, intervalMs: 8000 });
  const prep = usePrepChecks(league?.league_id ?? '');

  /* the draft room's live snapshot, flattened for the live activity: the inputs come through the resource store (the room reads the same key), the picks from the feed above */
  const draftingNow = phase === 'drafting' && !!draft && !!plan;
  const draftInputs = useDraftInputs(league, { draftId: draft?.draft_id ?? null, enabled: !!league && draftingNow });
  const draftRankings = useRankings(league, draftInputs.data);
  const draftLive = useMemo<DraftLiveInfo | null>(() => {
    if (!draftingNow || !draftRankings || !plan || !bundle || !draft) return null;
    try {
      const rid = myRosterOf(bundle, draft, userId, plan.order);
      if (rid === null) return null;
      const picks = feed.state.picks;
      const turn = picksUntilMyTurn(plan.order, picks, rid);
      const dir = teamDirectory(bundle, userId);
      const lastPick = picks.reduce<(typeof picks)[number] | null>((m, p) => (!m || p.pick_no > m.pick_no ? p : m), null);
      const who = lastPick ? draftRankings.byPid[lastPick.player_id] : undefined;
      const byRid = lastPick ? lastPick.roster_id || (plan.order.find((o) => o.pickNo === lastPick.pick_no)?.rosterId ?? 0) : 0;
      return {
        picksUntil: turn.picksBetween, nextPick: turn.nextPickNo,
        best: bestAvailable(draftRankings, picks, { limit: 3 }).map((r) => ({ pid: r.pid, name: r.name, pos: r.pos, team: r.team, tier: r.tier, vor: r.vor })),
        needs: myNeeds(draftRankings, picks, rid).openSlots.map((x) => x.replace(/_/g, ' ').toLowerCase()),
        last: lastPick ? { pickNo: lastPick.pick_no, name: who?.name ?? `player ${lastPick.player_id}`, pos: who?.pos ?? '', by: teamLabel(dir, byRid) } : null,
      };
    } catch { return null; }
  }, [draftingNow, draftRankings, plan, bundle, draft, userId, feed.state.picks]);

  const ctx = useMemo<MomentCtx | null>(() => {
    if (!league || !bundle) return null;
    let draftCtx: DraftCtx | null = null;
    if (draft) {
      const status = forced === 'pre_draft' ? 'pre_draft' : forced === 'drafting' ? 'drafting' : (feed.state.status ?? draft.status);
      let picksUntilMine: number | null = null;
      if (plan && phase === 'drafting' && feed.state.polls > 0) {
        const rid = myRosterOf(bundle, draft, userId, plan.order);
        picksUntilMine = rid === null ? null : picksUntilMyTurn(plan.order, feed.state.picks, rid).picksBetween;
      }
      draftCtx = {
        status, startTime: draft.start_time, mySlot: userId ? slotOfUser(draft, userId) : null, teams: draft.settings.teams ?? league.total_rosters,
        picksUntilMine, tierPos: extras?.tierPos ?? null, grade: extras?.grade ?? null,
      };
    }
    const last = model?.lastResult ?? null;
    const before = last ? oddsAtStartOf(snaps, last.week) : null;
    let lastSeason: MomentCtx['lastSeason'] = null;
    if (phase === 'offseason') {
      const rows = buildStandings(bundle, userId);
      const mine = rows.find((r) => r.isMine);
      if (mine && mine.wins + mine.losses + mine.ties > 0) lastSeason = { teamName: mine.teamName, w: mine.wins, l: mine.losses, t: mine.ties, rank: mine.rank, teams: rows.length };
    }
    return {
      now: new Date(now), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || WAIVER_TZ, phase,
      nflState: nfl ? { week: nfl.week, season: nfl.season, season_type: nfl.season_type } : null,
      settings: settingsOf(league), schedule: { games: kickoffs, nextGames }, draft: draftCtx, model, takes: extras?.takes ?? [],
      live: liveMatch, offseason: extras?.offseason ?? null,
      previous: last && before !== null ? { week: last.week, playoffPct: before } : null,
      prep: phase === 'pre_draft' ? { mock: prep.done.has('mock'), tiers: prep.done.has('tiers'), queue: prep.done.has('queue') } : null,
      lastSeason,
    };
  }, [league, bundle, draft, forced, feed.state, plan, phase, userId, extras, model, snaps, now, nfl, kickoffs, nextGames, liveMatch, prep.done]);

  return useMemo<MomentsValue>(() => {
    if (!ctx) return { ...NO_MOMENTS, now, previewing };
    const list = moments(ctx);
    return { ctx, moments: list, ongoing: ongoing(list, now), hero: hero(ctx), now, previewing, draftLive };
  }, [ctx, now, previewing, draftLive]);
}
