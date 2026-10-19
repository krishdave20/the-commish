/* The league's real trades and their grades. Reads every week's transactions so far (cached by the data layer), keeps the completed trades,
   grades them, and (for the most recent few) simulates your playoff odds today with and without each deal. */
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../../app/dataContext';
import { useResource } from '../../../app/hooks';
import { useScenario } from '../../../app/modelContext';
import { displayName } from '../../../app/playersIndex';
import { teamResult } from '../../../app/results';
import type { Fetcher } from '../../../app/resourceStore';
import type { PlayersMap, Transaction } from '../../../data';
import type { Engine } from '../../../engine';
import { cancelSim, runSimInWorker } from '../../../engine';
import {
  gradeTrades, parseTrades, tradeSimPair, type PlayerRef, type RealTrade, type TradeGrade,
} from '../../../engine/tradefinder/index.ts';
import { useDebounced } from '../../../app/useSimulation';
import type { DynastyView } from '../useDynasty';
import { valuesOf } from '../finder/useFinder';

/** odds are simulated for this many of the latest trades (two simulations each) */
export const ODDS_TRADES = 6;

export interface Transactions { byWeek: Record<number, Transaction[]>; /** weeks that could not be read */ failed: number[] }

export interface TradesView {
  loading: boolean;
  /** the transactions could not be read at all */
  error: string | undefined;
  /** weeks that failed while others loaded */
  failed: number[];
  asOf: number | null;
  grades: TradeGrade[];
}

export function useTrades(engine: Engine, dyn: DynastyView | null): TradesView {
  const { sleeper } = useData();
  const { model } = engine;
  const { leagueId, currentWeek: cur } = model.meta;

  const fetcher = useMemo<Fetcher<Transactions> | null>(() => {
    if (!sleeper || typeof sleeper.transactions !== 'function') return null;
    return async (o) => {
      const weeks = Array.from({ length: Math.max(0, cur) }, (_, i) => i + 1);
      const rs = await Promise.all(weeks.map((w) => sleeper.transactions(leagueId, w, o).then((r) => ({ w, r }), (e: unknown) => ({ w, e }))));
      const byWeek: Record<number, Transaction[]> = {};
      const failed: number[] = [];
      let asOf = Infinity, cached = true, stale = false;
      let firstError: unknown;
      for (const x of rs) {
        if ('r' in x) {
          byWeek[x.w] = x.r.data;
          asOf = Math.min(asOf, x.r.asOf); cached = cached && x.r.fromCache; stale = stale || x.r.stale;
        } else { failed.push(x.w); firstError ??= x.e; }
      }
      if (weeks.length > 0 && failed.length === weeks.length) throw firstError instanceof Error ? firstError : new Error('could not read the league’s transactions');
      return { data: { byWeek, failed }, asOf: Number.isFinite(asOf) ? asOf : Date.now(), fromCache: cached, stale };
    };
  }, [sleeper, leagueId, cur]);
  const res = useResource(fetcher ? `transactions:${leagueId}:${cur}` : null, fetcher);

  const trades = useMemo<RealTrade[]>(() => (res.data ? parseTrades(res.data.byWeek) : []), [res.data]);

  // names for a player the model no longer carries (dropped long ago): only then is the big players file read
  const known = useMemo(() => new Set(model.players.map((p) => p.pid)), [model]);
  const missing = trades.some((t) => t.teams.some((x) => [...x.got, ...x.sent].some((id) => !known.has(id))));
  const playersFetcher = useMemo<Fetcher<PlayersMap> | null>(() => (missing && sleeper ? (o) => sleeper.players(o) : null), [missing, sleeper]);
  const players = useResource(playersFetcher ? 'sleeper-players' : null, playersFetcher).data;

  const { scenario } = useScenario();
  const values = useMemo(() => valuesOf(dyn), [dyn]);
  const grades = useMemo(
    () => gradeTrades(model, trades, {
      scenario, values,
      lookup: (pid): Partial<PlayerRef> | null => {
        const rec = players?.[pid];
        return rec ? { name: displayName({ ...rec, player_id: pid }), pos: rec.position ?? '?', nfl: rec.team ?? null } : null;
      },
    }),
    [model, trades, scenario, values, players],
  );
  return { loading: res.loading && !res.data, error: res.data ? undefined : res.error, failed: res.data?.failed ?? [], asOf: res.asOf, grades };
}

export interface SideOdds { with: number; without: number }
/** trade id → roster id → your playoff odds today with the trade and with it undone */
export type TradeOdds = Record<string, Record<number, SideOdds>>;

/** Playoff odds with and without each of the latest trades, in the worker, one run after another; waits a moment after the grades change. */
export function useTradeOdds(engine: Engine, grades: readonly TradeGrade[]): { odds: TradeOdds; pending: boolean } {
  const { scenario } = useScenario();
  const { model } = engine;
  const latest = useMemo(() => grades.slice(-ODDS_TRADES), [grades]);
  const settled = useDebounced(latest, 400);
  const [got, setGot] = useState<{ for: readonly TradeGrade[]; odds: TradeOdds }>({ for: [], odds: {} });

  useEffect(() => {
    if (settled.length === 0) return;
    let alive = true;
    void (async () => {
      const odds: TradeOdds = {};
      for (const g of settled) {
        const pair = tradeSimPair(model, g.trade, scenario);
        const a = await runSimInWorker(pair.with, undefined, { channel: 'trade-history' }).catch(() => null);
        if (!alive || !a) return;
        const b = await runSimInWorker(pair.without, undefined, { channel: 'trade-history' }).catch(() => null);
        if (!alive || !b) return;
        odds[g.trade.id] = Object.fromEntries(g.trade.teams.map((t) => [t.rid, { with: teamResult(model, a, t.rid).playoff, without: teamResult(model, b, t.rid).playoff }]));
        setGot({ for: settled, odds: { ...odds } });
      }
    })();
    return () => { alive = false; cancelSim('trade-history'); };
  }, [settled, model, scenario]);

  const fresh = got.for === settled ? got.odds : {};
  return { odds: fresh, pending: latest.length > 0 && latest.some((g) => !fresh[g.trade.id]) };
}
