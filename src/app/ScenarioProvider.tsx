import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { emptyScenario, isScenarioActive } from '../engine';
import type { Scenario } from '../engine';
import { ScenarioContext, useModel } from './modelContext';
import type { ScenarioValue } from './modelContext';
import { useDebounced, useSimulation } from './useSimulation';

const scenarioKey = (leagueId: string) => `wr.scenario.${leagueId}`;

function loadScenario(leagueId: string): Scenario {
  try {
    const raw = window.localStorage.getItem(scenarioKey(leagueId));
    if (!raw) return emptyScenario();
    const p = JSON.parse(raw) as Partial<Scenario> | null;
    const base = emptyScenario();
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return {
      overrides: p && typeof p.overrides === 'object' && p.overrides ? p.overrides : base.overrides,
      adds: list(p?.adds), drops: list(p?.drops), pins: list(p?.pins), benches: list(p?.benches),
      volatility: typeof p?.volatility === 'number' && p.volatility > 0 ? p.volatility : 1,
    };
  } catch {
    return emptyScenario();
  }
}

function saveScenario(leagueId: string, s: Scenario) {
  try {
    if (isScenarioActive(s)) window.localStorage.setItem(scenarioKey(leagueId), JSON.stringify(s));
    else window.localStorage.removeItem(scenarioKey(leagueId));
  } catch {
    /* storage unavailable: the what-if lasts until the page closes */
  }
}

/** The one what-if shared by My team, Waivers and Trades. Persisted per league; re-simulated (debounced) off the main thread. */
export function ScenarioProvider({ children }: { children: ReactNode }) {
  const { model, engine, baseSim } = useModel();
  const leagueId = model?.meta.leagueId ?? 'none';
  const [st, setSt] = useState(() => ({ leagueId, scenario: loadScenario(leagueId) }));

  // another league: pick up that league's saved what-if (derived state, so the page below keeps its place)
  let scenario = st.scenario;
  if (st.leagueId !== leagueId) {
    scenario = loadScenario(leagueId);
    setSt({ leagueId, scenario });
  }

  const setScenario = useCallback((update: (s: Scenario) => Scenario) => {
    setSt((prev) => {
      const current = prev.leagueId === leagueId ? prev.scenario : loadScenario(leagueId);
      const next = update(current);
      saveScenario(leagueId, next);
      return { leagueId, scenario: next };
    });
  }, [leagueId]);
  const reset = useCallback(() => setScenario(() => emptyScenario()), [setScenario]);

  const active = isScenarioActive(scenario);
  const settled = useDebounced(scenario, 250);

  const scenInput = useMemo(
    () => (engine && isScenarioActive(settled) ? engine.simInput(settled) : null),
    [engine, settled],
  );
  const scen = useSimulation(scenInput, 'scen');

  const value = useMemo<ScenarioValue>(() => ({
    scenario, setScenario, reset, active,
    base: baseSim,
    live: active ? (scen.fresh ? scen.result : null) : baseSim,
    running: active && (settled !== scenario || scen.running),
    frac: scen.frac,
  }), [scenario, setScenario, reset, active, baseSim, scen.fresh, scen.result, scen.running, scen.frac, settled]);

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}
