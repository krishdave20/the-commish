import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkipLink } from '../components/SkipLink';
import { LiveActivity } from '../components/live-activity';
import { Ticker } from '../components/ticker/Ticker';
import { useTickerMode } from '../components/ticker/useTickerMode';
import { useActive } from './hooks';
import { LiveProvider } from './live/LiveProvider';
import { MomentsProvider } from './moments/MomentsProvider';
import { Sidebar, SiteFooter } from './Sidebar';
import { SIGN_IN_PATH } from './routes';
import { useScrollRegions } from './useScrollRegions';
import { usePageTitle } from './usePageTitle';

/** The frame inside the live provider: skip link, the score ticker across the top, then the sidebar and the page.
    `data-ticker` tells the CSS how tall the ticker is, so the sticky sidebar sits just under it. */
function Frame() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const ticker = useTickerMode();
  usePageTitle(location.pathname);
  useScrollRegions();
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <>
      <SkipLink />
      <div className="shell" data-ticker={ticker}>
        <Ticker />
        <LiveActivity />
        <div className="app">
          <Sidebar />
          <main className="main" id="main" tabIndex={-1} ref={main} key={location.pathname}>
            <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
          </main>
          <SiteFooter />
        </div>
      </div>
    </>
  );
}

/** Layout route for every page except sign-in. With no active account it redirects to /signin.
    Landmarks: the site header (banner and navigation) and one main. A new page moves focus to main, so the skip link and
    screen readers start at the top of the page instead of on a link that is no longer there.
    The live provider sits here, so the ticker, the nav's live dot and game day share one poller (and sign-in polls nothing). */
export function AppShell() {
  const { data: active } = useActive();
  if (!active) return <Navigate to={SIGN_IN_PATH} replace />;
  // one moments computation shared by the live activity pill, the page banners and the huddle
  return <LiveProvider><MomentsProvider><Frame /></MomentsProvider></LiveProvider>;
}
