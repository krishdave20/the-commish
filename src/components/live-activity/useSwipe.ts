import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type Swipe = 'left' | 'right' | 'up' | 'down';

/** A swipe is at least this far (px) and clearly along one axis. */
export const SWIPE_MIN = 48;

/** Which way a drag went, or null when it was too short or too diagonal to mean anything. */
export function swipeOf(dx: number, dy: number): Swipe | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_MIN || Math.abs(ax - ay) < Math.max(ax, ay) * 0.4) return null;
  return ax > ay ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
}

/** Pointer handlers that call `onSwipe` when a press on the element is dragged one way and let go (the release can land anywhere on the page).
    `swiped()` says whether the last press was a swipe, so a click that follows it can be ignored. */
export function useSwipe(enabled: boolean, onSwipe: (dir: Swipe) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const did = useRef(false);
  const cb = useRef(onSwipe);
  useEffect(() => { cb.current = onSwipe; });

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY };
    did.current = false;
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dir = swipeOf(ev.clientX - s.x, ev.clientY - s.y);
      if (dir) { did.current = true; cb.current(dir); }
    };
    const cancel = () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      start.current = null;
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }, [enabled]);

  /** True once after a swipe: the click that ends the same press should not act. */
  const swiped = useCallback(() => { const v = did.current; did.current = false; return v; }, []);
  return { onPointerDown, swiped };
}
