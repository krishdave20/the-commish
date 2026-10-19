import { useEffect, useState } from 'react';
import { useLiveMaybe } from '../../app/live/liveContext';
import { useTickerCollapsed } from './useTickerPref';

const SEEN_KEY = 'wr.ticker.seen.v1';
/** How long the shell holds the ticker's space open while the first live snapshot is on its way. */
const HOLD_MS = 6000;

function wasSeen(): boolean {
  try { return window.localStorage.getItem(SEEN_KEY) === 'on'; } catch { return false; }
}
function remember(on: boolean): void {
  try { window.localStorage.setItem(SEEN_KEY, on ? 'on' : 'off'); } catch { /* not saved: the next visit just does not hold the space */ }
}

/** What the shell needs to size itself: whether the ticker is on screen, whether it is folded, and `hold`: it was there last time and its
    data has not landed yet, so its band is kept (empty) instead of letting the whole page jump down when it arrives. */
export function useTickerMode(): 'off' | 'on' | 'collapsed' | 'hold' {
  const live = useLiveMaybe();
  const [collapsed] = useTickerCollapsed();
  const [gaveUp, setGaveUp] = useState(false);
  const ready = !!live && live.available && !!live.view && live.view.matchups.length > 0;
  const resolved = !!live && live.available && !live.loading;
  useEffect(() => { if (ready || resolved) remember(ready); }, [ready, resolved]);
  useEffect(() => {
    const t = window.setTimeout(() => setGaveUp(true), HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);
  if (!ready) return !resolved && !gaveUp && wasSeen() ? 'hold' : 'off';
  return collapsed ? 'collapsed' : 'on';
}
