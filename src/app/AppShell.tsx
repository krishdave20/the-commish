import { useEffect, useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { SkipLink } from '../components/SkipLink';
import { useActive } from './hooks';
import { Sidebar } from './Sidebar';
import { SIGN_IN_PATH } from './routes';
import { useScrollRegions } from './useScrollRegions';
import { usePageTitle } from './usePageTitle';

/** Layout route for every page except sign-in. With no active account it redirects to /signin.
    Landmarks: the site header (banner and navigation) and one main. A new page moves focus to main, so the skip link and
    screen readers start at the top of the page instead of on a link that is no longer there. */
export function AppShell() {
  const { data: active } = useActive();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  usePageTitle(location.pathname);
  useScrollRegions();
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  if (!active) return <Navigate to={SIGN_IN_PATH} replace />;
  return (
    <>
      <SkipLink />
      <div className="app">
        <Sidebar />
        <main className="main" id="main" tabIndex={-1} ref={main} key={location.pathname}>
          <ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary>
        </main>
      </div>
    </>
  );
}
