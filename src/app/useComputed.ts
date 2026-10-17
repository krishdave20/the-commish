import { useEffect, useState } from 'react';

function same(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
}

/** Runs a heavy synchronous computation after the next paint, so the page can show "working" first.
    `value` keeps the previous result while a new one is computed. Pass the inputs the computation reads as `deps`. */
export function useComputed<T>(compute: () => T, deps: readonly unknown[]): { value: T | null; pending: boolean } {
  const [tk, setTk] = useState<{ deps: readonly unknown[]; token: object }>({ deps, token: {} });
  let token = tk.token;
  if (!same(tk.deps, deps)) {
    const next = { deps, token: {} };
    setTk(next); // derived state: a new token whenever the inputs change
    token = next.token;
  }
  const [done, setDone] = useState<{ token: object | null; value: T | null }>({ token: null, value: null });
  useEffect(() => {
    const t = setTimeout(() => setDone({ token, value: compute() }), 0);
    return () => clearTimeout(t);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  return { value: done.value, pending: done.token !== token };
}
