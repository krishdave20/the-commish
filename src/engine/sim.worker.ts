/* Web Worker entry: runs one simulation and posts progress, then the summary.
   The caller (simRunner.ts) cancels a stale run by terminating the worker. */
import { createSim, type SimInput, type SimSummary } from './sim.ts';

export type SimWorkerIn = { type: 'run'; input: SimInput };
export type SimWorkerOut =
  | { type: 'progress'; frac: number }
  | { type: 'done'; summary: SimSummary }
  | { type: 'error'; message: string };

interface WorkerScope {
  onmessage: ((e: { data: SimWorkerIn }) => void) | null;
  postMessage(m: SimWorkerOut): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = (e) => {
  try {
    const sim = createSim(e.data.input);
    let last = Date.now();
    while (!sim.step(400)) {
      const t = Date.now();
      if (t - last > 50) { last = t; ctx.postMessage({ type: 'progress', frac: sim.done / Math.max(1, sim.total) }); }
    }
    ctx.postMessage({ type: 'done', summary: sim.summary() });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
