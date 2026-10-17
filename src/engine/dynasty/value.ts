/* A team's dynasty value: FantasyCalc values of the rostered players plus the values of the future picks it holds,
   split by position and by age. */
import type { FcEntry } from '../draft/fantasycalc.ts';
import type { PickValuation } from './picks.ts';

/** Players this age or younger count as young (26 and under vs 27 and up). */
export const YOUNG_MAX_AGE = 26;

export interface PlayerFacts {
  /** whole years, null when the players file has no birth date or age */
  age: number | null;
  /** position when FantasyCalc has no row for him */
  pos?: string;
  name?: string;
}

export interface RosterAsset {
  pid: string;
  name: string;
  pos: string;
  /** FantasyCalc value; null = no row */
  value: number | null;
  age: number | null;
}

/** Join one rostered pid to its FantasyCalc row and the players file. */
export function rosterAsset(pid: string, fc: Record<string, FcEntry> | null, facts: PlayerFacts | null): RosterAsset {
  const row = fc?.[pid];
  return {
    pid, name: row?.name || facts?.name || pid, pos: row?.position || facts?.pos || '?',
    value: row ? row.value : null, age: facts?.age ?? null,
  };
}

export interface TeamValue {
  rid: number;
  /** players + picks */
  total: number;
  players: number;
  picks: number;
  byPosition: Record<string, number>;
  /** player value from ages 26 and under, 27 and up, and from players with no age on file */
  young: number;
  old: number;
  unknownAge: number;
  /** young ÷ (young + old); null when no valued player has an age */
  youthShare: number | null;
  /** rostered players FantasyCalc has no value for (not counted) */
  unvalued: number;
  pickCount: number;
  /** picks priced from a nearest row rather than FantasyCalc's own price */
  estimatedPicks: number;
}

export function teamDynastyValue(rid: number, roster: readonly RosterAsset[], picks: readonly PickValuation[]): TeamValue {
  const byPosition: Record<string, number> = {};
  let players = 0, young = 0, old = 0, unknownAge = 0, unvalued = 0;
  for (const a of roster) {
    if (a.value === null) { unvalued++; continue; }
    players += a.value;
    byPosition[a.pos] = (byPosition[a.pos] ?? 0) + a.value;
    if (a.age === null) unknownAge += a.value;
    else if (a.age <= YOUNG_MAX_AGE) young += a.value;
    else old += a.value;
  }
  let pickValue = 0, estimatedPicks = 0;
  for (const p of picks) {
    if (p.value !== null) pickValue += p.value;
    if (p.estimated) estimatedPicks++;
  }
  return {
    rid, total: players + pickValue, players, picks: pickValue, byPosition, young, old, unknownAge,
    youthShare: young + old > 0 ? young / (young + old) : null, unvalued, pickCount: picks.length, estimatedPicks,
  };
}
