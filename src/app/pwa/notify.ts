/* Raising a notification. An installed iPhone app only allows `registration.showNotification` (a page-made `new Notification` throws there), so
   the worker's registration is used whenever there is one; `new Notification` is the fallback for a browser tab with no worker. */

export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/** The notification permission now, or 'unsupported' when the browser has no Notification API (iOS Safari outside an installed app). */
export function notificationPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' || p === 'denied' || p === 'default' ? p : 'default';
}

/** Asks the browser for permission. Call it only from a tap on the toggle: browsers refuse (or ignore) a prompt that no one asked for. */
export async function requestAlertPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    // old Safari takes a callback and returns nothing; the promise form is everywhere else
    await new Promise<void>((resolve) => {
      const r = Notification.requestPermission((_p) => resolve()) as Promise<NotificationPermission> | undefined;
      if (r && typeof r.then === 'function') r.then(() => resolve(), () => resolve());
    });
  } catch { /* fall through: read the permission as it is */ }
  return notificationPermission();
}

export interface Notice { title: string; body: string; /** dedupes on screen: a newer notice with the same tag replaces the older one */ tag: string; /** the page a tap opens, e.g. "/waivers" */ to: string }

function assetUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}${file}`, document.baseURI).href;
}

/** Shows the notice. Resolves to true when one was raised; never throws (a blocked notification is not an app error). */
export async function deliver(n: Notice): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;
  const options = { body: n.body, tag: n.tag, icon: assetUrl('icon-192.png'), badge: assetUrl('icon-192.png'), data: { to: n.to } };
  try {
    const reg = typeof navigator !== 'undefined' && navigator.serviceWorker ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(n.title, options);
      return true;
    }
    const note = new Notification(n.title, options);
    note.onclick = () => {
      window.focus();
      window.location.hash = n.to;
      note.close();
    };
    return true;
  } catch {
    return false;
  }
}
