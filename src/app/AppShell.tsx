import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useActive } from './hooks';
import { Sidebar } from './Sidebar';
import { SIGN_IN_PATH } from './routes';
import { usePageTitle } from './usePageTitle';

/** Layout route for every page except sign-in. With no active account it redirects to /signin. */
export function AppShell() {
  const { data: active } = useActive();
  const location = useLocation();
  usePageTitle(location.pathname);
  if (!active) return <Navigate to={SIGN_IN_PATH} replace />;
  return (
    <div className="app">
      <Sidebar />
      <main className="main" id="main" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
