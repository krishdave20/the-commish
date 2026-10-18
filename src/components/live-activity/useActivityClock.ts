import { useEffect, useState } from 'react';
import { currentNow } from '../../app/moments/nowOverride';

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** The time, ticking each second, but only while the page is visible and `active` (nothing to count, nothing ticks). It catches up the
    moment the page becomes visible again. Reads the preview clock, so `?now=` countdowns run from the chosen moment. */
export function useActivityClock(active: boolean): number {
  const [now, setNow] = useState(() => currentNow());
  const [hidden, setHidden] = useState(isHidden);
  useEffect(() => {
    const on = () => { setHidden(isHidden()); setNow(currentNow()); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  useEffect(() => {
    if (!active || hidden) return;
    const id = setInterval(() => setNow(currentNow()), 1000);
    return () => clearInterval(id);
  }, [active, hidden]);
  return now;
}
