import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Phase } from '../data';
import { useActive, useLeagueBundle, useNflState } from '../app/hooks';
import { parsePreviewPhase, previewName } from '../app/huddlePhase';
import { useModel } from '../app/modelContext';
import { useNflverse } from '../app/nflverseData';
import { FEATURE, PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { currentDraft, safeDetectPhase } from '../app/phase';
import { Attribution } from '../components/Attribution';
import { PageHeader } from '../components/PageHeader';
import { PageTabs } from '../components/PageTabs';
import { PageSkeleton } from '../components/Skeleton';
import { AgeProfile } from './home/AgeProfile';
import { Drafting } from './home/Drafting';
import { HuddleStrip, SeasonStrip } from './home/HuddleStrip';
import { InjuriesCard } from './home/InjuriesCard';
import { LeagueHistory } from './home/LeagueHistory';
import { Movers } from './home/Movers';
import { PreDraft } from './home/PreDraft';
import { RookieClass } from './home/RookieClass';
import { TopTakes } from './home/TopTakes';
import { WaiversCard } from './home/WaiversCard';
import { PostseasonBrackets } from './home/PostseasonBrackets';
import { AlertsCard } from './team/AlertsCard';
import { useSleeperBrackets } from '../components/bracket/useBracketData';
import { buildStandings } from './standings';
import type { StandingRow } from './standings';
import type { LeagueBundle } from '../data';
import type { Engine } from '../engine';

/** The huddle: one slim row of figures that answers "how am I doing", and under it only what you can act on this week.
    The league panel and the standings live in the front office and the playoff picture. `?phase=` previews another layout. */
export default function Home() {
  const bundle = useLeagueBundle();
  usePageTitle(PAGES.home.path);
  const nfl = useNflState();
  const model = useModel();
  const nv = useNflverse();
  const brackets = useSleeperBrackets();
  const { data: active } = useActive();
  const [params] = useSearchParams();
  const data = bundle.data;
  const userId = active?.account.userId ?? null;

  const rows = useMemo(() => (data ? buildStandings(data, userId) : []), [data, userId]);
  const mine = rows.find((r) => r.isMine) ?? null;

  const live = useMemo(
    () => (data && nfl.data ? safeDetectPhase(nfl.data, data.league, currentDraft(data.league, data.drafts)) : null),
    [data, nfl.data],
  );
  // `#/?phase=offseason` forces a layout for review
  const forced = parsePreviewPhase(params.get('phase'));
  const phase: Phase | null = forced ?? live;
  const inSeason = phase === 'in_season' || phase === 'postseason';
  const season = nfl.data?.league_season ?? nfl.data?.season ?? data?.league.season ?? '';
  const played = !!mine && mine.wins + mine.losses + mine.ties > 0;

  const header = { ...bundle, refresh: async () => { await Promise.all([bundle.refresh(), model.refresh(), nv.refresh(), brackets.refresh()]); } };

  return (
    <div className="page page-fade">
      <PageHeader kicker={data ? `${PAGES.home.kicker} · ${data.league.season} season` : PAGES.home.kicker} title={PAGES.home.name} data={header} />

      {forced && (
        <p className="preview-note" role="status">
          <span>{FEATURE.preview}: {previewName(forced)}</span>
          <Link to={PAGES.home.path}>back to live</Link>
        </p>
      )}

      {!active?.leagueId && (
        <p className="note">No league is selected yet. Use “Add an account” in the sidebar to follow one.</p>
      )}
      {active?.leagueId && !data && !bundle.loading && (
        <p className="note neg-c" role="status">League data is not available yet. Try Refresh.</p>
      )}

      {data && phase === 'drafting' && <Drafting bundle={data} userId={userId} />}
      {data && phase === 'pre_draft' && <PreDraft bundle={data} userId={userId} />}
      {data && phase === 'offseason' && <OffseasonSections bundle={data} userId={userId} season={season} mine={played ? mine : null} teams={rows.length} />}
      {data && inSeason && <InSeasonSections engine={model.engine} loading={model.loading} error={model.error} phase={phase} mine={mine} teams={rows.length} />}

      {data && <Attribution sources={['sleeper', 'nflverse', 'fantasycalc']} />}
    </div>
  );
}

/** The strip, then start/sit alerts, the top three waiver adds and the top three takes for my players. */
function InSeasonSections({ engine, loading, error, phase, mine, teams }: {
  engine: Engine | null; loading: boolean; error: string | undefined; phase: Phase | null; mine: StandingRow | null; teams: number;
}) {
  if (!engine) {
    return (
      <>
        <p className={`note${error && !loading ? ' neg-c' : ''}`} role="status">
          {loading ? 'building the model for your odds, matchup and waiver adds…' : error ? `could not build the model. ${error}` : 'no model yet.'}
        </p>
        {loading && <PageSkeleton cards={2} />}
      </>
    );
  }
  return (
    <>
      {mine && <HuddleStrip mine={mine} teams={teams} engine={engine} showPath={phase !== 'postseason'} />}
      {phase === 'postseason' && <PostseasonBrackets engine={engine} />}
      <div className="grid2">
        <div className="stack">
          <AlertsCard engine={engine} withWire={false} />
          <InjuriesCard engine={engine} />
        </div>
        <WaiversCard engine={engine} />
      </div>
      <TopTakes />
    </>
  );
}

/** Dynasty value movers, the rookie class, my roster's age profile and the league's history: one at a time. */
function OffseasonSections({ bundle, userId, season, mine, teams }: { bundle: LeagueBundle; userId: string | null; season: string; mine: StandingRow | null; teams: number }) {
  return (
    <>
      {mine && <SeasonStrip mine={mine} teams={teams} />}
      <PageTabs
        label="Offseason sections" defaultTab="movers"
        tabs={[
          { value: 'movers', label: 'value movers' }, { value: 'rookies', label: 'rookie class' },
          { value: 'age', label: 'roster age' }, { value: 'history', label: 'league history' },
        ]}
      >
        {(tab) => tab === 'movers' ? <Movers bundle={bundle} userId={userId} />
          : tab === 'rookies' ? <RookieClass league={bundle.league} season={season} />
          : tab === 'age' ? <AgeProfile bundle={bundle} userId={userId} />
          : <LeagueHistory bundle={bundle} userId={userId} />}
      </PageTabs>
    </>
  );
}
