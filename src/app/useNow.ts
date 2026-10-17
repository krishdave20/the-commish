import { useEffect, useState } from 'react';

/** The current time, refreshed every `everyMs` (a minute by default). It never animates, so reduced motion is respected. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/** "3d 4h 12m", "4h 12m", "12m" or "under a minute" for a span in ms. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  if (total < 1) return 'under a minute';
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
