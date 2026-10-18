/* End-to-end smoke test: launches the built app (vite preview of dist/), checks in from the saved fixture, and visits every
   route at desktop and phone width. All network traffic is served from reference/fixture/ (see network.ts); a request
   that escapes, a console error or an uncaught exception fails the test that caused it.
   Per route: heading and document title (from src/app/names.ts), one meaningful element, a screenshot in
   e2e/results/screens/, the phone-width overflow check and (desktop only) an axe scan. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { FEATURE, LOSERS_COPY, PAGES } from '../src/app/names.ts';
import { ALLOWED_AXE, FAIL_IMPACTS, isAllowed, scan, summarize, type AxeFinding } from './axe.ts';
import { manifest, pickPlayerWithUsage } from './fixture.ts';
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

interface Route {
  id: string;
  /** hash route, e.g. /draft?tab=mock */
  path: string;
  /** the h1 (lowercase, from names.ts) */
  h1: string;
  /** the document title starts with this */
  title: string;
  /** one meaningful element for this route */
  check: (page: Page) => Promise<void>;
}

const ROUTES: Route[] = [
  {
    id: 'huddle', path: '/', h1: PAGES.home.name, title: PAGES.home.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.odds)).toBeVisible();
      await expect(heading(page, FEATURE.matchup)).toBeVisible();
      await expect(rowsOf(table(page, /standings/i))).toHaveCount(12);
    },
  },
  {
    id: 'huddle-offseason', path: '/?phase=offseason', h1: PAGES.home.name, title: PAGES.home.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.movers)).toBeVisible();
      await expect(heading(page, FEATURE.rookies)).toBeVisible();
      await expect(heading(page, FEATURE.ageProfile)).toBeVisible();
    },
  },
  {
    id: 'huddle-pre-draft', path: '/?phase=pre_draft', h1: PAGES.home.name, title: PAGES.home.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.countdown)).toBeVisible();
      await expect(heading(page, FEATURE.prep)).toBeVisible();
    },
  },
  {
    id: 'hot-takes', path: PAGES.takes.path, h1: PAGES.takes.name, title: PAGES.takes.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.takesFeed)).toBeVisible();
      await expect(page.locator('article.take-card').first(), 'at least one take card').toBeVisible();
    },
  },
  {
    id: 'scouting-report', path: PAGES.players.path, h1: PAGES.players.name, title: PAGES.players.name,
    check: async (page) => {
      await expect(page.getByText(/[\d,]+ players on file/)).toBeVisible();
      await page.getByRole('searchbox').or(page.getByLabel(/search players/i)).first().fill(player.name.split(' ').slice(-1)[0]);
      await expect(page.getByRole('link', { name: player.name, exact: false }).first()).toBeVisible();
    },
  },
  {
    id: 'player-profile', path: `/players/${player.pid}`, h1: player.name.toLowerCase(), title: player.name.toLowerCase(),
    check: async (page) => {
      // the usage panel needs the nightly nflverse data (served from reference/fixture/nflverse/)
      await expect(heading(page, 'usage trends')).toBeVisible();
      await expect(rowsOf(table(page, /season usage/i))).not.toHaveCount(0);
      await expect(heading(page, 'game log')).toBeVisible();
    },
  },
  {
    id: 'locker-room', path: PAGES.team.path, h1: PAGES.team.name, title: PAGES.team.name,
    check: async (page) => {
      await expectRows(table(page, /^roster$/i).first(), 6, 'roster');
      await expect(table(page, /lineup for week/i)).toBeVisible();
    },
  },
  {
    id: 'playoff-picture', path: PAGES.race.path, h1: PAGES.race.name, title: PAGES.race.name,
    check: async (page) => {
      await expect(rowsOf(table(page, /playoff picture standings/i))).toHaveCount(12);
      await expect(heading(page, FEATURE.bracket)).toBeVisible();
    },
  },
  {
    id: 'waiver-wire', path: PAGES.waivers.path, h1: PAGES.waivers.name, title: PAGES.waivers.name,
    check: async (page) => {
      await expectRows(table(page, /^waiver wire$/i), 1, 'waiver wire');
    },
  },
  {
    id: 'trade-block', path: PAGES.trades.path, h1: PAGES.trades.name, title: PAGES.trades.name,
    check: async (page) => {
      await expect(heading(page, 'the analyzer')).toBeVisible();
      await expect(heading(page, FEATURE.handshake)).toBeVisible();
    },
  },
  {
    id: 'draft-room-rankings', path: `${PAGES.draft.path}?tab=rankings`, h1: PAGES.draft.name, title: PAGES.draft.name,
    check: async (page) => {
      await expectRows(table(page, /draft rankings/i), 21, 'draft rankings');
    },
  },
  {
    id: 'draft-room-mock', path: `${PAGES.draft.path}?tab=mock`, h1: PAGES.draft.name, title: PAGES.draft.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.mock)).toBeVisible();
      await expect(table(page, /best available/i)).toBeVisible();
    },
  },
  {
    id: 'draft-room-on-the-clock', path: `${PAGES.draft.path}?tab=clock`, h1: PAGES.draft.name, title: PAGES.draft.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.onTheClock)).toBeVisible();
      await expect(page.getByRole('button', { name: /replay your draft/i })).toBeVisible();
    },
  },
  {
    id: 'front-office', path: PAGES.settings.path, h1: PAGES.settings.name, title: PAGES.settings.name,
    check: async (page) => {
      await expect(heading(page, FEATURE.injuryReport)).toBeVisible();
      await page.getByRole('button', { name: /run checks/i }).click();
      const report = table(page, /endpoint checks/i);
      await expect(report).toBeVisible();
      await expectRows(report, 26, 'injury report');
      // no endpoint is "out" against the fixture
      await expect(report.locator('[data-level="fail"]'), 'endpoints reported as out').toHaveCount(0);
      for (const id of ['winners bracket', 'losers bracket']) {
        await expect(report.getByRole('row', { name: new RegExp(id, 'i') }), `${id} row`).toBeVisible();
      }
    },
  },
  {
    id: 'under-the-hood', path: PAGES.method.path, h1: PAGES.method.name, title: PAGES.method.name,
    check: async (page) => {
      await expect(heading(page, 'where the data comes from')).toBeVisible();
      await expect(heading(page, 'clinch marks')).toBeVisible();
    },
  },
  {
    id: 'check-in', path: PAGES.signin.path, h1: PAGES.signin.name, title: PAGES.signin.name,
    check: async (page) => {
      await expect(heading(page, 'linked accounts')).toBeVisible();
      await expect(page.getByText(manifest.username, { exact: false }).first()).toBeVisible();
    },
  },
];

