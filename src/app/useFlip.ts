import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useWantsReducedMotion } from '../components/motion';

/** How long after the page opens a reorder is just the page settling (moments arrive a moment after the data), and so is not animated. */
const SETTLE_MS = 4000;

/** Glides the children marked `data-flip="<id>"` from their old places to their new ones when `order` changes while the page is open.
    Nothing moves on the first paint or while the page is still settling, and nothing moves with reduced motion. */
export function useFlip(box: RefObject<HTMLElement | null>, order: string): void {
  const before = useRef<Map<string, DOMRect> | null>(null);
  const born = useRef(0);
  const reduced = useWantsReducedMotion();
  useLayoutEffect(() => {
    if (born.current === 0) born.current = performance.now();
    const el = box.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-flip]')];
    const next = new Map(items.map((i) => [i.dataset.flip!, i.getBoundingClientRect()] as const));
    const prev = before.current;
    before.current = next;
    const settled = typeof performance !== 'undefined' && performance.now() - born.current > SETTLE_MS;
    if (!prev || !settled || reduced) return;
    for (const i of items) {
      const was = prev.get(i.dataset.flip!);
      const now = next.get(i.dataset.flip!);
      if (!was || !now || typeof i.animate !== 'function') continue;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      i.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  }, [box, order, reduced]);
}
