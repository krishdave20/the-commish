/* One source of truth for what each page and feature is called (owner request: fantasy football DNA; all lowercase).
   The name carries the flavor; the kicker says plainly what the page does. Routes do not change. */

export type PageKey =
  | 'home' | 'gameday' | 'nfl' | 'takes' | 'players' | 'team' | 'race' | 'waivers' | 'trades' | 'draft' | 'settings' | 'method' | 'signin';

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
  gameday: { path: '/gameday', name: 'game day', kicker: 'live scores · your matchup · around the league', blurb: 'your matchup live, every other matchup in the league, and the plays that moved them.' },
  nfl: { path: '/nfl', name: 'nfl', kicker: 'scores · stats · standings · around the nfl', blurb: 'every nfl game this week, the standings and the playoff picture, with your fantasy players in each game.' },
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

/** The section tabs under the team header, and the phone menu, in order (owner request, Oct 18, 2026: tabs replace the sidebar).
    Front office is the last tab; under the hood sits quietly in the footer. */
export const NAV_KEYS: PageKey[] = ['home', 'gameday', 'team', 'race', 'takes', 'nfl', 'waivers', 'trades', 'players', 'draft', 'settings'];

/** Kept for the smoke test, which still reads the old grouped navigation: one group holding every section tab. */
export const NAV_GROUPS: ReadonlyArray<{ label: string; keys: PageKey[] }> = [{ label: 'sections', keys: NAV_KEYS }];

/** The page that sits quietly at the bottom. */
export const FOOTER_KEYS: PageKey[] = ['method'];

/** Section names inside the nfl page (fantasy flavor in the sections, plain words on the tabs). */
export const NFL_COPY = {
  tabs: { scoreboard: 'scoreboard', stats: 'stats', standings: 'standings', picture: 'playoff picture' },
  yourPlayers: 'your players in this game',
  yourLeague: 'your league in this game',
  topPerformers: 'top performers',
  waiverWatch: 'waiver watch',
  byQuarter: 'by quarter',
  ifToday: 'if the season ended today',
  tiebreakNote: 'simplified tiebreakers; official nfl tiebreakers include more steps',
} as const;

/** Feature and section names inside pages. */
export const FEATURE = {
  /* game day: football and broadcast flavor */
  mainEvent: 'the main event',
  onDeck: 'on deck',
  finalWhistle: 'final whistle',
  aroundLeague: 'around the league',
  gameBalls: 'game balls',
  sideline: 'left on the sideline',
  driveChart: 'the drive chart',
  winMeter: 'win probability',
  winOverTime: 'win probability over time',
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
  /* hot takes */
  takesFeed: 'the feed',
  takesForPlayer: 'hot takes',
  /* huddle sections */
  odds: 'playoff odds',
  matchup: 'this week’s matchup',
  injuries: 'injury flags',
  waiverAdds: 'top waiver adds',
  yourTakes: 'hot takes for your players',
  movers: 'value movers',
  rookies: 'rookie class',
  ageProfile: 'roster age profile',
  history: 'league history',
  countdown: 'draft countdown',
  prep: 'prep checklist',
  preview: 'previewing',
  /* playoff brackets */
  bracket: 'road to the ’ship',
  bracketKicker: 'playoff bracket',
  yourPath: 'your path',
  /** front office: how the non-playoff teams' bracket works */
  losersSetting: 'the toilet bowl',
} as const;

/** What the non-playoff teams' bracket is called and says, by mode. The toilet bowl is the default (owner request, Oct 16, 2026):
    the LOSER of each game advances and the team that loses every round is crowned the worst team. The same bracket runs as a
    plain consolation bracket (winners advance) when the front-office setting says so. */
export const LOSERS_COPY = {
  toilet: {
    name: 'the toilet bowl',
    kicker: 'consolation bracket: losers advance',
    /** the odds column and the team drawer's line */
    odds: 'flush',
    oddsHeader: 'flush %',
    champ: 'toilet bowl champ',
    line: 'crowned the worst team in the league',
    verb: 'flush',
    advanced: 'flushed',
    chance: 'to lose',
    hint: 'click the team that gets flushed. the loser advances, and the team that loses every round is crowned.',
  },
  consolation: {
    name: 'the consolation prize',
    kicker: 'consolation bracket: winners advance',
    odds: 'consolation',
    oddsHeader: 'consolation %',
    champ: 'consolation champ',
    line: 'best of the rest',
    verb: 'advance',
    advanced: 'advances',
    chance: 'to win',
    hint: 'click the team that wins. winners advance, like the playoffs, among the teams that missed them.',
  },
} as const;

export type LosersMode = keyof typeof LOSERS_COPY;

/** The championship bracket's copy, in the same shape. */
export const TITLE_COPY = {
  name: FEATURE.bracket,
  kicker: FEATURE.bracketKicker,
  odds: 'title',
  oddsHeader: 'title %',
  champ: 'league champ',
  line: 'wins the whole thing',
  verb: 'advance',
  advanced: 'advances',
  chance: 'to win',
  hint: 'click a team to advance it; click it again to undo. title odds update with every pick.',
} as const;

/** What each detector is called in the filter row (the plain-English name of the rule behind the card). */
export const TAKE_KIND_LABEL = {
  usage_spike: 'usage spike',
  target_hog: 'target hog',
  buy_low: 'buy low',
  sell_high: 'sell high',
  rz_role_change: 'red-zone role',
  box_count_edge: 'box-count edge',
  blitz_beater: 'blitz beater',
  soft_schedule: 'soft schedule',
  waiver_riser: 'waiver riser',
  dynasty_mover: 'dynasty mover',
  coverage_note: 'coverage note',
} as const;

/** healthy, questionable or out for a data-health level (the underlying level values stay ok, warn, fail). */
export const HEALTH_LABEL = { ok: 'healthy', warn: 'questionable', fail: 'out' } as const;

export function pageForPath(path: string): PageName | null {
  const hit = (Object.values(PAGES) as PageName[]).find((p) => p.path === path);
  return hit ?? null;
}

export function documentTitle(page: PageName | null): string {
  return page ? `${page.name} · the commish` : 'the commish';
}
