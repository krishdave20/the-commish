import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AccountSwitcher } from './AccountSwitcher';
import { METHOD_PATH, NAV } from './routes';
import { PAGES } from './names';

/** The name of the page a path belongs to ("/players/123" is the scouting report). */
function currentPageName(pathname: string): string {
  const all = [...NAV.map((n) => ({ path: n.path, name: n.label })), { path: METHOD_PATH, name: PAGES.method.name }];
  const hit = all.find((p) => (p.path === '/' ? pathname === '/' : pathname === p.path || pathname.startsWith(`${p.path}/`)));
  return hit?.name ?? PAGES.home.name;
}

/** The site header. From 760px up it is the left sidebar. Under that it is a sticky top bar with a menu button:
    the page names open as a grid, so every page is one tap away and the current one is named on the button. */
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
            <NavLink key={n.path} to={n.path} end={n.path === '/'}>{n.label}</NavLink>
          ))}
        </nav>
        <nav className="nav nav-sub" aria-label="Reference">
          <NavLink to={METHOD_PATH}>{PAGES.method.name}</NavLink>
        </nav>
        <AccountSwitcher />
      </div>
    </header>
  );
}
