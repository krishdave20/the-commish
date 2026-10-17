import { useCallback, useEffect, useReducer, useRef } from 'react';
import { INITIAL_FEED, LIVE_INTERVAL_MS, feedReducer, nextDelay } from './pickFeed';
import type { FeedState, PickSource } from './pickFeed';

interface Opts {
  /** null follows nothing */
  source: PickSource | null;
  /** base wait between polls (default 4 s) */
  intervalMs?: number;
  /** false polls only when pollNow() is called (a replay in step mode) */
  auto?: boolean;
  /** poll once right away (default true); a replay waits one interval for its first pick */
  immediate?: boolean;
}

export interface PickFeed {
  state: FeedState;
  /** one poll now, whatever the timer is doing */
  pollNow: () => Promise<void>;
}

const isHidden = () => typeof document !== 'undefined' && document.hidden;

/** Runs a PickSource on a timer: polls every `intervalMs`, waits while the tab is hidden, backs off on errors (8 s, 16 s,
    30 s at most) and stops once the source says the draft is complete. */
export function usePickFeed({ source, intervalMs = LIVE_INTERVAL_MS, auto = true, immediate = true }: Opts): PickFeed {
  const [state, dispatch] = useReducer(feedReducer, INITIAL_FEED);
  const pollRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // a new source starts from nothing; a change of speed does not
  useEffect(() => { dispatch({ type: 'reset' }); }, [source]);

  useEffect(() => {
    if (!source) { pollRef.current = () => Promise.resolve(); return; }
    let cancelled = false, inflight = false, done = false, failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    const schedule = (delay: number) => {
      clear();
      if (cancelled || done || !auto || isHidden()) return;
      timer = setTimeout(() => { timer = null; void tick(); }, delay);
    };
    async function tick(manual = false): Promise<void> {
      if (cancelled || done || inflight || (!manual && isHidden())) return;
      inflight = true;
      try {
        const result = await source!.poll();
        if (cancelled) return;
        failures = 0;
        if (result.complete) done = true;
        dispatch({ type: 'polled', result, at: Date.now() });
      } catch (e) {
        if (cancelled) return;
        failures++;
        dispatch({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
      } finally {
        inflight = false;
      }
      schedule(nextDelay(intervalMs, failures));
    }
    pollRef.current = () => tick(true);

    const onVisibility = () => {
      if (isHidden()) clear();
      else if (auto && !done && !inflight) { clear(); void tick(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (immediate) void tick(); else schedule(intervalMs);

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [source, intervalMs, auto, immediate]);

  const pollNow = useCallback(() => pollRef.current(), []);
  return { state, pollNow };
}
