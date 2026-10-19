import { useEffect, useState } from 'react';
import { currentNow } from '../../app/moments/nowOverride';

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** The time, ticking every `everyMs` (a second by default), but only while the page is visible and `active` (nothing to count, nothing ticks). It catches
    up the moment the page becomes visible again. Reads the preview clock, so `?now=` countdowns run from the chosen moment. */
export function useActivityClock(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => currentNow());
  const [hidden, setHidden] = useState(isHidden);
  useEffect(() => {
    const on = () => { setHidden(isHidden()); setNow(currentNow()); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  // the moment it starts running again the time is brought up to date, not left to the first tick
  const running = active && !hidden;
  const [was, setWas] = useState(running);
  if (running !== was) {
    setWas(running);
    if (running) setNow(currentNow());
  }
  useEffect(() => {
    if (!active || hidden) return;
    const id = setInterval(() => setNow(currentNow()), everyMs);
    return () => clearInterval(id);
  }, [active, hidden, everyMs]);
  return now;
}
