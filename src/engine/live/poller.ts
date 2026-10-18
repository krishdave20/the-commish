/* A small timer-driven poller: polls, schedules the next poll from the result, pauses while the tab is hidden, backs off
   after errors and stops when the plan says so. The same pattern as the draft room's usePickFeed, without React so it can be
   tested with fake timers. */
export const MAX_BACKOFF_MS = 2 * 60_000;

/** The wait before the next poll: the base interval, then doubling after each failure up to two minutes. */
export function backoffDelay(baseMs: number, failures: number): number {
  return failures <= 0 ? baseMs : Math.min(MAX_BACKOFF_MS, baseMs * 2 ** failures);
}

export interface PollerOpts<T> {
  poll: (manual: boolean) => Promise<T>;
  /** the wait before the next poll, or null to stop */
  next: (result: T) => number | null;
  onResult: (result: T) => void;
  onError: (e: unknown) => void;
  /** the wait after a first failure doubles from this */
  baseMs: number;
  isHidden?: () => boolean;
}

export interface Poller {
  start(): void;
  stop(): void;
  /** one poll now, whatever the timer is doing (a Refresh button); restarts the schedule */
  pollNow(): Promise<void>;
  readonly running: boolean;
}

const hiddenNow = () => typeof document !== 'undefined' && document.hidden;

export function createPoller<T>(o: PollerOpts<T>): Poller {
  const hidden = o.isHidden ?? hiddenNow;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = true, done = false, inflight = false, failures = 0;
  /** when the next poll is due (epoch ms); a hidden tab keeps no timer, so coming back checks this */
  let dueAt = 0;

  const clear = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  const schedule = (delay: number) => {
    clear();
    dueAt = Date.now() + delay;
    if (stopped || done || hidden()) return;
    timer = setTimeout(() => { timer = null; void tick(false); }, delay);
  };
  async function tick(manual: boolean): Promise<void> {
    if (inflight || (!manual && (stopped || done || hidden()))) return;
    inflight = true;
    let delay: number | null;
    try {
      const result = await o.poll(manual);
      if (stopped && !manual) return;
      failures = 0;
      o.onResult(result);
      delay = o.next(result);
    } catch (e) {
      failures++;
      o.onError(e);
      delay = backoffDelay(o.baseMs, failures);
    } finally {
      inflight = false;
    }
    if (delay === null) { done = true; clear(); return; }
    done = false;
    schedule(delay);
  }
  const onVisibility = () => {
    if (hidden()) { clear(); return; }
    if (stopped || done || inflight) return;
    clear();
    // back on screen: poll now if the next poll came due while it was away (a rest until the next kickoff may not have), else wait out the rest
    const left = dueAt - Date.now();
    if (left <= 0) void tick(false); else schedule(left);
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false; done = false; failures = 0;
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      if (!hidden()) void tick(false);
    },
    stop() {
      stopped = true;
      clear();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    },
    pollNow: () => { clear(); return tick(true); },
    get running() { return !stopped && !done; },
  };
}
