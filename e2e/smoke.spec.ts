/* End-to-end smoke test: launches the built app (vite preview of dist/), checks in from the saved fixture, and visits every
   route at desktop and phone width. All network traffic is served from reference/fixture/ (see network.ts); a request
   that escapes, a console error or an uncaught exception fails the test that caused it.
   Per route: heading and document title (from src/app/names.ts), the score ticker, then each in-page tab or accordion the way a
   person opens it, with one meaningful element per tab. Every state gets a screenshot in e2e/results/screens/, the horizontal
   overflow check and (desktop only) an axe scan. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { FEATURE, FOOTER_KEYS, LOSERS_COPY, NAV_KEYS, NFL_COPY, PAGES, type PageKey } from '../src/app/names.ts';
import { ALLOWED_AXE, FAIL_IMPACTS, isAllowed, scan, summarize, type AxeFinding } from './axe.ts';
import { manifest, myWeekPoints, pickPlayerWithUsage } from './fixture.ts';
import { RESULTS_DIR, SCREENS_DIR, expect, recordOverflow, signIn, test } from './session.ts';

const player = pickPlayerWithUsage();

/** Wait until nothing on the page says it is still loading or simming. */
async function settled(page: Page) {
  // the mock draft's own "progress" bar is part of that page, not a loading indicator
  await expect(page.getByRole('progressbar', { name: /refreshing|simulating/i })).toHaveCount(0);
  await expect(page.getByText(/simming the season|loading the nightly|^loading/i)).toHaveCount(0);
}

/** Source strings are lowercased by CSS on screen, but a few (check in, player names) are cased in the DOM, so compare without case. */
const escapeRe = (text: string) => text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
const exactly = (text: string) => new RegExp(`^${escapeRe(text)}$`, 'i');
const heading = (page: Page, name: string, level?: number) => page.getByRole('heading', { name: exactly(name), ...(level ? { level } : {}) });
/** wait for at least `min` body rows (the data may still be arriving) */
const expectRows = async (t: Locator, min: number, what: string) => expect(rowsOf(t).nth(min - 1), `${what}: at least ${min} rows`).toBeVisible();
const table = (page: Page, name: string | RegExp) => page.getByRole('table', { name });
const rowsOf = (t: Locator) => t.locator('tbody tr');
/** a segmented control or tab by its visible name */
const control = (page: Page, name: string | RegExp) =>
  page.getByRole('radio', { name }).or(page.getByRole('tab', { name })).or(page.getByRole('button', { name })).first();

/** one thing to do and check on a route: the default view, a tab, an accordion */
interface State {
  /** used in file names and the axe report ("rookie-class") */
  id: string;
  /** what a person would do to get here (click a tab, open an accordion), then the check for what they see */
  run: (page: Page) => Promise<void>;
}

interface Route {
  id: string;
  /** hash route, e.g. /draft */
  path: string;
  /** the h1 (lowercase, from names.ts) */
  h1: string;
  /** the document title starts with this */
  title: string;
  /** the default view first, then each tab or accordion */
  states: State[];
}

/** click a tab of an in-page tab group (`?tab=`), the way a person would, and check it is the selected one */
async function openTab(page: Page, group: string, label: string) {
  const radio = page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: exactly(label) });
  await radio.click();
  await expect(radio, `tab "${label}" is selected`).toBeChecked();
}
const tab = (group: string, label: string, check: (page: Page) => Promise<void>) => async (page: Page) => { await openTab(page, group, label); await check(page); };

const TABS = {
  offseason: 'Offseason sections', draftPrep: 'Draft prep', player: 'Player sections', team: 'Locker room sections', race: 'Playoff picture sections',
  waivers: 'Waiver wire sections', trades: 'Trade block sections', draft: 'Draft room section', gameday: 'league view', nfl: 'nfl view',
};

