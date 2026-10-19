/* The service worker, built by vite-plugin-pwa (injectManifest, see vite.config.ts) into dist/sw.js. `self.__WB_MANIFEST` is replaced at build
   time with the list of built files and their hashes.

   - The app shell and every built asset are precached, so the app opens offline. A navigation (any path under the site) gets index.html: the
     router is a HashRouter, so the page is always the same document.
   - ./data/nflverse/*.json: stale-while-revalidate (instant, then refreshed for the next visit). Not precached: the nightly job writes it after the build.
   - Sleeper headshots: cache-first, capped. Fetched with CORS (Sleeper's CDN allows it) so the cache holds real responses, not opaque ones that
     count several megabytes of quota each.
   - Nothing else is touched. The Sleeper API in particular goes to the network (see swRoutes.ts).
   - A new worker waits until the page says SKIP_WAITING (the update prompt's "reload"), so a page never runs against assets that changed under it.
     The nightly deploy changes sw.js only when the build changed; the page checks for a new one on load, hourly and when it comes back to the front. */
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CACHE, HEADSHOT_LIMIT, NFLVERSE_LIMIT, SKIP_WAITING, isHeadshot, isNflverseJson } from './swRoutes';

/** The few parts of a service worker's global scope used here (the project's type libraries are the page's, not the worker's). */
interface Scope {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
  registration: { scope: string; showNotification: (title: string, options?: object) => Promise<void> };
  clients: {
    matchAll: (o: { type: 'window'; includeUncontrolled: boolean }) => Promise<Array<{ url: string; focus: () => Promise<unknown>; navigate?: (u: string) => Promise<unknown> }>>;
    openWindow: (u: string) => Promise<unknown>;
  };
  skipWaiting: () => Promise<void>;
  addEventListener: (type: string, listener: (e: never) => void) => void;
}
/** shadows the page-flavoured global `self`; the build looks for the literal text `self.__WB_MANIFEST` to inject the precache list */
declare const self: Scope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// the first install takes the open page over at once, so its headshots and nflverse reads are cached on the first visit (a later update waits for the prompt)
clientsClaim();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/data\//] }));

registerRoute(
  ({ url }) => isNflverseJson(url),
  new StaleWhileRevalidate({
    cacheName: CACHE.nflverse,
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ ...NFLVERSE_LIMIT, purgeOnQuotaError: true })],
  }),
);

const headshots = new CacheFirst({
  cacheName: CACHE.headshots,
  matchOptions: { ignoreVary: true },
  plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ ...HEADSHOT_LIMIT, purgeOnQuotaError: true })],
});
registerRoute(
  ({ url }) => isHeadshot(url),
  async ({ request, event }) => {
    try {
      return await headshots.handle({ request: new Request(request.url, { mode: 'cors', credentials: 'omit' }), event: event as never });
    } catch {
      return fetch(request); // CORS refused or the network is down: let the image behave as it would without a worker
    }
  },
);

self.addEventListener('message', (e: { data?: { type?: string } }) => {
  if (e.data?.type === SKIP_WAITING) void self.skipWaiting();
});

/** A tap on a local alert opens (or focuses) the app at the page the alert is about. */
self.addEventListener('notificationclick', (e: { notification: { close: () => void; data?: { to?: string } }; waitUntil: (p: Promise<unknown>) => void }) => {
  e.notification.close();
  const to = e.notification.data?.to;
  const target = `${self.registration.scope}${to ? `#${to}` : ''}`;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (all) => {
      const mine = all.find((c) => c.url.startsWith(self.registration.scope));
      if (mine) {
        await mine.focus();
        if (to && mine.navigate) await mine.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});
