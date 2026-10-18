import { useEffect } from 'react';

/** Boxes the page scrolls inside (wide tables, the bracket, the draft board, long pick lists, the drawer). */
export const SCROLL_REGIONS = '.tw, .picklist, .sugg, .drawer-body';

/** A scroller that nothing inside can focus cannot be scrolled from the keyboard. Make each box that actually overflows
    a labelled, focusable region (named by its table caption when it has one), and take that back when it stops overflowing. */
export function markScrollRegions(root: ParentNode = document): void {
  const regions = [...root.querySelectorAll<HTMLElement>(SCROLL_REGIONS)];
  const taken = new Map<string, number>();
  const unique = (name: string) => {
    const n = (taken.get(name) ?? 0) + 1;
    taken.set(name, n);
    return n === 1 ? name : `${name} ${n}`;
  };
  for (const el of regions) {
    const overflows = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    const mine = el.dataset.scrollRegion === 'true';
    if (overflows && (mine || (el.getAttribute('tabindex') === null && el.getAttribute('role') === null))) {
      // named by its table caption, else by the chart or bracket inside it; regions on one page must not share a name
      const base = el.dataset.scrollName
        || el.querySelector('caption')?.textContent?.trim()
        || el.querySelector('[aria-label]')?.getAttribute('aria-label')
        || 'scrollable content';
      el.dataset.scrollName = base;
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', unique(base));
      el.dataset.scrollRegion = 'true';
    } else if (!overflows && mine) {
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      delete el.dataset.scrollRegion;
      delete el.dataset.scrollName;
    }
  }
}

/** Keeps `markScrollRegions` current as the page changes size or content. */
export function useScrollRegions(): void {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => markScrollRegions());
    };
    run();
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(run);
    mo?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(frame);
      mo?.disconnect();
      window.removeEventListener('resize', run);
    };
  }, []);
}
