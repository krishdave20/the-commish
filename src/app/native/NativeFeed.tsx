import { useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { buildActivities } from '../../engine/moments';
import type { RawChange } from '../../engine/live';
import { leagueScoring, leagueTypeLabel, statusLabel } from '../league';
import { useAccountStore, useAccounts, useActive, useApi, useLeagueBundle, useLeagueBundles } from '../hooks';
import { LiveProvider } from '../live/LiveProvider';
import { useLiveMaybe } from '../live/liveContext';
import { useModel, useScenario } from '../modelContext';
import { MomentsProvider } from '../moments/MomentsProvider';
import { useMoments } from '../moments/momentsContext';
import { AlertsRunner } from '../pwa/AlertsRunner';
import { linkedAccount, lookupSleeper } from '../sleeperLookup';
import { nativeActivity } from './activityPayload';
import { isNativeApp, postNative } from './bridge';
import { SNAPSHOT_VERSION, lineup, planItems, recordText, scoreboard, standings } from './snapshot';
import type { NativeSnapshot } from './snapshot';

/* The iPhone app's engine. The app keeps one hidden web view on `#/native-feed`: the same providers as the site (data, model, what-if, live
   poller, moments) with no UI, and this component turns their state into a `NativeSnapshot` for the native screens. Nothing is computed twice:
   the numbers are the web app's own. The app calls `window.commishFeed` (WKWebView.callAsyncJavaScript) for check in, the league picker,
   refresh and sign out; account changes land in the shared localStorage, so the site's pages see them too. */

const NONE: readonly RawChange[] = [];

export interface FeedApi {
  lookup(username: string): Promise<
    | { found: false }
    | { found: true; userId: string; username: string; displayName: string; avatar: string | null; leagues: Array<{ id: string; name: string; season: string; detail: string; picked: boolean }> }
  >;
  link(username: string, leagueIds: string[]): Promise<boolean>;
  setLeague(leagueId: string): void;
  signOut(): void;
  refresh(): Promise<void>;
}

declare global { interface Window { commishFeed?: FeedApi } }

function post(s: NativeSnapshot, last: { current: string }) {
  const json = JSON.stringify(s);
  if (json === last.current) return;
  last.current = json;
  postNative({ type: 'snapshot', snapshot: s });
}

const EMPTY: Omit<NativeSnapshot, 'status' | 'message' | 'account' | 'leagues'> = {
  v: SNAPSHOT_VERSION, team: null, hero: null, plan: [], activity: null, matchup: null, scoreboard: [], standings: [], lineup: null, live: false, asOf: null, previewing: false,
};

type Refresh = MutableRefObject<() => Promise<void>>;

/** The calls the app makes. Lives above the active-account check, so check in works while signed out; the signed-in feed puts its fuller
    refresh (model, league and a live poll) in `refreshRef`. */
function useFeedApi(refreshRef: Refresh) {
  const api = useApi();
  const store = useAccountStore();
  const { data: linked = [] } = useAccounts();
  const lookups = useRef(new Map<string, Awaited<ReturnType<typeof lookupSleeper>>>());
  useEffect(() => {
    const feed: FeedApi = {
      async lookup(username) {
        const found = await lookupSleeper(api, username.trim(), store.list());
        lookups.current.set(username.trim().toLowerCase(), found);
        if (!found) return { found: false };
        const picked = new Set(found.defaults);
        return {
          found: true, userId: found.user.user_id, username: found.user.username ?? username.trim(), displayName: found.user.display_name, avatar: found.user.avatar,
          leagues: found.leagues.map((l) => ({
            id: l.league_id, name: l.name, season: l.season, picked: picked.has(l.league_id),
            detail: [`${l.total_rosters} teams`, leagueTypeLabel(l.settings?.type).toLowerCase(), leagueScoring(l).toLowerCase(), statusLabel(l.status).toLowerCase()].join(' · '),
          })),
        };
      },
      async link(username, leagueIds) {
        const found = lookups.current.get(username.trim().toLowerCase()) ?? await lookupSleeper(api, username.trim(), store.list());
        if (!found) return false;
        store.upsert(linkedAccount(found.user, username, leagueIds, store.list().find((a) => a.userId === found.user.user_id)));
        store.setActive(found.user.user_id);
        return true;
      },
      setLeague(leagueId) {
        const a = store.active();
        if (a && a.leagueIds.includes(leagueId)) store.setActiveLeague(a.userId, leagueId);
      },
      signOut() {
        const a = store.active();
        if (a) store.remove(a.userId);
      },
      refresh: () => refreshRef.current(),
    };
    window.commishFeed = feed;
    return () => { if (window.commishFeed === feed) delete window.commishFeed; };
  }, [api, store, linked, refreshRef]);
}

/** The route element: signed out, it says so (and check in still works); signed in, it mounts the live and moments providers the shell has. */
export default function NativeFeed() {
  const { data: active } = useActive();
  const { refresh } = useModel();
  const refreshRef = useRef(refresh);
  useFeedApi(refreshRef);
  const last = useRef('');
  const signedOut = !active;
  useEffect(() => {
    if (signedOut) post({ ...EMPTY, status: 'signed-out', message: null, account: null, leagues: [] }, last);
  }, [signedOut]);
  if (!isNativeApp() && !import.meta.env.DEV) return null;
  if (signedOut) return <FeedNote text="signed out" />;
  return <LiveProvider><MomentsProvider><Feed last={last} refreshRef={refreshRef} /></MomentsProvider></LiveProvider>;
}

/** A line of text for a person who opens the route in a browser by hand (dev): the feed has no UI of its own. */
function FeedNote({ text, children }: { text: string; children?: ReactNode }) {
  return <p className="note" style={{ padding: 16 }}>native feed · {text}{children}</p>;
}

function Feed({ last, refreshRef }: { last: { current: string }; refreshRef: Refresh }) {
  const { data: active } = useActive();
  const account = active?.account ?? null;
  const bundle = useLeagueBundle();
  const bundles = useLeagueBundles(account?.leagueIds ?? []);
  const { model, engine, loading, progress, error, refresh: refreshModel, asOf } = useModel();
  const { scenario, live: sim } = useScenario();
  const live = useLiveMaybe();
  const mv = useMoments();

  const view = live && !live.replay ? live.view : null;
  const changes = live && !live.replay ? live.state.changes : NONE;
  const activities = useMemo(
    () => buildActivities(mv.ongoing, { ctx: mv.ctx, view, changes, draft: mv.draftLive ?? null }),
    [mv.ongoing, mv.ctx, view, changes, mv.draftLive],
  );
  const table = useMemo(() => (engine && model ? standings(engine, model, sim) : []), [engine, model, sim]);
  const roster = useMemo(() => (engine ? lineup(engine, scenario) : null), [engine, scenario]);
  const board = useMemo(() => scoreboard(view), [view]);

  // the app's pull to refresh also polls the live layer at once
  useEffect(() => {
    refreshRef.current = async () => { await Promise.all([refreshModel(), bundle.refresh(), live?.refresh() ?? Promise.resolve()]); };
  });

  const snap = useMemo((): NativeSnapshot => {
    const leagues = (account?.leagueIds ?? []).map((id) => ({ id, name: bundles[id]?.league.name ?? 'league', active: id === active?.leagueId }));
    const acc = account ? { userId: account.userId, username: account.username, displayName: account.displayName, avatar: account.avatar } : null;
    const base = { ...EMPTY, account: acc, leagues, previewing: mv.previewing };
    if (!active?.leagueId) return { ...base, status: 'error', message: 'no league is followed yet. pick one in settings.' };
    if (!model || !engine) {
      if (error && !loading) return { ...base, status: 'error', message: `could not build the model. ${error}` };
      return { ...base, status: 'loading', message: progress?.label ?? (bundle.data ? 'building the model…' : 'loading your league…') };
    }
    const me = model.teams.find((t) => t.rid === model.meRid) ?? null;
    const top = mv.previewing ? null : activities[0] ?? null;
    const now = mv.now;
    return {
      ...base,
      status: 'ready',
      message: null,
      team: me ? {
        rid: me.rid, name: me.team, league: model.meta.leagueName, season: model.meta.season, week: model.meta.currentWeek,
        record: recordText(me.wins, me.losses, me.ties), place: table.find((r) => r.isMe)?.place ?? null, teams: model.teams.length,
      } : null,
      hero: mv.hero,
      plan: planItems(mv.moments),
      activity: top ? nativeActivity(top, now, { view, leagueId: model.meta.leagueId, sd: model.meta.teamWeeklySd }) : null,
      matchup: board.mine,
      scoreboard: board.rest,
      standings: table,
      lineup: roster,
      live: !!live?.live && !live.replay,
      asOf: live?.asOf ?? asOf,
    };
  }, [account, bundles, active, model, engine, error, loading, progress, bundle.data, mv, activities, view, board, table, roster, live, asOf]);

  useEffect(() => { post(snap, last); }, [snap, last]);
  // the local alerts run here, once for the whole app (pushed pages run none), and reach the app's notification centre (pwa/notify.ts)
  return <><AlertsRunner /><FeedNote text={snap.status}>{snap.message ? ` · ${snap.message}` : ''}</FeedNote></>;
}
