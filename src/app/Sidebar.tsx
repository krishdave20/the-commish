import { NavLink } from 'react-router-dom';
import { AccountSwitcher } from './AccountSwitcher';
import { METHOD_PATH, NAV } from './routes';
import { PAGES } from './names';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <NavLink to="/" className="wordmark" aria-label="the commish home">
        the commish
        <small>fantasy football, from public data</small>
      </NavLink>
      <nav className="nav" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.path} to={n.path} end={n.path === '/'}>{n.label}</NavLink>
        ))}
      </nav>
      <nav className="nav nav-sub" aria-label="Reference">
        <NavLink to={METHOD_PATH}>{PAGES.method.name}</NavLink>
      </nav>
      <AccountSwitcher />
    </aside>
  );
}
