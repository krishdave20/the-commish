import { useRef } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { LiveDot } from '../components/ticker/LiveDot';
import { AccountSwitcher } from './AccountSwitcher';
import { useLiveMaybe } from './live/liveContext';
import { FOOTER_NAV, LEAGUES_NAV } from './routes';
import { PAGES } from './names';
import { LargeTitle, PhoneHeader } from './PhoneChrome';
import { useFlip } from './useFlip';
import { useNavOrder } from './useNavOrder';
import { useTeamIdentity } from './useTeamIdentity';
import '../styles/topnav.css';

/** Pages that get the calm pulse beside their tab while NFL games are on. */
const LIVE_TABS: ReadonlySet<string> = new Set([PAGES.gameday.path, PAGES.nfl.path]);

/** "icemen", and under it one muted line: league, week and record. Decorative banner, not a heading: each page keeps its own single h1. */
function TeamHeader() {
  const { name, context } = useTeamIdentity();
  return (
    <div className="tn-id">
      <p className="tn-team">{name}</p>
      <p className="tn-ctx">{context || '\u00a0'}</p>
    </div>
  );
}

/** The site header on wide screens: a large team name, the league switcher and appearance toggle at the right, and a row of section tabs
    under it. Phones get PhoneTop and the bottom tab bar instead (PhoneChrome.tsx). */
export function Sidebar() {
  const live = useLiveMaybe()?.live ?? false;
  const { order, promoted } = useNavOrder();
  const nav = useRef<HTMLElement>(null);
  useFlip(nav, order.map((n) => n.path).join(' '));
  return (
    <header className="sidebar">
      <NavLink to="/" className="wordmark">
        the commish
        <small>fantasy football, from public data</small>
      </NavLink>
      <TeamHeader />
      <div className="tn-tools">
        <NavLink to={LEAGUES_NAV.path} className="tn-leagues">{LEAGUES_NAV.label}</NavLink>
        {/* settings live with the account tools, not among the sections, so the tab row stays one line */}
        <NavLink to={PAGES.settings.path} className="tn-leagues">{PAGES.settings.name}</NavLink>
        <AccountSwitcher />
        <ThemeSwitch className="tn-theme" />
      </div>
      <nav className="nav" aria-label="Primary" ref={nav}>
        {order.filter((n) => n.path !== PAGES.settings.path).map((n) => (
          <NavLink
            key={n.path} to={n.path} end={n.path === '/'} data-flip={n.path}
            data-up={promoted[n.path] ? 'true' : undefined} title={promoted[n.path] ? `up front: ${promoted[n.path]}` : undefined}
          >
            {n.label}
            {promoted[n.path] && (
              <>
                <span className="nav-up" aria-hidden="true" />
                <span className="sr-only"> (up front: {promoted[n.path]})</span>
              </>
            )}
            {LIVE_TABS.has(n.path) && live && (
              <>
                <LiveDot />
                <span className="sr-only"> (live)</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

/** The phone's top: the sticky bar with the score ticker under it, then the large title in the page flow. */
export function PhoneTop({ ticker }: { ticker: ReactNode }) {
  const { name, context } = useTeamIdentity();
  return (
    <>
      <PhoneHeader name={name}>{ticker}</PhoneHeader>
      <LargeTitle name={name} context={context} />
    </>
  );
}

/** Under the hood sits quietly at the bottom of every page. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      <nav className="nav-sub" aria-label="Reference">
        {FOOTER_NAV.map((n) => <NavLink key={n.path} to={n.path}>{n.label}</NavLink>)}
      </nav>
    </footer>
  );
}
