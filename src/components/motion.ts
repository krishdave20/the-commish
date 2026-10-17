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
