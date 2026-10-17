import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { applyBaseSim, baseSimInput, createEngine } from '../engine';
import type { LoadProgress, Model } from '../engine';
import { useData } from './dataContext';
import { useActive } from './hooks';
import { sleeperLoader } from './loadModel';
import type { LoadModel } from './loadModel';
import { ModelContext } from './modelContext';
import type { ModelValue } from './modelContext';
import { useSimulation } from './useSimulation';

interface State {
  key: string | null;
  model: Model | null;
  asOf: number | null;
  stale: boolean;
  error: string | undefined;
  busy: boolean;
  progress: LoadProgress | null;
}

const EMPTY: State = { key: null, model: null, asOf: null, stale: false, error: undefined, busy: false, progress: null };

interface Props {
  children: ReactNode;
  /** tests inject a loader that returns a hand-built model */
  loadModel?: LoadModel;
}

/** Pulls the active league and builds the engine model. Rebuilds when the account or league changes. */
export function ModelProvider({ children, loadModel }: Props) {
  const { sleeper } = useData();
  const { data: active } = useActive();
  const loader = useMemo(() => loadModel ?? sleeperLoader(sleeper), [loadModel, sleeper]);
  const userId = active?.account.userId ?? null;
  const leagueId = active?.leagueId ?? null;
  const key = userId && leagueId ? `${userId}|${leagueId}` : null;
  const [st, setSt] = useState<State>(EMPTY);
  const seq = useRef(0);
  const invalidate = useCallback(() => { seq.current++; }, []);

  const start = useCallback((force: boolean): Promise<void> => {
    if (!key || !userId || !leagueId) return Promise.resolve();
    const mine = ++seq.current;
    const current = () => seq.current === mine;
    return loader({
      leagueId, userId, force,
      onProgress: (p) => {
        if (!current()) return;
        setSt((s) => (s.key === key ? { ...s, progress: p } : { ...EMPTY, key, busy: true, progress: p }));
      },
    }).then(
      (r) => {
        if (current()) setSt({ key, model: r.model, asOf: r.asOf, stale: r.stale, error: r.error, busy: false, progress: null });
      },
      (e: unknown) => {
        if (!current()) return;
        const msg = e instanceof Error ? e.message : String(e);
        setSt((s) => ({ ...(s.key === key ? s : EMPTY), key, error: msg, busy: false, progress: null }));
      },
    );
  }, [key, userId, leagueId, loader]);

  useEffect(() => {
    if (!key) return;
    void start(false);
    return invalidate;
  }, [key, start, invalidate]);

  const refresh = useCallback(() => {
    setSt((s) => (s.key === key ? { ...s, busy: true, error: undefined } : s));
    return start(true);
  }, [key, start]);

  const own = st.key === key ? st : EMPTY;

  // the first simulation runs in a worker on the base channel; a model built without it fills in its odds when it lands
  const baseInput = useMemo(() => (own.model ? baseSimInput(own.model) : null), [own.model]);
  const baseRun = useSimulation(baseInput, 'base');
  const baseSim = baseRun.fresh ? baseRun.result : null;
  const model = useMemo(
    () => (own.model && own.model.oddsPending && baseSim ? applyBaseSim(own.model, baseSim) : own.model),
    [own.model, baseSim],
  );
  const engine = useMemo(() => (model ? createEngine(model) : null), [model]);
  const value = useMemo<ModelValue>(() => ({
    model,
    engine,
    baseSim,
    asOf: own.asOf,
    stale: own.stale,
    fromCache: false,
    loading: key !== null && (st.key !== key || own.busy),
    progress: own.progress,
    error: own.error,
    refresh,
  }), [own, model, engine, baseSim, key, st.key, refresh]);

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}
