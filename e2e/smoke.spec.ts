/* End-to-end smoke test: launches the built app (vite preview of dist/), checks in from the saved fixture, and visits every
   route at desktop and phone width. All network traffic is served from reference/fixture/ (see network.ts); a request
   that escapes, a console error or an uncaught exception fails the test that caused it.
   Per route: heading and document title (from src/app/names.ts), the score ticker, then each in-page tab or accordion the way a
   person opens it, with one meaningful element per tab. Every state gets a screenshot in e2e/results/screens/, the horizontal
   overflow check and (desktop only) an axe scan. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { FEATURE, FOOTER_KEYS, LOSERS_COPY, NAV_GROUPS, PAGES } from '../src/app/names.ts';
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
  waivers: 'Waiver wire sections', trades: 'Trade block sections', draft: 'Draft room section', gameday: 'league view',
};

const ROUTES: Route[] = [
  {
    id: 'huddle', path: '/', h1: PAGES.home.name, title: PAGES.home.name,
    states: [{
      id: 'default',
      run: async (page) => {
        // the headline strip replaced the odds and matchup cards
        const strip = page.getByRole('group', { name: 'your season' });
        await expect(strip).toBeVisible();
        await expect(strip).toContainText('playoff odds');
        await expect(strip).toContainText('this week’s matchup');
        await expect(heading(page, FEATURE.alerts)).toBeVisible();
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
      { id: 'game-balls', run: tab(TABS.gameday, FEATURE.gameBalls, async (page) => { await expect(heading(page, FEATURE.gameBalls)).toBeVisible(); }) },
      { id: 'drive-chart', run: tab(TABS.gameday, FEATURE.driveChart, async (page) => { await expect(heading(page, FEATURE.driveChart)).toBeVisible(); }) },
      { id: 'sideline', run: tab(TABS.gameday, FEATURE.sideline, async (page) => { await expect(heading(page, FEATURE.sideline)).toBeVisible(); }) },
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
    ],
  },
  {
    id: 'front-office', path: PAGES.settings.path, h1: PAGES.settings.name, title: PAGES.settings.name,
    states: [
      { id: 'default', run: async (page) => { await expect(heading(page, 'linked accounts')).toBeVisible(); } },
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

const ticker = (page: Page) => page.getByRole('region', { name: 'league scores' });
const fileSafe = (s: string) => s.replace(/[^a-z0-9-]+/gi, '-');

/** the screenshot, the horizontal overflow check and (desktop) the axe scan for the state the page is in */
async function record(page: Page, session: { project: string }, key: string, path: string) {
  await settled(page);
  mkdirSync(SCREENS_DIR, { recursive: true });
  await page.screenshot({ path: resolve(SCREENS_DIR, `${session.project}-${fileSafe(key)}.png`), fullPage: true });

  // no horizontal page scroll at any width
  const w = await page.evaluate(() => {
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
      /* The replay runs on Date.now (6 sim minutes per second, times the speed). The session freezes Date at the fixture moment,
         so nothing would move on its own: this test is the clock. Each step moves the frozen Date forward 4 s while the real
         timers (the 700 ms poll) keep running. At 8x that is 192 sim minutes a step, so last week plays out in a few steps. */
      const T0 = manifest.captured_at;
      const bigs = () => page.locator('.gd-big').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      try {
        await page.goto(`/#${PAGES.gameday.path}`);
        await expect(heading(page, FEATURE.mainEvent)).toBeVisible();
        const before = await bigs();
        expect(before.length, 'two sides in the main event').toBe(2);

        await page.getByRole('button', { name: /^replay week \d+$/ }).click();
        await expect(page.getByRole('group', { name: 'replay controls' })).toBeVisible();
        await expect(ticker(page).locator('.tk-tag'), 'the ticker says replay').toContainText('replay');
        await page.getByRole('radiogroup', { name: 'replay speed' }).getByRole('radio', { name: '8×' }).click();

        const again = page.getByRole('button', { name: 'play again' });
        let moved = false;
        for (let step = 1; step <= 80 && !(await again.isVisible()); step++) {
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
        await expect(page.getByRole('button', { name: /^replay week \d+$/ })).toBeVisible();
      } finally {
        await session.context.clock.setFixedTime(T0);
      }
    });

    test('score ticker: my matchup is first, it folds away and stays folded after a reload', async ({ app: page }) => {
      await page.goto('/#/');
      await expect(page.getByRole('heading', { level: 1, name: PAGES.home.name })).toBeVisible();
      const bar = ticker(page);
      await expect(bar).toBeVisible();
      const items = bar.locator('a.tk-item');
      await expect(items.first(), 'my matchup leads the ticker').toHaveAttribute('data-mine', 'true');
      await expect(bar.locator('a.tk-item[data-mine="true"]'), 'only my matchup is marked').toHaveCount(1);
      expect(await items.count(), 'every league matchup is on the ticker').toBeGreaterThan(3);
      await expect(items.first()).toHaveAttribute('href', /#\/gameday\?m=\d+/);

      try {
        await bar.getByRole('button', { name: 'hide scores' }).click();
        await expect(bar.getByRole('button', { name: /show scores/ })).toBeVisible();
        await expect(items).toHaveCount(0);
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

    test('navigation: the groups are this week, league, moves and players, with front office and under the hood at the bottom', async ({ app: page, session }) => {
      await page.goto('/#/');
      if (session.project === 'phone') await page.getByRole('button', { name: /^menu/ }).click();
      const primary = page.getByRole('navigation', { name: 'Primary' });
      for (const g of NAV_GROUPS) {
        await expect(primary.getByText(g.label, { exact: true }), `nav group "${g.label}"`).toBeVisible();
        for (const k of g.keys) await expect(primary.getByRole('link', { name: PAGES[k].name, exact: true }), `${PAGES[k].name} under ${g.label}`).toBeVisible();
      }
      const footer = page.getByRole('navigation', { name: 'Reference' });
      for (const k of FOOTER_KEYS) await expect(footer.getByRole('link', { name: PAGES[k].name, exact: true })).toBeVisible();
      // the groups are in order down the page
      const labels = await primary.locator('.nav-label').allInnerTexts();
      expect(labels.map((l) => l.trim())).toEqual(NAV_GROUPS.map((g) => g.label));
      await primary.getByRole('link', { name: PAGES.gameday.name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: PAGES.gameday.name })).toBeVisible();
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
