import { useSyncExternalStore } from 'react';

/** Phones and anything touch-first: the sizes that need 40px tap targets. Matches the CSS media queries in components.css. */
export const TOUCH_QUERY = '(max-width: 760px), (pointer: coarse)';

/** Whether a media query matches now, and again when it changes. False where the browser cannot say (jsdom, server). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}
