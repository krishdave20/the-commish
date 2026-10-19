/* Which requests the service worker may keep, as plain functions of a URL (so a test can pin them down without a worker). sw.ts registers
   exactly these. Everything else goes straight to the network: above all the Sleeper API, whose offline copy is the app's own IndexedDB
   cache with its "data as of" stamps (a second copy in the worker would not know how stale it is, and could not say so). */

/** The nightly nflverse job's JSON (./data/nflverse/*.json, same origin as the page). Written after the build, so it is never in the precache. */
export function isNflverseJson(url: URL): boolean {
  return /\/data\/nflverse\/[^/]+\.json$/.test(url.pathname);
}

/** Sleeper player headshots (the thumbs the Avatar draws). Cross-origin images on Sleeper's CDN. */
export function isHeadshot(url: URL): boolean {
  return (url.hostname === 'sleepercdn.com' || url.hostname.endsWith('.sleepercdn.com')) && /^\/content\/nfl\/players\//.test(url.pathname);
}

/** The Sleeper API hosts. Never cached here; kept as a function so the "never" is tested. */
export function isSleeperApi(url: URL): boolean {
  return url.hostname === 'api.sleeper.app' || url.hostname === 'api.sleeper.com';
}

/** Cache names. The version in the name is bumped when a cache's content rules change; an old cache is deleted on activate. */
export const CACHE = { nflverse: 'commish-nflverse-v1', headshots: 'commish-headshots-v1' } as const;

/** The headshot cache holds at most this many images (a thumb is about 20 KB), for 30 days. */
export const HEADSHOT_LIMIT = { maxEntries: 300, maxAgeSeconds: 30 * 24 * 3600 } as const;
export const NFLVERSE_LIMIT = { maxEntries: 24, maxAgeSeconds: 30 * 24 * 3600 } as const;

/** The message the page sends to a waiting worker to take over (the "reload" button of the update prompt). */
export const SKIP_WAITING = 'SKIP_WAITING';