const ROUTES: Route[] = [
  {
    id: 'huddle', path: '/', h1: PAGES.home.name, title: PAGES.home.name,
    states: [{
      id: 'default',
      run: async (page) => {
        // a sentence about the week, and the dark "game plan" card
        const hero = page.getByRole('region', { name: 'this week in a sentence' });
        await expect(hero).toBeVisible();
        await expect(hero.locator('.hero-line'), 'the hero sentence').not.toHaveText('');
        await expect(heading(page, 'your game plan')).toBeVisible();
      },
    }],
  },
  {
    id: 'huddle-offseason', path: '/?phase=offseason', h1: PAGES.home.name, title: PAGES.home.name,
    states: [
      { id: 'value-movers', run: async (page) => { await expect(heading(page, FEATURE.movers)).toBeVisible(); await expectRows(table(page, /biggest risers/i), 1, 'risers'); } },
      { id: 'rookie-class', run: tab(TABS.offseason, 'rookie class', async (page) => { await expectRows(table(page, /rookie class/i), 1, 'rookie class'); }) },
      { id: 'roster-age', run: tab(TABS.offseason, 'roster age', async (page) => { await expect(heading(page, 'roster age profile')).toBeVisible(); }) },
      { id: 'league-history', run: tab(TABS.offseason, 'league history', async (page) => { await expect(heading(page, FEATURE.history)).toBeVisible(); }) },
    ],
  },
  {
    id: 'huddle-pre-draft', path: '/?phase=pre_draft', h1: PAGES.home.name, title: PAGES.home.name,
    states: [
      { id: 'prep', run: async (page) => { await expect(heading(page, FEATURE.prep)).toBeVisible(); } },
      { id: 'quick-mock', run: tab(TABS.draftPrep, 'quick mock', async (page) => { await expect(heading(page, FEATURE.mock)).toBeVisible(); }) },
      { id: 'tiers', run: tab(TABS.draftPrep, 'tiers', async (page) => { await expect(heading(page, 'tiers to study')).toBeVisible(); }) },
    ],
  },
  {
    id: 'game-day', path: PAGES.gameday.path, h1: PAGES.gameday.name, title: PAGES.gameday.name,
    states: [
      {
        id: 'around-the-league',
        run: async (page) => {
          await expect(heading(page, FEATURE.mainEvent)).toBeVisible();
          await expect(heading(page, FEATURE.winOverTime)).toBeVisible();
          await expect(heading(page, FEATURE.aroundLeague)).toBeVisible();
        },
      },
      { id: 'head-to-head', run: tab(TABS.gameday, 'head to head', async (page) => { await expect(heading(page, 'starters, head to head')).toBeVisible(); }) },
      { id: 'hinges', run: tab(TABS.gameday, 'hinges on', async (page) => { await expect(heading(page, 'who this week hinges on')).toBeVisible(); }) },
      { id: 'game-balls', run: tab(TABS.gameday, FEATURE.gameBalls, async (page) => { await expect(heading(page, FEATURE.gameBalls)).toBeVisible(); }) },
      { id: 'drive-chart', run: tab(TABS.gameday, FEATURE.driveChart, async (page) => { await expect(heading(page, FEATURE.driveChart)).toBeVisible(); }) },
      { id: 'sideline', run: tab(TABS.gameday, FEATURE.sideline, async (page) => { await expect(heading(page, FEATURE.sideline)).toBeVisible(); }) },
      {
        // the week picker reaches every played week; a finished week reads as final, with a replay offer (and no "hinges" tab: it is over)
        id: 'past-week',
        run: async (page) => {
          const week = manifest.week - 2;
          await pickWeek(page, week);
          await expect(page).toHaveURL(new RegExp(`week=${week}`));
          await expect(page.getByRole('button', { name: `replay week ${week}` })).toBeVisible();
          await expect(page.getByRole('radiogroup', { name: TABS.gameday }).getByRole('radio', { name: 'hinges on' })).toHaveCount(0);
          await expect(heading(page, FEATURE.mainEvent)).toBeVisible();
          await expect(page.locator('.gd-big').first(), 'a played week has real points').not.toHaveAttribute('aria-label', /\s0\.0$/);
          await pickWeek(page, manifest.week);
        },
      },
    ],
  },
  {
    id: 'nfl', path: PAGES.nfl.path, h1: PAGES.nfl.name, title: PAGES.nfl.name,
    states: [
      {
        id: 'scoreboard',
        run: async (page) => {
          // one card per NFL game, grouped by slot
          await expect(page.getByRole('radiogroup', { name: TABS.nfl }).getByRole('radio', { name: NFL_COPY.tabs.scoreboard })).toBeChecked();
          await expect(gameCards(page).nth(9), 'at least ten NFL games on the scoreboard').toBeVisible();
        },
      },
      { id: 'stats', run: tab(TABS.nfl, NFL_COPY.tabs.stats, async (page) => { await expect(heading(page, 'nfl stats')).toBeVisible(); await expectRows(table(page, /passing leaders/i), 5, 'passing leaders'); }) },
      { id: 'standings', run: tab(TABS.nfl, NFL_COPY.tabs.standings, async (page) => { await expectRows(table(page, /AFC East standings/i), 4, 'AFC East'); }) },
      { id: 'playoff-picture', run: tab(TABS.nfl, NFL_COPY.tabs.picture, async (page) => { await expectRows(table(page, /AFC playoff picture/i), 7, 'AFC playoff picture'); }) },
    ],
  },
  {
    id: 'hot-takes', path: PAGES.takes.path, h1: PAGES.takes.name, title: PAGES.takes.name,
    states: [{
      id: 'default',
      run: async (page) => {
        await expect(heading(page, FEATURE.takesFeed)).toBeVisible();
        await expect(page.locator('article.take-card').first(), 'at least one take card').toBeVisible();
      },
    }],
  },
  {
    id: 'scouting-report', path: PAGES.players.path, h1: PAGES.players.name, title: PAGES.players.name,
    states: [{
      id: 'default',
      run: async (page) => {
        await page.getByRole('searchbox').or(page.getByLabel(/search players/i)).first().fill(player.name.split(' ').slice(-1)[0]);
        await expect(page.getByRole('link', { name: player.name, exact: false }).first()).toBeVisible();
      },
    }],
  },
  {
    id: 'player-profile', path: `/players/${player.pid}`, h1: player.name.toLowerCase(), title: player.name.toLowerCase(),
    states: [
      { id: 'overview', run: async (page) => { await expect(heading(page, 'the facts')).toBeVisible(); await expect(heading(page, 'outlook')).toBeVisible(); } },
      { id: 'game-log', run: tab(TABS.player, 'game log', async (page) => { await expectRows(table(page, /^game log$/i), 1, 'game log'); }) },
      // the usage panel needs the nightly nflverse data (served from reference/fixture/nflverse/)
      { id: 'usage', run: tab(TABS.player, 'usage', async (page) => { await expect(heading(page, 'usage trends')).toBeVisible(); await expectRows(table(page, /season usage/i), 1, 'season usage'); }) },
      { id: 'splits', run: tab(TABS.player, 'splits', async (page) => { await expect(heading(page, 'charting splits')).toBeVisible(); await expectRows(table(page, /charting splits/i), 1, 'charting splits'); }) },
      { id: 'value', run: tab(TABS.player, 'value', async (page) => { await expect(heading(page, 'trade value')).toBeVisible(); }) },
    ],
  },
  {
    id: 'locker-room', path: PAGES.team.path, h1: PAGES.team.name, title: PAGES.team.name,
    states: [
      { id: 'lineup', run: async (page) => { await expectRows(table(page, /lineup for week/i), 9, 'lineup'); } },
      { id: 'roster', run: tab(TABS.team, 'roster', async (page) => { await expectRows(table(page, /^roster$/i), 6, 'roster'); }) },
      { id: 'the-lab', run: tab(TABS.team, FEATURE.lab, async (page) => { await expect(heading(page, FEATURE.lab)).toBeVisible(); await expectRows(table(page, /what-if roster/i), 1, 'what-if roster'); }) },
    ],
  },
  {
    id: 'playoff-picture', path: PAGES.race.path, h1: PAGES.race.name, title: PAGES.race.name,
    states: [
      { id: 'standings', run: async (page) => { await expectRows(table(page, /playoff picture standings/i), 12, 'standings'); } },
      { id: 'brackets', run: tab(TABS.race, 'brackets', async (page) => {
        await expect(heading(page, FEATURE.bracket)).toBeVisible();
        // narrow screens show one bracket at a time, with a switch between them
        const which = page.getByRole('radiogroup', { name: 'Which bracket' });
        if (await which.count()) await which.getByRole('radio', { name: LOSERS_COPY.toilet.name }).click();
        await expect(heading(page, LOSERS_COPY.toilet.name)).toBeVisible();
      }) },
      { id: 'playoff-machine', run: tab(TABS.race, FEATURE.machine, async (page) => { await expect(heading(page, FEATURE.machine)).toBeVisible(); await expectRows(table(page, /playoff machine standings/i), 12, 'machine'); }) },
      { id: 'odds-detail', run: tab(TABS.race, 'odds detail', async (page) => { await expect(heading(page, FEATURE.seeding)).toBeVisible(); await expect(heading(page, FEATURE.magic)).toBeVisible(); }) },
    ],
  },
  {
    id: 'waiver-wire', path: PAGES.waivers.path, h1: PAGES.waivers.name, title: PAGES.waivers.name,
    states: [
      { id: 'the-wire', run: async (page) => { await expectRows(table(page, /^waiver wire$/i), 1, 'waiver wire'); } },
      {
        id: 'streamers',
        run: tab(TABS.waivers, 'streamers', async (page) => {
          await expect(page).toHaveURL(/tab=streamers/);
          for (const pos of ['qb', 'te', 'def', 'k', 'flex fliers']) await expectRows(table(page, new RegExp(`^Streamers: ${pos}$`, 'i')), 1, `streamers: ${pos}`);
          await page.getByRole('radiogroup', { name: 'Streaming week' }).getByRole('radio', { name: 'week after' }).click();
          await expectRows(table(page, /^Streamers: qb$/i), 1, 'streamers: qb, week after');
          await page.getByRole('radiogroup', { name: 'Streaming week' }).getByRole('radio', { name: 'next week' }).click();
        }),
      },
      { id: 'risers', run: tab(TABS.waivers, 'trending & risers', async (page) => { await expectRows(table(page, /usage risers/i), 1, 'usage risers'); }) },
    ],
  },
  {
    id: 'trade-block', path: PAGES.trades.path, h1: PAGES.trades.name, title: PAGES.trades.name,
    states: [
      { id: 'analyzer', run: async (page) => { await expect(heading(page, 'the analyzer')).toBeVisible(); } },
      { id: 'handshake-deals', run: tab(TABS.trades, 'handshake deals', async (page) => { await expect(heading(page, FEATURE.handshake)).toBeVisible(); await expectRows(table(page, /handshake deals/i), 1, 'handshake deals'); }) },
      { id: 'dynasty', run: tab(TABS.trades, 'dynasty', async (page) => { await expect(heading(page, FEATURE.contender)).toBeVisible(); }) },
    ],
  },
  {
    id: 'draft-room', path: PAGES.draft.path, h1: PAGES.draft.name, title: PAGES.draft.name,
    states: [
      { id: 'rankings', run: async (page) => { await expectRows(table(page, /draft rankings/i), 25, 'draft rankings'); } },
      {
        id: 'mock-draft',
        run: tab(TABS.draft, FEATURE.mock, async (page) => {
          await expect(page).toHaveURL(/tab=mock/);
          await expect(heading(page, FEATURE.mock)).toBeVisible();
          await expect(table(page, /best available/i)).toBeVisible();
        }),
      },
      {
        id: 'on-the-clock',
        run: tab(TABS.draft, FEATURE.onTheClock, async (page) => {
          await expect(page).toHaveURL(/tab=clock/);
          await expect(heading(page, FEATURE.onTheClock)).toBeVisible();
          await expect(page.getByRole('button', { name: /replay your draft/i })).toBeVisible();
        }),
      },
      {
        id: 'draft-grades',
        run: tab(TABS.draft, 'draft grades', async (page) => {
          await expect(page).toHaveURL(/tab=grades/);
          await expectRows(table(page, /draft grades by team/i), 12, 'draft grades');
          await expect(heading(page, 'highlights')).toBeVisible();
        }),
      },
      {
        id: 'team-ratings',
        run: tab(TABS.draft, 'team ratings', async (page) => {
          await expect(page).toHaveURL(/tab=ratings/);
          await expect(heading(page, 'power ratings')).toBeVisible();
          await expectRows(table(page, /team power ratings/i), 12, 'team power ratings');
        }),
      },
    ],
  },
  {
    id: 'front-office', path: PAGES.settings.path, h1: PAGES.settings.name, title: PAGES.settings.name,
    states: [
      {
        id: 'default',
        run: async (page) => {
          await expect(heading(page, 'linked accounts')).toBeVisible();
          // appearance and the navigation's smart order now live here too
          await expect(heading(page, 'appearance')).toBeVisible();
          await expect(page.getByRole('radiogroup', { name: 'Smart order' }).getByRole('radio', { name: 'smart order: off' }), 'the tests run with smart order off').toBeChecked();
        },
      },
      {
        // "run checks" lives inside the closed injury report accordion
        id: 'injury-report',
        run: async (page) => {
          await page.locator('summary', { hasText: new RegExp(FEATURE.injuryReport, 'i') }).click();
          await page.getByRole('button', { name: /run checks/i }).click();
          const report = table(page, /endpoint checks/i);
          await expect(report).toBeVisible();
          await expectRows(report, 26, 'injury report');
          // no endpoint is "out" against the fixture
          await expect(report.locator('[data-level="fail"]'), 'endpoints reported as out').toHaveCount(0);
          for (const id of ['winners bracket', 'losers bracket', 'nfl scores']) {
            await expect(report.getByRole('row', { name: new RegExp(id, 'i') }), `${id} row`).toBeVisible();
          }
        },
      },
    ],
  },
  {
    id: 'under-the-hood', path: PAGES.method.path, h1: PAGES.method.name, title: PAGES.method.name,
    states: [{
      id: 'default',
      run: async (page) => {
        // accordions: the section titles are the headings
        for (const h of ['where the data comes from', 'floors and ceilings', 'clinch marks', 'credits']) await expect(heading(page, h)).toBeVisible();
        await page.locator('summary', { hasText: /clinch marks/i }).click();
        await expect(page.locator('details[open]').first()).toBeVisible();
      },
    }],
  },
  {
    id: 'check-in', path: PAGES.signin.path, h1: PAGES.signin.name, title: PAGES.signin.name,
    states: [{
      id: 'default',
      run: async (page) => {
        await expect(heading(page, 'linked accounts')).toBeVisible();
        await expect(page.getByText(manifest.username, { exact: false }).first()).toBeVisible();
      },
    }],
  },
];

