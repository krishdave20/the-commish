/* One signed-in browser session per Playwright worker (= per project). Signing in pulls the whole league, so the route
   visits share a page the way a person moving through the app would, instead of re-pulling for every test.
   Every request, console error and page error is collected on the session; the `page` fixture clears the lists before
   each test and fails the test afterwards if any are left. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { PAGES } from '../src/app/names.ts';
import { manifest } from './fixture.ts';
import { clearCollected, collectedProblems, freezeTime, installNetwork, newCollected, watchPage, type Collected } from './network.ts';

export const RESULTS_DIR = resolve(import.meta.dirname, 'results');
export const SCREENS_DIR = resolve(RESULTS_DIR, 'screens');

export type Overflow = { path: string; scrollWidth: number; innerWidth: number; ok: boolean; offenders?: string[] };

/** One file per route (a failed test restarts the worker, so nothing may live only in memory), merged into
    e2e/results/overflow-<project>.json: route → document width vs window width. */
export function recordOverflow(project: string, id: string, o: Overflow): void {
  const dir = resolve(RESULTS_DIR, 'overflow');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${project}--${id}.json`), JSON.stringify(o) + '\n');
  const all: Record<string, Omit<Overflow, 'path'>> = {};
  for (const f of readdirSync(dir).filter((n) => n.startsWith(`${project}--`)).sort()) {
    const { path, ...rest } = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Overflow;
    all[path] = rest;
  }
  writeFileSync(resolve(RESULTS_DIR, `overflow-${project}.json`), JSON.stringify(all, null, 2) + '\n');
}

export interface Session {
  context: BrowserContext;
  page: Page;
  collected: Collected;
  project: string;
  signedIn: boolean;
}

/** Check in from the fixture: open the app, get sent to check in, type the fixture's username, keep only the fixture's
    league, save, and land on the huddle. The username and league id come from manifest.json. */
export async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page, 'a first visit with no account is sent to check in').toHaveURL(/#\/signin$/);
  await expect(page.getByRole('heading', { level: 1, name: PAGES.signin.name })).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(`^${PAGES.signin.name}`));
  await page.getByLabel('Sleeper username').fill(manifest.username);
  await page.getByRole('button', { name: 'Find my leagues' }).click();
  const choose = page.getByRole('heading', { name: 'Choose leagues to follow' });
  await expect(choose).toBeVisible();
  // exactly the fixture's league is offered; it starts ticked
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(1);
  await expect(boxes.first()).toBeChecked();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { level: 1, name: PAGES.home.name })).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(`^${PAGES.home.name}`));
}

export const test = base.extend<{ page: Page; app: Page }, { session: Session }>({
  session: [async ({ browser }, provide, workerInfo) => {
    const project = workerInfo.project.name;
    const { viewport, baseURL } = workerInfo.project.use;
    const context = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 900 }, baseURL, reducedMotion: 'reduce', serviceWorkers: 'block', timezoneId: 'America/New_York', locale: 'en-US' });
    const collected = newCollected();
    // Smart nav order (the sections that matter now come up front) is switched off for every test, so the tabs keep their fixed order.
    // One dedicated test turns it on. The init script only writes the pref when none is stored, so a test can change it.
    await context.addInitScript(() => {
      try { if (!window.localStorage.getItem('wr.prefs.v1')) window.localStorage.setItem('wr.prefs.v1', JSON.stringify({ smartNav: false })); } catch { /* storage blocked */ }
    });
    await installNetwork(context, collected);
    await freezeTime(context);
    const page = await context.newPage();
    watchPage(page, collected);
    const session: Session = { context, page, collected, project, signedIn: false };
    await provide(session);
    const empties = [...collected.servedEmpty.entries()].map(([k, v]) => `${k}: ${v.length} request(s)`);
    console.log(`[${project}] served from the fixture: ${collected.served.sleeper} sleeper, ${collected.served.fantasycalc} fantasycalc, ${collected.served.nflverse} nflverse, ${collected.served.headshots} headshots (placeholder png), ${collected.served.headshotsAborted} headshots aborted (monogram fallback).`
      + ` Documented empty answers: ${empties.length ? empties.join('; ') : 'none needed'}.`);
    await context.close();
  }, { scope: 'worker' }],

  page: async ({ session }, provide) => {
    clearCollected(session.collected);
    await provide(session.page);
    const problems = collectedProblems(session.collected);
    expect(problems, `Network escapes and console errors during this test (route, error and screenshot are in e2e/results/):\n${problems.join('\n')}`).toEqual([]);
  },

  /** The page, signed in (once per session; a worker restarted after a failure signs in again). */
  app: async ({ page, session }, provide) => {
    if (!session.signedIn) {
      await signIn(page);
      session.signedIn = true;
    }
    await provide(page);
  },
});

export { expect };
