/* Hooks that feed the bracket views: Sleeper's own brackets, the front-office "toilet bowl" setting, and the model's
   inputs (expected points by week, names, seeds). No component code here, so these stay importable by pages. */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { BracketRow } from '../../data';
import type { Fetcher } from '../../app/resourceStore';
import { useActive, useResource } from '../../app/hooks';
import { useData } from '../../app/dataContext';
import { useScenario } from '../../app/modelContext';
import type { LosersMode } from '../../app/names';
import { loadPrefs, PREFS_EVENT, savePrefs, type LosersPref } from '../../app/prefs';
import { losersModeOf, rulesOf, type BracketCtx, type PlayoffRules } from '../../engine';
import type { Engine } from '../../engine';

export interface SleeperBrackets {
  /** null: not fetched, or Sleeper has none */
  winners: BracketRow[] | null;
  losers: BracketRow[] | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** The active league's winners and losers brackets from Sleeper. An error (or no client, as in tests) just means "no bracket". */
export function useSleeperBrackets(): SleeperBrackets {
  const { sleeper } = useData();
  const { data: active } = useActive();
  const id = active?.leagueId ?? null;
  const canWin = !!sleeper && typeof sleeper.winnersBracket === 'function';
  const canLose = !!sleeper && typeof sleeper.losersBracket === 'function';
  const fw = useMemo<Fetcher<BracketRow[]> | null>(() => (id && canWin ? (o) => sleeper!.winnersBracket(id, o) : null), [sleeper, id, canWin]);
  const fl = useMemo<Fetcher<BracketRow[]> | null>(() => (id && canLose ? (o) => sleeper!.losersBracket(id, o) : null), [sleeper, id, canLose]);
  const w = useResource(id ? `bracket:w:${id}` : null, fw);
  const l = useResource(id ? `bracket:l:${id}` : null, fl);
  const refresh = useCallback(async () => { await Promise.all([w.refresh(), l.refresh()]); }, [w, l]);
  return {
    winners: w.data && w.data.length ? w.data : null,
    losers: l.data && l.data.length ? l.data : null,
    loading: w.loading || l.loading,
    refresh,
  };
}

function subscribePrefs(cb: () => void): () => void {
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(PREFS_EVENT, cb); window.removeEventListener('storage', cb); };
}

export interface LosersSetting {
  /** the front-office choice */
  pref: LosersPref;
  setPref: (p: LosersPref) => void;
  /** what the league's own Sleeper losers bracket is, read from its shape; null when Sleeper has none yet */
  leagueMode: LosersMode | null;
  /** what the app shows */
  mode: LosersMode;
  /** the app is showing something other than the league's own setting (so say so) */
  differs: boolean;
}

/** The toilet-bowl-or-consolation setting, resolved against the league's own losers bracket. */
export function useLosersSetting(): LosersSetting {
  const pref = useSyncExternalStore(subscribePrefs, () => loadPrefs().losers, () => 'toilet' as LosersPref);
  const brackets = useSleeperBrackets();
  const leagueMode = losersModeOf(brackets.losers);
  const mode: LosersMode = pref === 'match' ? (leagueMode ?? 'consolation') : pref;
  return {
    pref, setPref: (p) => { savePrefs({ losers: p }); }, leagueMode, mode,
    differs: leagueMode !== null && leagueMode !== mode,
  };
}

export interface BracketInputs {
  rules: PlayoffRules;
  ctx: BracketCtx;
  names: Map<number, string>;
}

/** What the bracket math needs from the model: the playoff rules, each team's expected points by week (with the what-if applied) and names. */
export function useBracketInputs(engine: Engine): BracketInputs {
  const { scenario } = useScenario();
  const { model } = engine;
  return useMemo(() => ({
    rules: rulesOf(model.meta),
    ctx: { means: engine.teamMeans(scenario), sd: model.meta.teamWeeklySd * scenario.volatility, currentWeek: model.meta.currentWeek },
    names: new Map(model.teams.map((t) => [t.rid, t.team] as const)),
  }), [engine, model, scenario]);
}
