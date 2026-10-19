import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNflState } from '../app/hooks';
import { useLive } from '../app/live/liveContext';
import { useModel } from '../app/modelContext';
import { NFL_COPY, PAGES } from '../app/names';
import { useNow } from '../app/useNow';
import { usePageTitle } from '../app/usePageTitle';
import { PageHeader } from '../components/PageHeader';
import { PageTabs } from '../components/PageTabs';
import { useReducedMotion } from '../components/motion';
import { Segmented } from '../components/Segmented';
import { usePlayersFile } from '../app/playersData';
import { buildStandings, CONFERENCES, playerInfo } from '../engine/nfl';
import type { Conference, WeekOfStats } from '../engine/nfl';
import { GameDrawer } from './nfl/GameDrawer';
import { LiveStrip } from './nfl/LiveStrip';
import { LiveTab } from './nfl/LiveTab';
import { PictureView } from './nfl/Picture';
import { Scoreboard } from './nfl/Scoreboard';
import { StandingsView } from './nfl/Standings';
import { StatsView } from './nfl/StatsView';
import { LAST_WEEK } from './nfl/data';
import { useLiveChanges } from './nfl/useLiveChanges';
import { useNflOnly } from './nfl/useNflOnly';
import { useSeasonResults, useSeasonStats, useWeekGames } from './nfl/useNflWeek';
import '@fontsource/barlow-condensed/600-italic.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '../styles/nfl.css';
import '../styles/whiparound.css';

type Tab = 'live' | 'scoreboard' | 'stats' | 'standings' | 'picture';
/** The tabs; the live one comes first and carries the count of games in progress ("live · 3"). */
const tabsFor = (liveCount: number): Array<{ value: Tab; label: string }> => [
  { value: 'live', label: liveCount > 0 ? `live · ${liveCount}` : 'live' },
  { value: 'scoreboard', label: NFL_COPY.tabs.scoreboard },
  { value: 'stats', label: NFL_COPY.tabs.stats },
  { value: 'standings', label: NFL_COPY.tabs.standings },
  { value: 'picture', label: NFL_COPY.tabs.picture },
];

function WeekPicker({ week, currentWeek, onPick }: { week: number; currentWeek: number; onPick: (w: number) => void }) {
  const weeks = Array.from({ length: LAST_WEEK }, (_, i) => i + 1);
  return (
    <div className="nf-weeks" role="group" aria-label="week">
      <button type="button" className="btn quiet" onClick={() => onPick(week - 1)} disabled={week <= 1} aria-label="previous week">‹</button>
      <label className="ctl">
        week
        <select value={week} onChange={(e) => onPick(Number(e.target.value))}>
          <option value={currentWeek}>week {currentWeek} (this week)</option>
          {weeks.filter((w) => w !== currentWeek).map((w) => <option key={w} value={w}>week {w}</option>)}
        </select>
      </label>
      <button type="button" className="btn quiet" onClick={() => onPick(week + 1)} disabled={week >= LAST_WEEK} aria-label="next week">›</button>
      {week !== currentWeek && <button type="button" className="btn quiet" onClick={() => onPick(currentWeek)}>this week</button>}
    </div>
  );
}

/** The stats tab. The players file (about 12,000 entries, cached for a day) is only read here, so the other tabs never wait for it. */
function StatsPane({ weeks, records, currentWeek, loading, ready }: {
  ready: boolean;
  weeks: WeekOfStats[]; records: ReturnType<typeof buildStandings>['records']; currentWeek: number; loading: boolean;
}) {
  const file = usePlayersFile();
  const info = useMemo(() => playerInfo(file.data), [file.data]);
  return <StatsView weeks={weeks} info={info} records={records} currentWeek={currentWeek} loading={loading || file.loading || !ready} />;
}

