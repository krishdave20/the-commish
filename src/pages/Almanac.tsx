import { lazy, Suspense } from 'react';
import { PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { PageHeader } from '../components/PageHeader';
import { PageTabs } from '../components/PageTabs';
import { BlockSkeleton, PageSkeleton } from '../components/Skeleton';
import { AllTime } from './almanac/AllTime';
import { Champions } from './almanac/Champions';
import { Headline } from './almanac/Headline';
import { RecordsTab } from './almanac/RecordsTab';
import { useAlmanac } from './almanac/useAlmanac';
import '../styles/almanac.css';

// the head-to-head matrix and its drawer are fetched when their tab opens
const Rivalries = lazy(() => import('./almanac/Rivalries').then((m) => ({ default: m.Rivalries })));

/** The record book: every champion, every record and every head-to-head series in the league's history, worked from Sleeper's own results. */
export default function Almanac() {
  const view = useAlmanac();
  const { almanac, resource, league, progress, devLeagueId } = view;
  usePageTitle(PAGES.almanac.path);
  const p = PAGES.almanac;
  return (
    <div className="page page-fade">
      <PageHeader kicker={p.kicker} title={p.name} data={resource} />
      {devLeagueId && (
        <p className="note" role="status">development view: showing league {devLeagueId}{league ? ` (${league.name}, ${league.season})` : ''}.</p>
      )}
      {!league ? (
        <p className="note" role="status">{devLeagueId ? 'looking up that league…' : 'no league is selected yet.'}</p>
      ) : resource.error && !almanac ? (
        <p className="note neg-c" role="status">could not load the league’s history. {resource.error}</p>
      ) : !almanac ? (
        <>
          <p className="note" role="status">
            {progress ? `following the league back through its seasons… ${progress}` : 'following the league back through its seasons…'}
            {' '}the first visit reads every past week; after that it is saved on this device.
          </p>
          <PageSkeleton />
        </>
      ) : (
        <>
          <Headline almanac={almanac} />
          {almanac.missing.length > 0 && (
            <p className="note neg-c" role="status">
              {almanac.missing.length === 1 ? 'one week' : `${almanac.missing.length} weeks`} could not be loaded ({almanac.missing.slice(0, 4).join(', ')}{almanac.missing.length > 4 ? ', …' : ''}),
              so those games are missing below. refresh to try again.
            </p>
          )}
          {resource.data?.error && <p className="note neg-c" role="status">an earlier season could not be loaded, so the history stops there. {resource.data.error}</p>}
          <PageTabs
            label="Record book sections" defaultTab="champions"
            tabs={[
              { value: 'champions', label: 'champions' }, { value: 'records', label: 'records' },
              { value: 'alltime', label: 'all-time' }, { value: 'rivalries', label: 'rivalries' },
            ]}
          >
            {(tab) => tab === 'champions' ? <Champions almanac={almanac} userId={view.userId} />
              : tab === 'records' ? <RecordsTab almanac={almanac} />
              : tab === 'alltime' ? <AllTime almanac={almanac} userId={view.userId} />
              : (
                <Suspense fallback={<BlockSkeleton height="22rem" />}>
                  <Rivalries almanac={almanac} userId={view.userId} />
                </Suspense>
              )}
          </PageTabs>
        </>
      )}
    </div>
  );
}
