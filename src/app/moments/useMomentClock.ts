import { useEffect, useState } from 'react';
import { NOW_EVENT, applyNowParam, currentNow, nowParamFromLocation } from './nowOverride';

/** The moments' clock: the real time, or the `?now=` preview time running on, refreshed every `everyMs` and whenever the preview changes.
    The first render picks up a `?now=` that came with the page load. */
export function useMomentClock(everyMs = 30_000): number {
  const [now, setNow] = useState(() => { applyNowParam(nowParamFromLocation(), false); return currentNow(); });
  useEffect(() => {
    const tick = () => setNow(currentNow());
    const id = setInterval(tick, everyMs);
    window.addEventListener(NOW_EVENT, tick);
    return () => { clearInterval(id); window.removeEventListener(NOW_EVENT, tick); };
  }, [everyMs]);
  return now;
}
