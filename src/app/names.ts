/* One source of truth for what each page and feature is called (owner request: fantasy football DNA; all lowercase).
   The name carries the flavor; the kicker says plainly what the page does. Routes do not change. */

export type PageKey =
  | 'home' | 'takes' | 'players' | 'team' | 'race' | 'waivers' | 'trades' | 'draft' | 'settings' | 'method' | 'signin';

export interface PageName {
  path: string;
  /** shown in the sidebar, as the page title and in document.title */
  name: string;
  /** plain-English line above the title */
  kicker: string;
  /** one sentence, used by placeholders */
  blurb: string;
}

export const PAGES: Record<PageKey, PageName> = {
  home: { path: '/', name: 'huddle', kicker: 'this week at a glance', blurb: 'your league, your record and where you stand.' },
  takes: { path: '/takes', name: 'hot takes', kicker: 'rule-based reads from real numbers', blurb: 'a short-form feed in the voice of a sharp fantasy writer: quick, specific, numbers first. rules and templates only; no ai.' },
  players: { path: '/players', name: 'scouting report', kicker: 'every player, every split', blurb: 'search every player and open a profile built from free play-by-play, snap and charting data.' },
  team: { path: '/team', name: 'locker room', kicker: 'your roster and lineup', blurb: 'your roster with usage and value, and the lineup that gives you the best shot each week.' },
  race: { path: '/race', name: 'playoff picture', kicker: 'standings, odds, clinch marks', blurb: 'where every team stands and what it would take to make the playoffs.' },
  waivers: { path: '/waivers', name: 'waiver wire', kicker: 'who helps your lineup most', blurb: 'the best adds for your lineup, and what to bid on them.' },
  trades: { path: '/trades', name: 'trade block', kicker: 'score any deal', blurb: 'test any trade against your lineup and your playoff odds.' },
  draft: { path: '/draft', name: 'draft room', kicker: 'rankings, mock drafts, live assistant', blurb: 'rankings, mock drafts and a live assistant for draft day.' },
  settings: { path: '/settings', name: 'front office', kicker: 'accounts, data, cache', blurb: 'linked accounts, refresh schedule, cache and data checks.' },
  method: { path: '/method', name: 'under the hood', kicker: 'model, calibration, sources', blurb: 'how the numbers are made.' },
  signin: { path: '/signin', name: 'check in', kicker: 'follow your sleeper leagues', blurb: 'enter a sleeper username to follow your leagues.' },
};

/** The nine pages in the sidebar, in order. */
export const NAV_KEYS: PageKey[] = ['home', 'takes', 'players', 'team', 'race', 'waivers', 'trades', 'draft', 'settings'];

/** Feature and section names inside pages. */
export const FEATURE = {
  lab: 'the lab',
  alerts: 'start/sit alerts',
  machine: 'playoff machine',
  magic: 'magic number',
  seeding: 'seeding odds',
  lift: 'lineup lift',
  handshake: 'handshake deals',
  contender: 'contender or rebuilder',
  onTheClock: 'on the clock',
  mock: 'mock draft',
  injuryReport: 'injury report',
} as const;

/** healthy, questionable or out for a data-health level (the underlying level values stay ok, warn, fail). */
export const HEALTH_LABEL = { ok: 'healthy', warn: 'questionable', fail: 'out' } as const;

export function pageForPath(path: string): PageName | null {
  const hit = (Object.values(PAGES) as PageName[]).find((p) => p.path === path);
  return hit ?? null;
}

export function documentTitle(page: PageName | null): string {
  return page ? `${page.name} · war room` : 'war room';
}