export default function Nfl() {
  const page = PAGES.nfl;
  usePageTitle(page.path);
  const live = useLive();
  const { model } = useModel();
  const state = useNflState();
  const [params, setParams] = useSearchParams();
  const wall = useNow(30_000);
  const [nflOnly, setNflOnly] = useNflOnly();

  const season = model?.meta.season ?? state.data?.season ?? '';
  const stateWeek = state.data?.week && state.data.week > 0 ? Math.min(state.data.week, LAST_WEEK) : 0;
  const currentWeek = live.available ? Math.min(live.currentWeek, LAST_WEEK) : stateWeek;
  const asked = Number(params.get('week'));
  const week = Number.isInteger(asked) && asked >= 1 && asked <= LAST_WEEK ? asked : currentWeek;
  const conf: Conference = params.get('conf') === 'NFC' ? 'NFC' : 'AFC';
  const tab = (['live', 'stats', 'standings', 'picture'] as string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'scoreboard';

  const setParam = (k: string, v: string | null, replace = true) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    if (v === null) out.delete(k); else out.set(k, v);
    return out;
  }, { replace });

  // this week always (the standings need it); the chosen week too when it is another one
  const cur = useWeekGames(season, currentWeek, currentWeek);
  const other = useWeekGames(season, week === currentWeek ? 0 : week, currentWeek);
  const viewed = week === currentWeek ? cur : other;
  const needsResults = tab === 'stats' || tab === 'standings' || tab === 'picture';
  const results = useSeasonResults(season, currentWeek, cur.games, needsResults);
  const seasonStats = useSeasonStats(season, currentWeek, tab === 'stats');
  const standings = useMemo(() => buildStandings(results.games), [results.games]);

  // games in progress this week (halftime included): the live tab, its count, and the default tab while any is on
  const liveGames = useMemo(() => (cur.games ?? []).filter((g) => g.state === 'live'), [cur.games]);
  const liveCount = liveGames.length;
  const defaultTab: Tab = liveCount > 0 && week === currentWeek && !live.replay ? 'live' : 'scoreboard';
  const tabs = useMemo(() => tabsFor(liveCount), [liveCount]);
  const changes = useLiveChanges(live.replay ? null : cur.games);
  const motion = !useReducedMotion();

  // my rostered players by NFL team (standings) and my starters by team (this week's cards)
  const mineRostered = useMemo(() => {
    const m = new Map<string, number>();
    if (nflOnly) return m;
    for (const p of model?.players ?? []) if (p.ownerRid === model?.meRid && p.nfl) m.set(p.nfl, (m.get(p.nfl) ?? 0) + 1);
    return m;
  }, [model, nflOnly]);
  const mineStarters = useMemo(() => {
    const m = new Map<string, number>();
    if (nflOnly || week !== currentWeek || live.replay) return m;
    const mine = live.view?.mine;
    const me = mine ? (mine.a.isMe ? mine.a : mine.b) : null;
    for (const s of me?.starters ?? []) if (s.nfl) m.set(s.nfl, (m.get(s.nfl) ?? 0) + 1);
    return m;
  }, [live.view, live.replay, week, currentWeek, nflOnly]);

  // my starters (with their live fantasy points) and the league's rostered players, for the live cards; none under "nfl only" or in a replay
  const mineLive = useMemo(() => {
    if (nflOnly || live.replay) return [];
    const mine = live.view?.mine;
    return (mine ? (mine.a.isMe ? mine.a : mine.b) : null)?.starters ?? [];
  }, [live.view, live.replay, nflOnly]);
  const leaguePlayers = useMemo(() => (nflOnly ? [] : model?.players ?? []), [model, nflOnly]);

  const gameId = params.get('game');
  const openGame = gameId ? (viewed.games ?? []).find((g) => g.id === gameId) ?? (cur.games ?? []).find((g) => g.id === gameId) ?? null : null;
  const openWeek = openGame?.week ?? week;

  const onStats = tab === 'stats';
  const onTable = tab === 'standings' || tab === 'picture';
  const loading = viewed.loading || (needsResults && results.loading) || (onStats && seasonStats.loading) || state.loading;
  const error = viewed.error ?? (needsResults ? results.error : undefined) ?? (onStats ? seasonStats.error : undefined) ?? state.error;
  const asOf = [viewed.asOf, needsResults ? results.asOf : null, onStats ? seasonStats.asOf : null].filter((x): x is number => x !== null);
  const header = {
    asOf: asOf.length ? Math.min(...asOf) : null, fromCache: false,
    stale: viewed.stale || (needsResults && results.stale) || (onStats && seasonStats.stale), error, loading,
    refresh: async () => {
      await Promise.all([
        viewed.refresh(), needsResults ? results.refresh() : Promise.resolve(), onStats ? seasonStats.refresh() : Promise.resolve(),
        live.available ? live.refresh() : Promise.resolve(),
      ]);
    },
  };

  return (
    <div className="page page-fade nf">
      <PageHeader kicker={page.kicker} title={page.name} data={header} />
      <div className="nf-toolbar nf-top-tools">
        <button type="button" className="btn quiet" aria-pressed={nflOnly} onClick={() => setNflOnly(!nflOnly)} title="hide owners, your players and the fantasy sections">
          nfl only
        </button>
      </div>
      <div className="nf-tabs" data-live={liveCount > 0 ? 'true' : undefined}>
        <PageTabs tabs={tabs} label="nfl view" defaultTab={defaultTab}>
          {(t) => (
            <>
              {t === 'live' && (
                <LiveTab
                  games={liveGames} now={live.snapshot ? live.snapshot.clock : wall} next={live.nextGame} fantasy={!nflOnly}
                  starters={mineLive} players={leaguePlayers} changes={changes} loaded={cur.games !== null} motion={motion}
                  asOf={cur.asOf} onOpen={(id) => setParam('game', id, false)}
                />
              )}
              {t === 'scoreboard' && (
                <>
                  {currentWeek > 0 && <WeekPicker week={week} currentWeek={currentWeek} onPick={(w) => setParam('week', w === currentWeek ? null : String(w))} />}
                  {week === currentWeek && <LiveStrip games={liveGames} />}
                  {viewed.games ? (
                    <Scoreboard
                      week={week} currentWeek={currentWeek} games={viewed.games} mineByTeam={mineStarters}
                      now={week === currentWeek && live.snapshot ? live.snapshot.clock : wall}
                      onOpen={(id) => setParam('game', id, false)} fantasy={!nflOnly}
                    />
                  ) : (
                    <p className="note" role="status">{error ? `could not load the scores. ${error}` : 'loading the scoreboard…'}</p>
                  )}
                </>
              )}
              {t === 'stats' && (
                <StatsPane weeks={seasonStats.weeks} records={standings.records} ready={results.ready} currentWeek={currentWeek} loading={seasonStats.loading} />
              )}
              {(t === 'standings' || t === 'picture') && onTable && (
                <>
                  <Segmented
                    label="conference" value={conf} onChange={(c) => setParam('conf', c === 'AFC' ? null : c)}
                    options={CONFERENCES.map((c) => ({ value: c, label: c.toLowerCase() }))}
                  />
                  {!results.ready && !results.error ? <p className="note" role="status">loading the season’s results…</p>
                    : t === 'standings' ? <StandingsView standings={standings} conference={conf} mine={mineRostered} />
                      : <PictureView standings={standings} conference={conf} />}
                </>
              )}
            </>
          )}
        </PageTabs>
      </div>
      <p className="note attribution">scores: sleeper public api · stats: sleeper{nflOnly ? '' : ' · fantasy points and rosters: sleeper league data'}.</p>
      {openGame && (
        <GameDrawer game={openGame} week={openWeek} currentWeek={currentWeek} season={season} fantasy={!nflOnly} onClose={() => setParam('game', null)} />
      )}
    </div>
  );
}
