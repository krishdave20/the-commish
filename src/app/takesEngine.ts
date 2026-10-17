import { createContext, useContext } from 'react';
import { buildTakes } from '../takes';
import type { Take, TakeInputs, TakesThresholds } from '../takes/types';

/** The takes engine's entry point (src/takes/index.ts): rules and templates only, no LLM. */
export type BuildTakes = (inputs: TakeInputs, thresholds?: TakesThresholds) => Take[];

export const defaultBuildTakes: BuildTakes = buildTakes;

export const TakesEngineContext = createContext<BuildTakes>(defaultBuildTakes);

/** Tests wrap the app in `<TakesEngineContext.Provider value={stub}>`. */
export function useBuildTakes(): BuildTakes {
  return useContext(TakesEngineContext);
}