/* A failed test restarts the worker, so findings live on disk: one file per state in e2e/results/axe/, merged into
   axe-report.json. */
const AXE_DIR = resolve(RESULTS_DIR, 'axe');

function allAxeFindings(): AxeFinding[] {
  return readdirSync(AXE_DIR).sort().flatMap((f) => JSON.parse(readFileSync(resolve(AXE_DIR, f), 'utf8')) as AxeFinding[]);
}

function writeAxeReport(): AxeFinding[] {
  const findings = allAxeFindings();
  writeFileSync(resolve(RESULTS_DIR, 'axe-report.json'), JSON.stringify({
    generatedFor: 'desktop 1280x900', fixture: { username: manifest.username, league_id: manifest.league_id },
    allowed: ALLOWED_AXE, findings,
  }, null, 2) + '\n');
  return findings;
}

/** one button per NFL game on the scoreboard ("final/ot AMZNSEA Seattle 3-3 14 at DEN ...") */
const gameCards = (page: Page) => page.locator('main button', { hasText: / at / });

/** On a phone the appearance toggle, the league switcher and the full list of sections sit in the "more" sheet of the bottom tab bar. Open it. */
async function showNav(page: Page, project: string) {
  if (project !== 'phone') return;
  const sheet = page.getByRole('dialog', { name: 'more' });
  if (!(await sheet.isVisible())) await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'more' }).click();
  await expect(sheet).toBeVisible();
}

