/* The smoke test's network layer. Every request is either
     - the app itself (localhost, passed through to `vite preview`),
     - a Sleeper / FantasyCalc API call, answered from reference/fixture/ by exact URL,
     - a same-origin ./data/nflverse/*.json call, answered from reference/fixture/nflverse/,
     - one of the documented EMPTY answers below, or
     - anything else: aborted and recorded as "escaped". The tests fail if that list is not empty. */
import type { BrowserContext, ConsoleMessage, Page, Route } from '@playwright/test';
import { bodyForUrl, manifest, nflverseBody } from './fixture.ts';

const API_HOSTS = new Set(['api.sleeper.app', 'api.fantasycalc.com']);

/** URLs the fixture never captured, answered with an empty 200 on purpose. Each entry says why. Review this list when the
    app starts requesting something new: a real capture (npm run fixture:capture -- --only ...) is better than an empty answer.
    `served` records which entries actually fired, and the run prints them. */
export const EMPTY_ANSWERS: Array<{ name: string; match: (u: URL) => boolean; body: string; why: string }> = [];

export interface Collected {
  /** requests that left the machine's allow-list: not localhost, not fixture-served, not a documented empty answer */
  escaped: string[];
  consoleErrors: string[];
  pageErrors: string[];
  /** requests answered by an EMPTY_ANSWERS entry, by name */
  servedEmpty: Map<string, string[]>;
  /** fixture-served counts, for the summary */
  served: { sleeper: number; fantasycalc: number; nflverse: number };
}

export const newCollected = (): Collected => ({
  escaped: [], consoleErrors: [], pageErrors: [], servedEmpty: new Map(), served: { sleeper: 0, fantasycalc: 0, nflverse: 0 },
});

export function clearCollected(c: Collected): void {
  c.escaped.length = 0;
  c.consoleErrors.length = 0;
  c.pageErrors.length = 0;
}

/** One readable message for the test failure: what escaped, what logged. */
export function collectedProblems(c: Collected): string[] {
  const out: string[] = [];
  if (c.escaped.length) out.push(`${c.escaped.length} request(s) escaped to the network (not in the fixture and not a documented empty answer):\n  ${[...new Set(c.escaped)].join('\n  ')}`);
  if (c.consoleErrors.length) out.push(`${c.consoleErrors.length} console error(s):\n  ${[...new Set(c.consoleErrors)].join('\n  ')}`);
  if (c.pageErrors.length) out.push(`${c.pageErrors.length} uncaught page error(s):\n  ${[...new Set(c.pageErrors)].join('\n  ')}`);
  return out;
}

const json = (body: string) => ({ status: 200, contentType: 'application/json; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body });

export async function installNetwork(context: BrowserContext, c: Collected): Promise<void> {
  await context.route('**/*', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    if (isLocal) {
      if (url.pathname.includes('/data/nflverse/')) {
        const file = url.pathname.split('/').pop() ?? '';
        const body = nflverseBody(file);
        if (body === null) {
          // an nflverse file the snapshot does not hold: a plain 404, which the app reads as "not available yet"
          c.escaped.push(`${req.method()} ${url.pathname} (not in reference/fixture/nflverse/)`);
          return route.fulfill({ status: 404, body: 'not found' });
        }
        c.served.nflverse++;
        return route.fulfill(json(body));
      }
      return route.continue();
    }

    if (API_HOSTS.has(url.hostname)) {
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      const body = bodyForUrl(req.url());
      if (body !== null) {
        c.served[url.hostname === 'api.sleeper.app' ? 'sleeper' : 'fantasycalc']++;
        return route.fulfill(json(body));
      }
      const empty = EMPTY_ANSWERS.find((e) => e.match(url));
      if (empty) {
        c.servedEmpty.set(empty.name, [...(c.servedEmpty.get(empty.name) ?? []), req.url()]);
        return route.fulfill(json(empty.body));
      }
    }
    c.escaped.push(`${req.method()} ${req.url()}`);
    return route.abort('blockedbyclient');
  });
}

/** Collects console errors and uncaught exceptions from a page. Aborted escapes also log "Failed to load resource";
    those are already counted as escaped, so they are not reported twice. */
export function watchPage(page: Page, c: Collected): void {
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/.test(text)) return;
    c.consoleErrors.push(`${text}${m.location().url ? ` (${m.location().url})` : ''}`);
  });
  page.on('pageerror', (e) => { c.pageErrors.push(e.stack ?? e.message); });
}

/** Freeze Date at the fixture's capture time so the phase, countdowns and "x days ago" text are the same every run. */
export async function freezeTime(context: BrowserContext): Promise<void> {
  await context.clock.setFixedTime(manifest.captured_at);
}
