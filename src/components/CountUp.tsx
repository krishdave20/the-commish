import { useEffect, useRef, useState } from 'react';

function motionOk(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

interface Props {
  value: number;
  decimals?: number;
  /** ms; default 550 */
  duration?: number;
}

/** A number that counts up to its value in 550 ms (the longest duration in the app). With reduced motion (or no matchMedia) it just shows the value. */
export function CountUp({ value, decimals = 0, duration = 550 }: Props) {
  const [shown, setShown] = useState<number | null>(() => (motionOk() ? 0 : null));
  // where the last run ended up, so a new value counts on from what is on screen instead of from zero
  const from = useRef(motionOk() ? 0 : value);

  useEffect(() => {
    if (!motionOk()) { from.current = value; return; }
    let raf = 0;
    const start = from.current;
    const t0 = performance.now();
    const tick = (t: number) => {
      // the frame time can be a hair before t0, so keep p inside 0 to 1
      const p = Math.max(0, Math.min(1, (t - t0) / duration));
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        from.current = start + (value - start) * eased;
        setShown(from.current);
        raf = requestAnimationFrame(tick);
      } else {
        from.current = value;
        setShown(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="num">{(shown ?? value).toFixed(decimals)}</span>;
}