/** game day's week picker: one chip per played week ("week 5", "week 6 (this week)") */
const pickWeek = (page: Page, week: number) => page.getByRole('group', { name: 'week' }).getByRole('button', { name: new RegExp(`^week ${week}\\b`) }).click();

const ticker = (page: Page) => page.getByRole('region', { name: 'league scores' });
const fileSafe = (s: string) => s.replace(/[^a-z0-9-]+/gi, '-');

/** The document's width against the window's, and the widest elements poking out past the window that are not inside their own scroller. */
async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const inner = window.innerWidth;
    // the widest elements poking out past the window that are not inside their own horizontal scroller
    const offenders: string[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.right <= inner + 1) continue;
      let scroller = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { scroller = true; break; }
      }
      if (scroller) continue;
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      offenders.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls} right=${Math.round(b.right)}`);
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: inner, offenders: offenders.slice(0, 6) };
  });
}

/** the screenshot, the horizontal overflow check and (desktop) the axe scan for the state the page is in */
async function record(page: Page, session: { project: string }, key: string, path: string) {
  await settled(page);
  mkdirSync(SCREENS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SCREENS_DIR, `${session.project}-${fileSafe(key)}.png`), fullPage: true });

  // no horizontal page scroll at any width
  const w = await measureOverflow(page);
  const ok = w.scrollWidth <= w.innerWidth + 1;
  recordOverflow(session.project, fileSafe(key), { path: `${path} [${key}]`, scrollWidth: w.scrollWidth, innerWidth: w.innerWidth, ok, ...(ok ? {} : { offenders: w.offenders }) });
  expect.soft(ok, `${key} overflows horizontally at ${session.project} width: document ${w.scrollWidth}px wide in a ${w.innerWidth}px window. Widest elements outside a scroller: ${w.offenders.join('; ')}`).toBe(true);

  if (session.project === 'desktop') {
    const found = await scan(page, key, path);
    writeFileSync(resolve(AXE_DIR, `${fileSafe(key)}.json`), JSON.stringify(found, null, 2) + '\n');
    writeAxeReport();
    const failing = found.filter((f) => FAIL_IMPACTS.has(f.impact) && !isAllowed(f));
    expect.soft(failing.map((f) => `${f.impact} ${f.rule} (${f.nodes.length} elements): ${f.help}\n    ${f.nodes.slice(0, 3).map((n) => `${n.target}  ${n.html.slice(0, 120)}`).join('\n    ')}`),
      `axe: serious/critical violations on ${key} (${path}) that are not in ALLOWED_AXE, or exceed its node count`).toEqual([]);
  }
}

test.describe('smoke', () => {
  test('checks in from the fixture and lands on the huddle', async ({ page, session }) => {
    await signIn(page);
    session.signedIn = true;
    await expect(page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('button', { name: /menu/i })).first()).toBeAttached();
    // no scores ticker on check in; it shows on the huddle
    await expect(ticker(page)).toBeVisible();
  });

  for (const r of ROUTES) {
    test(`route ${r.path} (${r.id})`, async ({ app: page, session }) => {
      await page.goto(`/#${r.path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(exactly(r.h1));
      await expect.soft(page).toHaveTitle(new RegExp(`^${escapeRe(r.title)}`, 'i'));
      // the scores ticker is on every page except check in
      if (r.id === 'check-in') await expect(page.locator('section.ticker')).toHaveCount(0);
      else await expect(ticker(page), 'the scores ticker').toBeVisible();

      for (const [i, st] of r.states.entries()) {
        await st.run(page);
        await record(page, session, i === 0 && r.states.length === 1 ? r.id : `${r.id}--${st.id}`, r.path);
      }
    });
  }

  test.describe('interactions', () => {
    test('playoff machine: "you win out" puts a clinch mark on your team', async ({ app: page }) => {
      await page.goto(`/#${PAGES.race.path}?tab=machine`);
      const machine = page.locator('section', { has: heading(page, FEATURE.machine) }).first();
      await machine.scrollIntoViewIfNeeded();
      const marks = machine.getByRole('img', { name: /clinched a playoff spot/i });
      await expect(marks, 'no team has clinched before any pick').toHaveCount(0);
      await machine.getByRole('button', { name: 'you win out' }).click();
      await expect(machine.getByText(/\d+ of \d+ remaining games picked/)).toBeVisible();
      await expect(marks.first(), 'a clinch mark appears').toBeVisible();
      await expect(machine.getByText('clinched with these picks.')).toBeVisible();
      await machine.getByRole('button', { name: 'clear' }).click();
      await expect(marks).toHaveCount(0);
    });

    test('brackets: "sim it" crowns a champ; the toilet bowl crowns a toilet bowl champ', async ({ app: page }) => {
      await page.goto(`/#${PAGES.race.path}`);
      await openTab(page, TABS.race, 'brackets');
      await settled(page);
      // narrow screens show one bracket at a time
      const which = page.getByRole('radiogroup', { name: 'Which bracket' });
      const ship = page.locator('section', { has: heading(page, FEATURE.bracket) }).first();
      if (await which.count()) await which.getByRole('radio', { name: 'the ’ship' }).click();
      await ship.getByRole('button', { name: 'sim it' }).click();
      await expect(ship.locator('.br-champ[data-state="crowned"]')).toBeVisible();
      await expect(ship.locator('.br-champ-label')).toHaveText('league champ');
      await expect(ship.locator('.br-champ-name')).not.toHaveText('');

      if (await which.count()) await which.getByRole('radio', { name: LOSERS_COPY.toilet.name }).click();
      const toilet = page.locator('section', { has: heading(page, LOSERS_COPY.toilet.name) }).first();
      await toilet.getByRole('button', { name: 'sim it' }).click();
      await expect(toilet.locator('.br-champ[data-state="crowned"]')).toBeVisible();
      await expect(toilet.locator('.br-champ-label')).toHaveText(LOSERS_COPY.toilet.champ);
    });

    test('draft room: every tab; the replay of the saved draft advances pick by pick', async ({ app: page }) => {
      await page.goto(`/#${PAGES.draft.path}`);
      await expectRows(table(page, /draft rankings/i), 25, 'draft rankings');

      await openTab(page, TABS.draft, FEATURE.mock);
      await expect(page).toHaveURL(/tab=mock/);
      await expect(heading(page, 'best available')).toBeVisible();
      await expect(table(page, /mock draft board/i)).toBeVisible();

      await openTab(page, TABS.draft, FEATURE.onTheClock);
      await expect(page).toHaveURL(/tab=clock/);
      await page.getByRole('button', { name: /replay your draft/i }).click();
      const status = page.getByRole('status').filter({ hasText: /pick \d+ of \d+ made|waiting for the first pick|draft complete/ });
      await expect(status).toBeVisible();
      await control(page, 'step').click(); // manual stepping, so the count only moves when we say so
      const made = async () => Number(((await status.innerText()).match(/pick (\d+) of/) ?? [])[1] ?? 0);
      const before = await made();
      for (let i = 1; i <= 3; i++) {
        await page.getByRole('button', { name: 'next pick' }).click();
        await expect.poll(made, { message: `pick count after ${i} step(s)` }).toBe(before + i);
      }
      await expect(heading(page, 'best available')).toBeVisible();
      await page.getByRole('button', { name: 'exit replay' }).click();
      await expect(page.getByRole('button', { name: /replay your draft/i })).toBeVisible();
    });

    test('game day: "replay last week" moves the scoreboard and fills the drive chart', async ({ app: page, session }) => {
      test.setTimeout(90_000);
      /* The replay runs on Date.now (6 sim minutes per second, times the speed). The session freezes Date at the fixture moment,
         so nothing would move on its own: this test is the clock. Each step moves the frozen Date forward 4 s while the real
         timers (the 700 ms poll) keep running. At 8x that is 192 sim minutes a step, so last week plays out in a few steps. */
      const T0 = manifest.captured_at;
      const bigs = () => page.locator('.gd-big').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      try {
        await page.goto(`/#${PAGES.gameday.path}?week=${manifest.week}`);
        await expect(heading(page, FEATURE.mainEvent)).toBeVisible();
        const before = await bigs();
        expect(before.length, 'two sides in the main event').toBe(2);

        // the replay offer sits on a finished week: pick last week on the week picker
        await pickWeek(page, manifest.week - 1);
        await page.getByRole('button', { name: `replay week ${manifest.week - 1}` }).click();
        await expect(page.getByRole('group', { name: 'replay controls' })).toBeVisible();
        await expect(ticker(page).locator('.tk-tag').first(), 'the ticker says replay').toContainText('replay');
        await page.getByRole('radiogroup', { name: 'replay speed' }).getByRole('radio', { name: '8×' }).click();

        const again = page.getByRole('button', { name: 'play again' });
        let moved = false;
        for (let step = 1; step <= 30 && !(await again.isVisible()); step++) {
          await session.context.clock.setFixedTime(T0 + step * 4000);
          await page.waitForTimeout(800); // one 700 ms poll tick
          if (!moved) moved = (await bigs()).join('|') !== before.join('|');
        }
        await expect(again, 'the replay reaches the final whistle').toBeVisible();
        expect(moved, 'the scoreboard changed while the replay ran').toBe(true);
        const after = await bigs();

        // the final numbers are last week's real result
        const mine = myWeekPoints(manifest.week - 1);
        expect(after.map((l) => Number(l.match(/(\d+\.\d)$/)?.[1])), `one side is my week ${manifest.week - 1} score (${mine})`).toContain(Math.round(mine * 10) / 10);

        await openTab(page, TABS.gameday, FEATURE.driveChart);
        const feed = page.getByRole('list', { name: /scoring updates/i }).getByRole('listitem');
        expect(await feed.count(), 'the drive chart has entries').toBeGreaterThan(5);

        await page.getByRole('button', { name: 'stop replay' }).click();
        await expect(page.getByRole('button', { name: `replay week ${manifest.week - 1}` })).toBeVisible();
      } finally {
        await session.context.clock.setFixedTime(T0).catch(() => undefined);
      }
    });

    test('score ticker: my matchup is pinned first, then the league and the NFL; it folds away and stays folded after a reload', async ({ app: page }) => {
      await page.goto('/#/');
      await expect(page.getByRole('heading', { level: 1, name: PAGES.home.name })).toBeVisible();
      const bar = ticker(page);
      await expect(bar).toBeVisible();
      // my matchup is pinned at the left, ahead of the scrolling rotation
      const pin = bar.locator('a.tk-pin');
      await expect(pin, 'my matchup is pinned').toBeVisible();
      await expect(pin).toHaveAttribute('href', /#\/gameday\?m=\d+/);
      const teamName = (await page.locator('.tn-team').innerText()).trim().toLowerCase();
      expect((await pin.locator('.tk-team').first().innerText()).trim().toLowerCase(), 'the pin leads with my team').toBe(teamName);
      const box = async (l: Locator) => (await l.boundingBox())!;
      const firstItem = bar.locator('a.tk-item').first();
      expect((await box(pin)).x, 'pinned before the rotation').toBeLessThan((await box(firstItem)).x);
      // the rotation: the rest of the league (never my own matchup again), then the NFL, whose games open the nfl page's drawer
      const league = bar.getByRole('list', { name: 'your league scores' }).locator('a.tk-item');
      expect(await league.count(), 'other league matchups').toBeGreaterThan(3);
      await expect(league.first()).toHaveAttribute('href', /#\/gameday\?m=\d+/);
      await expect(bar.locator('a.tk-item[data-mine="true"]:not(.tk-game)'), 'my own matchup is not repeated in the rotation').toHaveCount(0);
      const nfl = bar.getByRole('list', { name: 'nfl scores' }).locator('a.tk-game');
      expect(await nfl.count(), 'NFL games').toBeGreaterThan(5);
      await expect(nfl.first()).toHaveAttribute('href', /#\/nfl\?game=/);

      try {
        await bar.getByRole('button', { name: 'hide scores' }).click();
        await expect(bar.getByRole('button', { name: /show scores/ })).toBeVisible();
        await expect(bar.locator('a.tk-item')).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('heading', { level: 1, name: PAGES.home.name })).toBeVisible();
        await expect(ticker(page).getByRole('button', { name: /show scores/ }), 'still folded after a reload').toBeVisible();
        await page.goto(`/#${PAGES.takes.path}`);
        await expect(ticker(page).getByRole('button', { name: /show scores/ }), 'still folded on another page').toBeVisible();
      } finally {
        const open = ticker(page).getByRole('button', { name: /show scores/ });
        if (await open.isVisible()) await open.click();
      }
      await expect(ticker(page).getByRole('button', { name: 'hide scores' })).toBeVisible();
    });

    test('navigation: section tabs under the team header (phone: a bottom tab bar and a "more" sheet), and under the hood in the footer', async ({ app: page, session }) => {
      await page.goto('/#/');
      const primary = page.getByRole('navigation', { name: 'Primary' });
      const clean = (t: string) => t.replace(/\s*\((live|up front:[^)]*)\)/g, '').replace(/\s+/g, ' ').trim();
      const name = (k: PageKey) => PAGES[k].name;
      await expect(page.locator('.tn-team'), 'the big team name').not.toHaveText('');
      // smart order is off for the tests (e2e/session.ts), so the tabs keep the fixed order of names.ts
      const atFixture: PageKey[] = [...NAV_KEYS];

      if (session.project === 'phone') {
        // the iOS pattern: huddle and the next three sections in that order, then "more"
        const bar = page.locator('nav.tabbar');
        await expect(bar).toBeVisible();
        await expect(primary.getByRole('link'), 'four sections and "more"').toHaveCount(4);
        for (const [i, k] of atFixture.slice(0, 4).entries()) {
          await expect(primary.getByRole('link').nth(i), `tab bar slot ${i + 1}`).toHaveAccessibleName(new RegExp(`^${escapeRe(name(k))}( \\(|$)`));
        }
        await expect(primary.getByRole('link', { name: name('home') })).toHaveAttribute('aria-current', 'page');
        // "more" opens a sheet with every section in the same order, and under the hood last
        await showNav(page, 'phone');
        const sheet = page.getByRole('dialog', { name: 'more' });
        const all = sheet.getByRole('navigation', { name: 'All sections' }).getByRole('link');
        expect((await all.allInnerTexts()).map(clean)).toEqual([...atFixture, ...FOOTER_KEYS].map(name));
        await expect(sheet.getByRole('button', { name: /^appearance:/ }).or(sheet.getByRole('radio', { name: /dark/i })).first(), 'the appearance control lives in the sheet').toBeVisible();
        // a section outside the four opens from the sheet and closes it
        await sheet.getByRole('link', { name: name('trades') }).click();
        await expect(page.getByRole('heading', { level: 1, name: name('trades') })).toBeVisible();
        await expect(sheet).toHaveCount(0);
        await expect(primary.getByRole('button', { name: 'more' }), 'a section outside the four lights "more"').toHaveAttribute('data-active', 'true');
        await primary.getByRole('link', { name: name('home') }).click();
        await expect(page.getByRole('heading', { level: 1, name: name('home') })).toBeVisible();
        return;
      }

      const links = primary.getByRole('link');
      await expect(links).toHaveCount(NAV_KEYS.length);
      expect((await links.allInnerTexts()).map(clean)).toEqual(atFixture.map(name));
      await expect(links.filter({ hasText: /up front:/ }), 'nothing is promoted with smart order off').toHaveCount(0);
      await expect(primary.getByRole('link', { name: name('home'), exact: false }).first()).toHaveAttribute('aria-current', 'page');
      const footer = page.getByRole('navigation', { name: 'Reference' });
      for (const k of FOOTER_KEYS) await expect(footer.getByRole('link', { name: name(k), exact: true })).toBeVisible();
      await primary.getByRole('link', { name: name('gameday') }).click();
      await expect(page.getByRole('heading', { level: 1, name: name('gameday') })).toBeVisible();
      await expect(primary.getByRole('link', { name: name('gameday') })).toHaveAttribute('aria-current', 'page');
      await footer.getByRole('link', { name: name('method') }).click();
      await expect(page.getByRole('heading', { level: 1, name: name('method') })).toBeVisible();
    });

    test('smart nav order: the sections that matter now come up front, with a reason; "smart order: off" restores the fixed order', async ({ app: page, session }) => {
      const primary = page.getByRole('navigation', { name: 'Primary' });
      const slotName = (i: number) => primary.getByRole('link').nth(i);
      const savePref = async (smartNav: boolean) => {
        await page.evaluate((v) => {
          window.localStorage.setItem('wr.prefs.v1', JSON.stringify({ smartNav: v }));
          window.dispatchEvent(new Event('wr-prefs'));
        }, smartNav);
      };
      try {
        await page.goto('/#/');
        await expect(primary).toBeVisible();
        await savePref(true);
        // Friday evening (the fixture clock): lineup days, so the locker room and the waiver wire follow huddle
        await expect(slotName(1)).toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES.team.name)}`));
        await expect(slotName(2)).toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES.waivers.name)}`));
        await expect(slotName(0)).toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES.home.name)}`));

        // Tuesday 8 pm: waivers run overnight, so the waiver wire comes up front, with the reason
        await page.goto('/#/?now=2026-10-20T20:00');
        await expect(slotName(1), 'waiver wire is second on Tuesday night').toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES.waivers.name)}.*up front: waivers`));
        if (session.project !== 'phone') await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link').last()).toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES.settings.name)}`));

        // Sunday 1 pm: kickoff, so game day (and the nfl page) come up front
        await page.goto('/#/?now=2026-10-18T13:00');
        await expect(slotName(1), 'game day is second on Sunday at kickoff').toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES.gameday.name)}.*up front`));

        // the front office switch turns it off again, and the order goes back to names.ts
        await page.goto('/#/settings?now=live');
        await page.getByRole('radiogroup', { name: 'Smart order' }).getByRole('radio', { name: 'smart order: off' }).click();
        await page.goto('/#/?now=2026-10-20T20:00');
        await expect(slotName(1), 'back to the fixed second tab').toHaveAccessibleName(new RegExp(`^${escapeRe(PAGES[NAV_KEYS[1]!].name)}`));
        await expect(primary.getByRole('link').filter({ hasText: /up front:/ })).toHaveCount(0);
      } finally {
        await page.goto('/#/?now=live');
        await savePref(false);
      }
    });

    test('narrow and wide phones: no horizontal overflow at 320 px and 430 px on the key pages', async ({ app: page, session }) => {
      test.skip(session.project !== 'phone', 'phone widths only');
      const routes = ['/', PAGES.gameday.path, PAGES.team.path, `${PAGES.race.path}?tab=brackets`, PAGES.waivers.path, PAGES.nfl.path, PAGES.draft.path, PAGES.settings.path];
      const size = page.viewportSize()!;
      try {
        for (const width of [320, 430]) {
          await page.setViewportSize({ width, height: 812 });
          for (const path of routes) {
            await page.goto(`/#${path}`);
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await expect(ticker(page)).toBeVisible();
            await settled(page);
            const w = await measureOverflow(page);
            recordOverflow(`phone${width}`, fileSafe(path || 'home'), { path, scrollWidth: w.scrollWidth, innerWidth: w.innerWidth, ok: w.scrollWidth <= w.innerWidth + 1, ...(w.scrollWidth <= w.innerWidth + 1 ? {} : { offenders: w.offenders }) });
            expect.soft(w.scrollWidth <= w.innerWidth + 1, `${path} overflows at ${width} px: document ${w.scrollWidth}px wide. Widest elements outside a scroller: ${w.offenders.join('; ')}`).toBe(true);
          }
        }
      } finally {
        await page.setViewportSize(size);
      }
    });

    test('nfl page: a game opens in a drawer (?game=), and "nfl only" hides the fantasy sections and the live pill', async ({ app: page }) => {
      await page.goto(`/#${PAGES.nfl.path}`);
      await expect(gameCards(page).nth(9)).toBeVisible();
      const only = page.getByRole('button', { name: 'nfl only' });
      await expect(only).toHaveAttribute('aria-pressed', 'false');
      try {
        // a game opens in a drawer, and the URL carries it
        await gameCards(page).first().click();
        await expect(page).toHaveURL(/#\/nfl\?game=\w+/);
        const drawer = page.getByRole('dialog');
        await expect(drawer).toBeVisible();
        await expect(drawer.getByRole('heading', { name: /\bat\b/i }).first(), 'the matchup is the drawer title').toBeVisible();
        await expect(drawer.getByRole('heading', { name: 'by quarter' })).toBeVisible();
        await expect(drawer.getByRole('heading', { name: 'the fantasy mix' }), 'the fantasy sections show by default').toBeVisible();
        await drawer.getByRole('button', { name: 'close' }).click();
        await expect(drawer).toHaveCount(0);
        await expect(page).not.toHaveURL(/game=/);

        // a link straight to the drawer works too (the ticker's NFL games use it)
        await page.getByRole('region', { name: 'league scores' }).getByRole('list', { name: 'nfl scores' }).locator('a.tk-game').first().click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);

        // "nfl only": no owners, no your-players, no fantasy sections, and the preview pill steps aside
        await page.goto(`/#${PAGES.nfl.path}?now=2026-10-20T20:00`);
        await expect(page.locator('.la-head'), 'the preview pill shows on the nfl page').toBeVisible();
        await only.click();
        await expect(only).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.la-head'), 'nfl only hides the pill').toHaveCount(0);
        await gameCards(page).first().click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'by quarter' })).toBeVisible();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'the fantasy mix' }), 'no fantasy sections in nfl only').toHaveCount(0);
        await page.keyboard.press('Escape');
        // remembered on this device
        await page.reload();
        await expect(page.getByRole('button', { name: 'nfl only' })).toHaveAttribute('aria-pressed', 'true');
      } finally {
        await page.goto(`/#${PAGES.nfl.path}?now=live`);
        const btn = page.getByRole('button', { name: 'nfl only' });
        if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click();
        await expect(btn).toHaveAttribute('aria-pressed', 'false');
      }
    });

    test('moments: previewing a Tuesday 8 pm (?now=) shows the waivers pill and the waiver wire banner; ?now=live clears them', async ({ app: page }) => {
      try {
        await page.goto(`/#/?now=2026-10-20T20:00`);
        // a fresh load with the preview in the URL: the way a person opens a shared preview link. (Switching to a preview from inside
        // a session that has already been around the app, e.g. after /takes, shows the banner and hero but not the pill: reported.)
        await page.reload();
        await expect(page.getByRole('heading', { level: 1, name: PAGES.home.name })).toBeVisible();
        const pill = page.locator('.la-head');
        await expect(pill, 'the live activity pill').toBeVisible();
        await expect(pill, 'a countdown to the waiver run').toContainText(/^waivers (in )?\d+h/);
        await expect(page.locator('.la-tag'), 'it says it is a preview').toHaveText('preview');
        // the card opens from the pill and folds back with Escape
        await pill.click();
        await expect(pill).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('.la-panel')).toBeVisible();
        await expect(page.locator('.la-go')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(pill).toHaveAttribute('aria-expanded', 'false');

        // the preview clock follows you to other pages, and the waiver wire gets its banner
        await page.goto(`/#${PAGES.waivers.path}`);
        await expect(page.getByRole('heading', { level: 1, name: PAGES.waivers.name })).toBeVisible();
        const banner = page.getByRole('complementary', { name: 'right now' });
        await expect(banner, 'the moment banner on the waiver wire').toBeVisible();
        await expect(banner).toContainText(/waivers process/i);
        await expect(banner).toContainText(/\d+h .*left|\d+m .*left/);
        await expect(pill, 'the pill is still there').toBeVisible();
        // the pill can be dismissed
        await page.getByRole('button', { name: /^dismiss/ }).click();
        await expect(pill).toHaveCount(0);
      } finally {
        await page.goto(`/#/?now=live`);
      }
      await expect(page.locator('.la-head'), 'back on the real clock the pill is gone').toHaveCount(0);
      await expect(page.locator('.la-tag')).toHaveCount(0);
    });

    test('huddle: the hero is a sentence about my week, with both teams, and a game plan under it', async ({ app: page }) => {
      await page.goto('/#/');
      const hero = page.getByRole('region', { name: 'this week in a sentence' });
      await expect(hero).toBeVisible();
      const line = (await hero.locator('.hero-line').innerText()).toLowerCase();
      const team = (await page.locator('.tn-team').innerText()).trim().toLowerCase();
      expect(line, 'the sentence names my team').toContain(team);
      expect(line.split(/\s+/).length, 'a sentence, not a label').toBeGreaterThan(5);
      await expect(hero).toContainText(/\d+% to win|every 100/);
      await expect(heading(page, 'your game plan')).toBeVisible();
    });

    test('dark mode: the appearance switch (light, dark, auto) sets data-theme, and the key pages pass axe in the dark', async ({ app: page, session }) => {
      await page.goto('/#/');
      const html = page.locator('html');
      // on a phone the switch is in the "more" sheet
      const choose = async (label: 'light' | 'dark' | 'auto') => {
        await showNav(page, session.project);
        const radio = page.getByRole('radiogroup', { name: 'Appearance' }).first().getByRole('radio', { name: label });
        await radio.click();
        await expect(radio).toBeChecked();
        if (session.project === 'phone') await page.keyboard.press('Escape');
      };
      try {
        await choose('light');
        await expect(html).toHaveAttribute('data-theme', 'light');
        await choose('dark');
        await expect(html).toHaveAttribute('data-theme', 'dark');
        // the colours ease over (a transition), so wait for the page background to settle on a dark one
        await expect.poll(async () => {
          const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
          return (bg.match(/\d+/g) ?? []).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
        }, { message: 'the page background is dark' }).toBeLessThan(80);
        // it is remembered across a reload
        await page.reload();
        await expect(html).toHaveAttribute('data-theme', 'dark');
        // axe, screenshots and overflow in the dark, on four key pages
        for (const [id, path] of [['huddle', '/'], ['locker-room', PAGES.team.path], ['playoff-picture', `${PAGES.race.path}?tab=brackets`], ['nfl', PAGES.nfl.path]] as const) {
          await page.goto(`/#${path}`);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(ticker(page)).toBeVisible();
          await record(page, session, `dark--${id}`, path);
        }
      } finally {
        await page.goto('/#/');
        await choose('auto').catch(() => undefined);
      }
      await expect(html, 'auto follows the system again').not.toHaveAttribute('data-theme', /.+/);
    });
  });

  test('axe: every allow-list entry still matches a violation', async ({ session }) => {
    test.skip(session.project !== 'desktop', 'axe runs at desktop width only');
    const axeFindings = writeAxeReport();
    const blocking = axeFindings.filter((f) => FAIL_IMPACTS.has(f.impact));
    console.log(`axe: ${axeFindings.length} violation group(s) across ${readdirSync(AXE_DIR).length} scanned states; ${blocking.length} serious/critical, ${blocking.filter(isAllowed).length} of them allow-listed.\n${summarize(axeFindings).join('\n')}\nfull report: e2e/results/axe-report.json`);
    const stale = ALLOWED_AXE.filter((a) => !axeFindings.some((f) => f.rule === a.rule && f.route === a.route));
    expect(stale, 'ALLOWED_AXE entries that no longer match any violation (delete them)').toEqual([]);
  });
});
