import { createContext, useContext } from 'react';
import type { Engine, LoadProgress, Model, Scenario, SimSummary } from '../engine';

export interface ModelValue {
  model: Model | null;
  /** bound to the signed-in team */
  engine: Engine | null;
  asOf: number | null;
  stale: boolean;
  fromCache: false;
  /** the model's own first simulation (no what-if); null until it finishes */
  baseSim: SimSummary | null;
  loading: boolean;
  progress: LoadProgress | null;
  error: string | undefined;
  /** pull everything again, skipping fresh cache copies */
  refresh: () => Promise<void>;
}

export const ModelContext = createContext<ModelValue | null>(null);

export function useModel(): ModelValue {
  const v = useContext(ModelContext);
  if (!v) throw new Error('ModelProvider is missing');
  return v;
}

export interface ScenarioValue {
  scenario: Scenario;
  setScenario: (update: (s: Scenario) => Scenario) => void;
  reset: () => void;
  /** the what-if changes something */
  active: boolean;
  /** the model's own run (no what-if); null until it finishes */
  base: SimSummary | null;
  /** the what-if run, or `base` when nothing is changed; null until it finishes */
  live: SimSummary | null;
  /** a what-if run is waiting or under way */
  running: boolean;
  /** 0 to 1 */
  frac: number;
}

export const ScenarioContext = createContext<ScenarioValue | null>(null);

export function useScenario(): ScenarioValue {
  const v = useContext(ScenarioContext);
  if (!v) throw new Error('ScenarioProvider is missing');
  return v;
}
