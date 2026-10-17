import { useEffect, useState } from 'react';

function motionOk(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

interface Props {
  value: number;
  decimals?: number;
  duration?: number;
}

/** A number that counts up to its value. With reduced motion (or no matchMedia) it just shows the value. */
export function CountUp({ value, decimals = 0, duration = 700 }: Props) {
  const [shown, setShown] = useState<number | null>(() => (motionOk() ? 0 : null));

  useEffect(() => {
    if (!motionOk()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setShown(value * eased);
        raf = requestAnimationFrame(tick);
      } else {
        setShown(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="num">{(shown ?? value).toFixed(decimals)}</span>;
}
