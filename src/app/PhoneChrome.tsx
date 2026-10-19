import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Drawer } from '../components/Drawer';
import { useReducedMotion } from '../components/motion';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { LiveDot } from '../components/ticker/LiveDot';
import { AccountSwitcher } from './AccountSwitcher';
import { useLiveMaybe } from './live/liveContext';
import { FOOTER_NAV } from './routes';
import { PAGES } from './names';
import type { PageKey } from './names';
import { TabIcon } from './tabIcons';
import { useNavOrder } from './useNavOrder';
import { useScrolled } from './useScrolled';

/** The phone layout of the site header (under 760 px wide), in three pieces:
    - a compact sticky top bar (the brand, then the team name once the large title has scrolled away) with the score ticker under it,
    - the large title: the team name and one muted line, in the page flow so it simply scrolls away,
    - a bottom tab bar (the iOS pattern) with the four sections used most and "more", which opens every section as a sheet.
    Wide screens keep the row of section tabs (Sidebar.tsx). */

/** The label that fits five across a 375 px screen (the full name is what a reader hears), by path. Sections not listed use their own name. */
const SHORT: Record<string, string> = {
  [PAGES.race.path]: 'playoffs', [PAGES.waivers.path]: 'waivers', [PAGES.trades.path]: 'trades', [PAGES.players.path]: 'scouting',
  [PAGES.takes.path]: 'takes', [PAGES.draft.path]: 'draft', [PAGES.settings.path]: 'office',
};
const KEY_BY_PATH = new Map<string, PageKey>((Object.keys(PAGES) as PageKey[]).map((k) => [PAGES[k].path, k]));

function onPath(pathname: string, path: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}

/** Pages that get the calm pulse beside their name while NFL games are on. */
const LIVE_PATHS: ReadonlySet<string> = new Set([PAGES.gameday.path, PAGES.nfl.path]);

/** The top of the phone header: the score ticker, then the bar. The bar overlaps the large title's first line (a negative bottom margin), so
    at the top of the page there is no empty bar: the title starts right under the ticker, and as it scrolls under the bar the bar fills in with the
    team's name. `name` is the team name. */
export function PhoneHeader({ name, children }: { name: string; children?: ReactNode }) {
  const scrolled = useScrolled();
  const reduced = useReducedMotion();
  return (
    <header className="sidebar" data-phone="true" data-collapsed={scrolled ? 'true' : 'false'}>
      {children}
      <div className="pt-bar">
        {/* tap the bar to go back to the top (the iOS habit); nothing to tap until the large title has scrolled away */}
        <button
          type="button" className="pt-team" tabIndex={scrolled ? undefined : -1} aria-hidden={scrolled ? undefined : true}
          onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })}
        >
          <span className="sr-only">scroll to top, </span>{' '}{name}
        </button>
      </div>
    </header>
  );
}

/** The large title: the team name, and under it the league, week and record. Decorative (every page keeps its own h1); it scrolls away with the page. */
export function LargeTitle({ name, context }: { name: string; context: string }) {
  return (
    <div className="tn-id tn-large">
      <p className="tn-team">{name}</p>
      {/* always there, so the title does not grow a line when the league loads */}
      <p className="tn-ctx">{context || '\u00a0'}</p>
    </div>
  );
}

/** The bottom tab bar and the "more" sheet. Slot one is huddle; slots two to four are the next three sections in the navigation's order
    (the time-aware one, so on a Sunday: game day, nfl, locker room); slot five is "more", which lists every section in that order. */
export function TabBar() {
  const { pathname } = useLocation();
  const live = useLiveMaybe()?.live ?? false;
  const { order, promoted } = useNavOrder();
  // the sheet is open for one path only, so any navigation closes it without an effect
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const sheetId = useId();
  const slots = order.slice(0, 4);
  const inSlot = slots.some((n) => onPath(pathname, n.path));

  // the bar holds its own room, so a page's last line never sits behind it
  useEffect(() => {
    document.body.dataset.tabbar = 'on';
    return () => { delete document.body.dataset.tabbar; };
  }, []);

  return (
    <>
      <nav className="tabbar" aria-label="Primary">
        <ul>
          {slots.map((n) => {
            const short = SHORT[n.path];
            const key = KEY_BY_PATH.get(n.path) ?? 'home';
            const isLive = LIVE_PATHS.has(n.path) && live;
            return (
              <li key={n.path}>
                <NavLink to={n.path} end={n.path === '/'} className="tb-item" title={promoted[n.path] ? `up front: ${promoted[n.path]}` : undefined}>
                  <span className="tb-icon">
                    <TabIcon name={key} />
                    {isLive && <LiveDot />}
                  </span>
                  {short ? (
                    <>
                      <span className="tb-label" aria-hidden="true">{short}</span>
                      <span className="sr-only">{n.label}</span>
                    </>
                  ) : <span className="tb-label">{n.label}</span>}
                  {isLive && <span className="sr-only"> (live)</span>}
                  {promoted[n.path] && <span className="sr-only"> (up front: {promoted[n.path]})</span>}
                </NavLink>
              </li>
            );
          })}
          <li>
            <button
              type="button" className="tb-item" data-active={!inSlot ? 'true' : undefined}
              aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? sheetId : undefined}
              onClick={() => setOpenAt(pathname)}
            >
              <span className="tb-icon"><TabIcon name="more" /></span>
              <span className="tb-label">more</span>
            </button>
          </li>
        </ul>
      </nav>
      <Drawer open={open} onClose={() => setOpenAt(null)} title="more" kicker="every section">
        <div id={sheetId} className="more-sheet">
          <div className="more-appearance">
            <span className="micro">appearance</span>
            <ThemeSwitch />
          </div>
          <nav aria-label="All sections">
            <ul className="more-list">
              {order.map((n) => (
                <li key={n.path}>
                  <NavLink to={n.path} end={n.path === '/'} className="more-link" data-up={promoted[n.path] ? 'true' : undefined}>
                    <span>{n.label}</span>
                    {promoted[n.path] && <><span className="nav-up" aria-hidden="true" /><span className="sr-only"> (up front: {promoted[n.path]})</span></>}
                    {LIVE_PATHS.has(n.path) && live && <><LiveDot /><span className="sr-only"> (live)</span></>}
                  </NavLink>
                </li>
              ))}
              {FOOTER_NAV.map((n) => (
                <li key={n.path}><NavLink to={n.path} className="more-link more-quiet"><span>{n.label}</span></NavLink></li>
              ))}
            </ul>
          </nav>
          <div className="more-tools">
            <AccountSwitcher />
          </div>
        </div>
      </Drawer>
    </>
  );
}
