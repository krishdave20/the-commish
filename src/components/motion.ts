import { useEffect, useState, useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: no-preference)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.('change', cb);
  return () => mq.removeEventListener?.('change', cb);
}

function snapshot(): boolean {
  return !(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches);
}

/** True when the viewer asked for reduced motion (or the browser cannot say, as in jsdom): draw final values at once. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/** True only when the browser positively says the viewer asked for reduced motion. Unlike `useReducedMotion` this is false in jsdom,
    so it suits choices of default behaviour (a replay that starts by itself) rather than drawing of final values. */
export function useWantsReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/** False for the first frame and true after, so bars can grow from zero. Always true with reduced motion. */
export function useGrown(): boolean {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (reduced) return;
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [reduced]);
  return reduced || mounted;
}
