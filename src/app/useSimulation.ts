import { useEffect, useState } from 'react';
import { cancelSim, runSimInWorker } from '../engine';
import type { SimInput, SimSummary } from '../engine';

/** `value` after it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (Object.is(v, value)) return;
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, v]);
  return v;
}

export interface Simulation {
  /** the latest finished run (may belong to an older input while a new one runs) */
  result: SimSummary | null;
  /** `result` belongs to the current `input` */
  fresh: boolean;
  running: boolean;
  /** 0 to 1 */
  frac: number;
}

/** Runs `input` off the main thread on a named channel after `delay` ms. A newer input cancels the older run;
    a cancelled run resolves null and is ignored. */
export function useSimulation(input: SimInput | null, channel: string, delay = 0): Simulation {
  const [done, setDone] = useState<{ input: SimInput | null; result: SimSummary | null }>({ input: null, result: null });
  const [frac, setFrac] = useState(0);

  useEffect(() => {
    if (!input) return;
    let alive = true;
    const t = setTimeout(() => {
      setFrac(0);
      runSimInWorker(input, (f) => { if (alive) setFrac(f); }, { channel }).then(
        (r) => { if (alive && r) setDone({ input, result: r }); },
        () => { /* a failed run leaves the previous result in place */ },
      );
    }, delay);
    return () => { alive = false; clearTimeout(t); cancelSim(channel); };
  }, [input, channel, delay]);

  return { result: done.result, fresh: input !== null && done.input === input, running: input !== null && done.input !== input, frac };
}
