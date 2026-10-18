import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ThemeToggle } from '../components/ThemeToggle';
import { LiveDot } from '../components/ticker/LiveDot';
import { AccountSwitcher } from './AccountSwitcher';
import { useActive } from './hooks';
import { useLiveMaybe } from './live/liveContext';
import { useModel } from './modelContext';
import { FOOTER_NAV, NAV } from './routes';
import { PAGES } from './names';
import '../styles/topnav.css';

/** The name of the page a path belongs to ("/players/123" is the scouting report). */
function currentPageName(pathname: string): string {
  const all = [...NAV, ...FOOTER_NAV].map((n) => ({ path: n.path, name: n.label }));
  const hit = all.find((p) => (p.path === '/' ? pathname === '/' : pathname === p.path || pathname.startsWith(`${p.path}/`)));
  return hit?.name ?? PAGES.home.name;
}

/** Pages that get the calm pulse beside their tab while NFL games are on. */
const LIVE_TABS: ReadonlySet<string> = new Set([PAGES.gameday.path, PAGES.nfl.path]);

/** "icemen", and under it one muted line: league, week and record. Decorative banner, not a heading: each page keeps its own single h1. */
function TeamHeader() {
  const { model } = useModel();
  const { data: active } = useActive();
  const me = model?.teams.find((t) => t.rid === model.meRid) ?? model?.teams.find((t) => t.isMe) ?? null;
  const name = me?.team ?? active?.account.displayName ?? 'the commish';
  const ctx = model && me
    ? [model.meta.leagueName, `week ${model.meta.currentWeek}`, `you’re ${me.wins}–${me.losses}${me.ties ? `–${me.ties}` : ''}`].join(' · ')
    : model ? [model.meta.leagueName, `week ${model.meta.currentWeek}`].join(' · ') : '';
  return (
    <div className="tn-id">
      <p className="tn-team">{name}</p>
      {ctx && <p className="tn-ctx">{ctx}</p>}
    </div>
  );
}

/** The site header. Wide screens: a large team name, the league switcher and appearance toggle at the right, and a row of section tabs
    under it. Under 760px: a compact bar (team name and a menu button); the tabs and the switcher open from the button as a grid. */
export function Sidebar() {
  // the menu is open for one path only, so any navigation closes it without an effect
  const { pathname } = useLocation();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === 'function' ? v(cur === pathname) : v) ? pathname : null));
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const here = currentPageName(pathname);
  const live = useLiveMaybe()?.live ?? false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenAt(null);
      button.current?.focus();
    };
    // a tap anywhere outside the bar closes it
    const onPointer = (e: PointerEvent) => {
      if (e.target instanceof Node && !header.current?.contains(e.target)) setOpenAt(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <header className="sidebar" data-open={open ? 'true' : 'false'} ref={header}>
      <NavLink to="/" className="wordmark">
        the commish
        <small>fantasy football, from public data</small>
      </NavLink>
      <TeamHeader />
      <button
        type="button" className="menu-btn" ref={button}
        aria-expanded={open} aria-controls={menuId} aria-label={open ? 'close menu' : `menu, you are on ${here}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">{open ? 'close' : here}</span>
        <span className="menu-ico" aria-hidden="true" />
      </button>
      <div className="menu" id={menuId}>
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.path === '/'}>
              {n.label}
              {LIVE_TABS.has(n.path) && live && (
                <>
                  <LiveDot />
                  <span className="sr-only"> (live)</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="tn-tools">
          <AccountSwitcher />
          <ThemeToggle className="tn-theme" />
        </div>
      </div>
    </header>
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