/* A failed test restarts the worker, so findings live on disk: one file per route in e2e/results/axe/, merged into
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

test.describe('smoke', () => {
  test('checks in from the fixture and lands on the huddle', async ({ page, session }) => {
    await signIn(page);
    session.signedIn = true;
    await expect(page.getByRole('navigation', { name: 'Primary' }).or(page.getByRole('button', { name: /menu/i })).first()).toBeAttached();
  });

  for (const r of ROUTES) {
    test(`route ${r.path} (${r.id})`, async ({ app: page, session }) => {
      await page.goto(`/#${r.path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(exactly(r.h1));
      const titleRe = new RegExp(`^${escapeRe(r.title)}`, 'i');
      await expect.soft(page).toHaveTitle(titleRe);
      await r.check(page);
      await settled(page);

      mkdirSync(SCREENS_DIR, { recursive: true });
      await page.screenshot({ path: resolve(SCREENS_DIR, `${session.project}-${r.id}.png`), fullPage: true });

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
      recordOverflow(session.project, r.id, { path: r.path, scrollWidth: w.scrollWidth, innerWidth: w.innerWidth, ok, ...(ok ? {} : { offenders: w.offenders }) });
      expect.soft(ok, `${r.path} overflows horizontally at ${session.project} width: document ${w.scrollWidth}px wide in a ${w.innerWidth}px window. Widest elements outside a scroller: ${w.offenders.join('; ')}`).toBe(true);

      if (session.project === 'desktop') {
        const found = await scan(page, r.id, r.path);
        writeFileSync(resolve(AXE_DIR, `${r.id}.json`), JSON.stringify(found, null, 2) + '\n');
        writeAxeReport();
        const failing = found.filter((f) => FAIL_IMPACTS.has(f.impact) && !isAllowed(f));
        expect(failing.map((f) => `${f.impact} ${f.rule} (${f.nodes.length} elements): ${f.help}\n    ${f.nodes.slice(0, 3).map((n) => n.target).join('\n    ')}`),
          `axe: serious/critical violations on ${r.path} (${r.id}) that are not in ALLOWED_AXE, or exceed its node count`).toEqual([]);
      }
    });
  }

  test.describe('interactions', () => {
    test('playoff machine: "you win out" puts a clinch mark on your team', async ({ app: page }) => {
      await page.goto(`/#${PAGES.race.path}`);
      const machine = page.getByRole('region', { name: FEATURE.machine }).or(page.locator('section', { has: heading(page, FEATURE.machine) })).first();
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

    test('brackets: "sim it" crowns a champ; the toilet bowl crowns a toilet bowl champ', async ({ app: page, session }) => {
      await page.goto(`/#${PAGES.race.path}`);
      await settled(page);
      const ship = page.locator('section', { has: heading(page, FEATURE.bracket) }).first();
      if (session.project === 'phone') await control(page, 'the ’ship').click(); // narrow screens show one bracket at a time
      await ship.getByRole('button', { name: 'sim it' }).click();
      await expect(ship.locator('.br-champ[data-state="crowned"]')).toBeVisible();
      await expect(ship.locator('.br-champ-label')).toHaveText('league champ');
      await expect(ship.locator('.br-champ-name')).not.toHaveText('');

      if (session.project === 'phone') await control(page, LOSERS_COPY.toilet.name).click();
      const toilet = page.locator('section', { has: heading(page, LOSERS_COPY.toilet.name) }).first();
      await toilet.getByRole('button', { name: 'sim it' }).click();
      await expect(toilet.locator('.br-champ[data-state="crowned"]')).toBeVisible();
      await expect(toilet.locator('.br-champ-label')).toHaveText(LOSERS_COPY.toilet.champ);
    });

    test('draft room: every tab; the replay of the saved draft advances pick by pick', async ({ app: page }) => {
      await page.goto(`/#${PAGES.draft.path}?tab=rankings`);
      await expect(table(page, /draft rankings/i)).toBeVisible();

      await control(page, FEATURE.mock).click();
      await expect(page).toHaveURL(/tab=mock/);
      await expect(heading(page, 'best available')).toBeVisible();
      await expect(table(page, /mock draft board/i)).toBeVisible();

      await control(page, FEATURE.onTheClock).click();
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
  });

  test('axe: every allow-list entry still matches a violation', async ({ session }) => {
    test.skip(session.project !== 'desktop', 'axe runs at desktop width only');
    const axeFindings = writeAxeReport();
    const blocking = axeFindings.filter((f) => FAIL_IMPACTS.has(f.impact));
    console.log(`axe: ${axeFindings.length} violation group(s) across ${ROUTES.length} routes; ${blocking.length} serious/critical, ${blocking.filter(isAllowed).length} of them allow-listed.\n${summarize(axeFindings).join('\n')}\nfull report: e2e/results/axe-report.json`);
    const stale = ALLOWED_AXE.filter((a) => !axeFindings.some((f) => f.rule === a.rule && f.route === a.route));
    expect(stale, 'ALLOWED_AXE entries that no longer match any violation (delete them)').toEqual([]);
  });
});
