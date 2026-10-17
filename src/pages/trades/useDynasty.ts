/* Everything the dynasty side of the trade block reads: FantasyCalc (never throws), the players file (for ages), the
   league bundle (for traded picks), joined to the engine model by src/engine/dynasty. Nothing is fetched until `enabled`. */
import { useMemo } from 'react';
import { useData } from '../../app/dataContext';
import { useLeagueBundle, useResource } from '../../app/hooks';
import { ageOf } from '../../app/playersIndex';
import type { Fetcher } from '../../app/resourceStore';
import type { PlayersMap, SleeperLeague } from '../../data';
import { loadFantasyCalc } from '../../engine';
import type { Engine, FcResult } from '../../engine';
import {
  buildDynasty, teamsNow, type DynastyLeague, type LensTeam, type PickValuation, type TradeAsset,
} from '../../engine/dynasty/index.ts';

export interface DynastyView {
  /** a real dynasty league (settings.type 2); false when a redraft league is being explored */
  native: boolean;
  league: SleeperLeague;
  /** null while FantasyCalc is loading */
  fc: FcResult | null;
  /** null until FantasyCalc and the players file have answered */
  data: DynastyLeague | null;
  /** why the players file is missing (ages are then unknown), '' when fine */
  playersError: string;
  /** FantasyCalc answered and the simulation has landed, so labels mean something */
  lensReady: boolean;
  lensByRid: Record<number, LensTeam>;
  team: (rid: number) => { team: string; manager: string };
  playerAsset: (pid: string) => TradeAsset;
  pickAsset: (p: PickValuation) => TradeAsset;
  /** "2027 1st (via arnavn23)", the pick as the lists show it */
  pickName: (p: PickValuation) => string;
}

/** Age is taken on the first of September of the league season: stable across a season, so values do not drift as you read. */
const ageBasis = (league: SleeperLeague) => Date.UTC(Number(league.season) || new Date().getUTCFullYear(), 8, 1);

export function useDynasty(engine: Engine, league: SleeperLeague | null, enabled: boolean): DynastyView | null {
  const { sleeper } = useData();
  const native = league?.settings?.type === 2;
  const on = enabled && !!league && !!sleeper;

  // FantasyCalc, always with dynasty values (a redraft league that is being explored asks for them explicitly)
  const fcFetcher = useMemo<Fetcher<FcResult> | null>(
    () => (on && sleeper && league
      ? async (o) => {
        const r = await loadFantasyCalc(sleeper, league, { force: o?.force, isDynasty: true });
        return { data: r, asOf: r.asOf ?? Date.now(), fromCache: false, stale: r.stale };
      }
      : null),
    [on, sleeper, league],
  );
  const fc = useResource(on && league ? (native ? `fantasycalc:${league.league_id}` : `fantasycalc-dynasty:${league.league_id}`) : null, fcFetcher).data ?? null;

  const playersFetcher = useMemo<Fetcher<PlayersMap> | null>(() => (on && sleeper ? (o) => sleeper.players(o) : null), [on, sleeper]);
  const players = useResource(on ? 'sleeper-players' : null, playersFetcher);
  const bundle = useLeagueBundle(on ? undefined : null).data;

  const { model } = engine;
  return useMemo<DynastyView | null>(() => {
    if (!on || !league) return null;
    const playersReady = !!players.data || !!players.error;
    const fcMap = fc?.ok ? fc.byId : null;
    const basis = ageBasis(league);
    const facts = (pid: string) => {
      const rec = players.data?.[pid];
      return rec ? { age: ageOf(rec, basis), pos: rec.position ?? undefined } : null;
    };
    const rosters: Record<number, string[]> = {};
    for (const t of model.teams) rosters[t.rid] = [];
    for (const r of bundle?.rosters ?? []) rosters[r.roster_id] = [...(r.players ?? [])];
    for (const p of model.players) {
      if (p.ownerRid > 0 && !rosters[p.ownerRid]?.includes(p.pid)) (rosters[p.ownerRid] ??= []).push(p.pid);
    }
    const data = fc && playersReady
      ? buildDynasty({
        teams: teamsNow(model), oddsPending: model.oddsPending, rosters, fc: fcMap, facts,
        tradedPicks: bundle?.tradedPicks ?? [], league,
      })
      : null;
    const lensReady = !!data && !!fc?.ok && !model.oddsPending;
    const lensByRid: Record<number, LensTeam> = {};
    if (lensReady) for (const t of data.lens) lensByRid[t.rid] = t;
    const teams = new Map(model.teams.map((t) => [t.rid, t]));
    const team = (rid: number) => ({ team: teams.get(rid)?.team ?? `team ${rid}`, manager: teams.get(rid)?.manager ?? `team ${rid}` });
    const pickName = (p: PickValuation) => (p.acquired ? `${p.label} (via ${team(p.originalRosterId).manager})` : p.label);
    return {
      native, league, fc, data, playersError: players.error ?? '', lensReady, lensByRid, team, pickName,
      playerAsset: (pid) => {
        const mp = model.players.find((x) => x.pid === pid);
        const row = fcMap?.[pid];
        return { id: pid, kind: 'player', label: mp?.name ?? row?.name ?? pid, value: row ? row.value : null, age: facts(pid)?.age ?? null };
      },
      pickAsset: (p) => ({ id: p.key, kind: 'pick', label: pickName(p), value: p.value, age: null }),
    };
  }, [on, league, native, fc, players.data, players.error, bundle, model]);
}
