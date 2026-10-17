/* Keeps us far under Sleeper's guidance (1,000 calls/min): at most 8 in flight and 300 per rolling
   minute. Every network call goes through one shared limiter. No DOM: Node scripts use it too. */

export interface LimiterOpts {
  maxInFlight?: number;
  perMinute?: number;
  now?: () => number;
}
export interface Limiter {
  run<T>(fn: () => Promise<T>): Promise<T>;
  stats(): { inFlight: number; queued: number; lastMinute: number };
}

const WINDOW_MS = 60_000;

export function createLimiter(opts: LimiterOpts = {}): Limiter {
  const maxInFlight = opts.maxInFlight ?? 8;
  const perMinute = opts.perMinute ?? 300;
  const now = opts.now ?? Date.now;
  const starts: number[] = [];
  const queue: Array<() => void> = [];
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const prune = () => {
    const cutoff = now() - WINDOW_MS;
    while (starts.length && starts[0] <= cutoff) starts.shift();
  };

  const pump = () => {
    while (queue.length && inFlight < maxInFlight) {
      prune();
      if (starts.length >= perMinute) {
        // wait until the oldest start leaves the window, then try again
        if (!timer) {
          timer = setTimeout(() => { timer = null; pump(); }, Math.max(1, starts[0] + WINDOW_MS - now() + 1));
        }
        return;
      }
      starts.push(now());
      inFlight++;
      queue.shift()!();
    }
  };

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          let p: Promise<T>;
          try { p = fn(); } catch (e) { p = Promise.reject(e); }
          p.then(resolve, reject).finally(() => { inFlight--; pump(); });
        });
        pump();
      });
    },
    stats() {
      prune();
      return { inFlight, queued: queue.length, lastMinute: starts.length };
    },
  };
}
