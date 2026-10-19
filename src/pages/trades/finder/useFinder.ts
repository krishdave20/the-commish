/* The finder's data: the ideas for the signed-in team (pure search, memoized), and the playoff-odds change for the top few (worker, debounced). */
import { useEffect, useMemo, useState } from 'react';
import { useModel, useScenario } from '../../../app/modelContext';
import { teamResult } from '../../../app/results';
import { useDebounced } from '../../../app/useSimulation';
import type { SleeperLeague } from '../../../data';
import type { Engine } from '../../../engine';
import { cancelSim, runSimInWorker } from '../../../engine';
import { finderSimInputs, findTradeIdeas, type FinderIdea, type FinderResult } from '../../../engine/tradefinder/index.ts';
import type { DynastyView } from '../useDynasty';

/** how many of the best ideas get a playoff-odds simulation (each is 6,000 seasons) */
export const ODDS_TOP = 5;
export const ODDS_DEBOUNCE_MS = 500;

/** The roster limit that counts for trades: the league's roster positions without injured reserve and the taxi squad. */
export function rosterLimit(league: Pick<SleeperLeague, 'roster_positions'> | null | undefined): number | undefined {
  const n = (league?.roster_positions ?? []).filter((p) => p !== 'IR' && p !== 'TAXI').length;
  return n > 0 ? n : undefined;
}

/** FantasyCalc values by player id when the dynasty lens is on and FantasyCalc answered; otherwise null (a redraft league). */
export function valuesOf(dyn: DynastyView | null): Record<string, number | null> | null {
  if (!dyn?.fc?.ok) return null;
  const out: Record<string, number | null> = {};
  for (const [pid, e] of Object.entries(dyn.fc.byId)) out[pid] = e.value;
  return out;
}

export function useFinder(engine: Engine, dyn: DynastyView | null): FinderResult {
  const { scenario } = useScenario();
  const { extras } = useModel();
  const rosterSize = rosterLimit(extras?.league);
  const values = useMemo(() => valuesOf(dyn), [dyn]);
  return useMemo(
    () => findTradeIdeas(engine.model, { scenario, rid: engine.meRid, rosterSize, values }),
    [engine, scenario, rosterSize, values],
  );
}

export interface OddsChange { before: number; after: number }
export interface FinderOdds {
  /** idea id → your playoff odds before and after */
  byId: Record<string, OddsChange>;
  /** the ideas that get a simulation, in order */
  ids: string[];
  /** every one of them is done */
  done: boolean;
}

/** Playoff odds for the best ideas: the "before" season once, then each idea's "after", one after the other in the worker. A new set of
    ideas waits ODDS_DEBOUNCE_MS (a filter or what-if being changed) and cancels the run in flight. */
export function useFinderOdds(engine: Engine, ideas: readonly FinderIdea[]): FinderOdds {
  const { scenario } = useScenario();
  const top = useMemo(() => [...ideas].sort((a, b) => b.minGain - a.minGain).slice(0, ODDS_TOP), [ideas]);
  const inputs = useMemo(() => (top.length ? finderSimInputs(engine.model, scenario, top, { meRid: engine.meRid }) : null), [engine, scenario, top]);
  const settled = useDebounced(inputs, ODDS_DEBOUNCE_MS);
  const [got, setGot] = useState<{ for: typeof inputs; byId: Record<string, OddsChange> }>({ for: null, byId: {} });

  useEffect(() => {
    if (!settled) return;
    let alive = true;
    void (async () => {
      const b = await runSimInWorker(settled.before, undefined, { channel: 'finder' }).catch(() => null);
      if (!alive || !b) return;
      const before = teamResult(engine.model, b, engine.meRid).playoff;
      const byId: Record<string, OddsChange> = {};
      for (const [id, input] of Object.entries(settled.afters)) {
        const r = await runSimInWorker(input, undefined, { channel: 'finder' }).catch(() => null);
        if (!alive || !r) return;
        byId[id] = { before, after: teamResult(engine.model, r, engine.meRid).playoff };
        setGot({ for: settled, byId: { ...byId } });
      }
    })();
    return () => { alive = false; cancelSim('finder'); };
  }, [settled, engine]);

  const ids = top.map((i) => i.id);
  const fresh = got.for === settled && settled !== null ? got.byId : {};
  return { byId: fresh, ids, done: ids.length > 0 && ids.every((id) => fresh[id]) };
}
