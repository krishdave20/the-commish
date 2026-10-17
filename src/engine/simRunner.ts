/* Run a simulation off the main thread.

   runSimInWorker(input, onProgress) starts a module Worker (sim.worker.ts). When `Worker` does not exist
   (Vitest, jsdom, old browsers) or cannot be created, it runs in time slices on the calling thread instead,
   yielding with setTimeout, so the result is identical.

   Stale runs: each call takes a token on its `channel` (default "scen"). Starting a new run on a channel
   cancels the previous one (the worker is terminated, or the sliced loop stops) and the older promise
   resolves `null`, exactly like the reference's simTokens. Always check for null. Use different channels
   for runs that must not cancel each other (e.g. "base" and "scen"). */
import { simulateChunked, type SimInput, type SimSummary } from './sim.ts';
import type { SimWorkerOut } from './sim.worker.ts';

const tokens = new Map<string, number>();
const cancels = new Map<string, () => void>();

export interface RunOpts {
  /** default "scen" */
  channel?: string;
  /** force the main-thread fallback (tests) */
  noWorker?: boolean;
}

/** Cancel whatever is running on a channel; its promise resolves null. */
export function cancelSim(channel = 'scen'): void {
  tokens.set(channel, (tokens.get(channel) ?? 0) + 1);
  cancels.get(channel)?.();
  cancels.delete(channel);
}

export function runSimInWorker(input: SimInput, onProgress?: (frac: number) => void, opts: RunOpts = {}): Promise<SimSummary | null> {
  const channel = opts.channel ?? 'scen';
  cancelSim(channel);
  const token = tokens.get(channel) ?? 0;
  const stale = () => tokens.get(channel) !== token;

  if (opts.noWorker || typeof Worker === 'undefined') {
    return simulateChunked(input, onProgress, { isStale: stale });
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return simulateChunked(input, onProgress, { isStale: stale });
  }
  return new Promise<SimSummary | null>((resolve) => {
    let settled = false;
    const finish = (v: SimSummary | null) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      if (cancels.get(channel) === cancel) cancels.delete(channel);
      resolve(v);
    };
    const cancel = () => finish(null);
    cancels.set(channel, cancel);
    worker.onmessage = (e: MessageEvent<SimWorkerOut>) => {
      if (stale()) { finish(null); return; }
      const m = e.data;
      if (m.type === 'progress') onProgress?.(m.frac);
      else if (m.type === 'done') { onProgress?.(1); finish(m.summary); }
      else if (m.type === 'error') {
        // the worker failed (CSP, bundler quirk): fall back to the main thread
        settled = true; worker.terminate();
        simulateChunked(input, onProgress, { isStale: stale }).then(resolve);
      }
    };
    worker.onerror = () => {
      if (settled) return;
      settled = true; worker.terminate();
      simulateChunked(input, onProgress, { isStale: stale }).then(resolve);
    };
    worker.postMessage({ type: 'run', input });
  });
}
