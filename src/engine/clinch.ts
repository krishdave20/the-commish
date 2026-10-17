/* Strict clinch math (port of standingsLocked, nonWinnersAbove, designations and winsToClinch in
   reference/ff_live.js, unchanged in logic).

   Marks:  x clinched a playoff spot   y clinched the division   d out of the division race   e eliminated.
   A mark is only given when it is mathematically guaranteed, whatever the remaining results and whatever
   the tiebreakers: ties on wins always count against the team being judged.

   Wildcard rule: a division winner never takes a wildcard spot, so for a team T at its floor, the teams in
   one division that could reach T's wins can push T down by at most (those teams - 1), because one of
   them is that division's winner. Assuming every threat reaches T at once only overstates the danger, so a
   clinch found this way is always real; the same logic run on "sure-above" teams proves elimination.
   With zero divisions every team above counts and the team needs a top-`playoffTeams` finish.

   `picks` (playoff machine) map a game id to the rid forced to win it. */

import type { Model } from './types.ts';

export interface ClinchTeam { rid: number; wins: number; losses: number; divId: number }
export interface ClinchGame { id: string; teamA: number; teamB: number }

export interface ClinchLeague {
  teams: ClinchTeam[];
  /** remaining regular-season games */
  games: ClinchGame[];
  /** number of divisions (0 = none) */
  divisions: number;
  /** playoff teams, already capped at the number of teams */
  playoffTeams: number;
}

export type Picks = Record<string, number>;
export type Mark = 'x' | 'y' | 'd' | 'e' | '';

export interface Designation { clinch: boolean; divClinch: boolean; divOut: boolean; elim: boolean; mark: Mark }
export interface Locked { W: Record<number, number>; L: Record<number, number>; open: Record<number, number> }
export interface WinsToClinch {
  /** wins (of the `open` games left) that clinch a spot by your own results alone; null = cannot on your own */
  spot: number | null;
  /** wins that clinch the division by your own results alone; null = cannot */
  div: number | null;
  open: number;
  /** true when only winning every remaining game clinches (the win-out check) */
  winOut: boolean;
}

const nWildcards = (L: ClinchLeague) => Math.max(0, L.playoffTeams - L.divisions);

/** Wins and losses with the picks applied, and how many games each team still has open. */
export function standingsLocked(L: ClinchLeague, picks: Picks = {}): Locked {
  const W: Record<number, number> = {}, Lo: Record<number, number> = {}, open: Record<number, number> = {};
  L.teams.forEach((t) => { W[t.rid] = t.wins; Lo[t.rid] = t.losses; open[t.rid] = 0; });
  L.games.forEach((g) => {
    const win = picks[g.id];
    if (win != null) { W[win] = W[win]! + 1; const lose = win === g.teamA ? g.teamB : g.teamA; Lo[lose] = Lo[lose]! + 1; }
    else { open[g.teamA] = open[g.teamA]! + 1; open[g.teamB] = open[g.teamB]! + 1; }
  });
  return { W, L: Lo, open };
}

/** Non-division-winners that could (mode 'threat': reach `lo` wins) or surely do (mode 'sure': already beat `lo`) sit above T. */
export function nonWinnersAbove(L: ClinchLeague, T: ClinchTeam, W: Record<number, number>, open: Record<number, number>, lo: number, mode: 'threat' | 'sure'): { total: number; ownAbove: number } {
  let total = 0, ownAbove = 0;
  const hit = (o: ClinchTeam) => o.rid !== T.rid && (mode === 'threat' ? W[o.rid]! + open[o.rid]! >= lo : W[o.rid]! > lo);
  if (!L.divisions) return { total: L.teams.filter(hit).length, ownAbove: 1 };
  const divs = [...new Set(L.teams.map((t) => t.divId))];
  divs.forEach((d) => {
    const n = L.teams.filter((o) => o.divId === d && hit(o)).length;
    if (d === T.divId) ownAbove = n;
    total += Math.max(0, n - 1);
  });
  return { total, ownAbove };
}

export function designations(L: ClinchLeague, picks: Picks = {}): Record<number, Designation> {
  const { W, open } = standingsLocked(L, picks);
  const nWild = nWildcards(L);
  const out: Record<number, Designation> = {};
  L.teams.forEach((t) => {
    const lo = W[t.rid]!, hi = W[t.rid]! + open[t.rid]!;
    const th = nonWinnersAbove(L, t, W, open, lo, 'threat');
    const sure = nonWinnersAbove(L, t, W, open, hi, 'sure');
    let divClinch: boolean, clinch: boolean, divOut: boolean, elim: boolean;
    if (L.divisions) {
      divClinch = th.ownAbove === 0;
      clinch = divClinch || th.total <= nWild - 1;
      divOut = sure.ownAbove > 0;
      elim = divOut && sure.total >= nWild;
    } else {
      divClinch = false; divOut = false;
      clinch = th.total <= L.playoffTeams - 1;
      elim = sure.total >= L.playoffTeams;
    }
    out[t.rid] = { clinch, divClinch, divOut, elim, mark: divClinch ? 'y' : clinch ? 'x' : elim ? 'e' : divOut ? 'd' : '' };
  });
  return out;
}

/** How many of the remaining games team `rid` must win to clinch on its own results, including the win-out check. */
export function winsToClinch(L: ClinchLeague, rid: number, picks: Picks = {}): WinsToClinch {
  const { W, open } = standingsLocked(L, picks);
  const me = L.teams.find((t) => t.rid === rid);
  if (!me) return { spot: null, div: null, open: 0, winOut: false };
  const nWild = nWildcards(L);
  let spot: number | null = null, div: number | null = null;
  for (let k = 0; k <= open[rid]!; k++) {
    const th = nonWinnersAbove(L, me, W, open, W[rid]! + k, 'threat');
    if (L.divisions && div == null && th.ownAbove === 0) div = k;
    if (spot == null && (L.divisions ? (th.ownAbove === 0 || th.total <= nWild - 1) : th.total <= L.playoffTeams - 1)) spot = k;
  }
  let winOut = false;
  if (spot == null && open[rid]! > 0) {
    const pk2: Picks = { ...picks };
    L.games.forEach((g) => { if (pk2[g.id] == null && (g.teamA === rid || g.teamB === rid)) pk2[g.id] = rid; });
    if (designations(L, pk2)[rid]!.clinch) { spot = open[rid]!; winOut = true; }
  }
  return { spot, div, open: open[rid]!, winOut };
}

/** The league as the clinch functions see it, from a model. */
export function clinchLeagueOf(model: Model): ClinchLeague {
  return {
    teams: model.teams.map((t) => ({ rid: t.rid, wins: t.wins, losses: t.losses, divId: t.divId })),
    games: model.games.map((g) => ({ id: g.id, teamA: g.teamA, teamB: g.teamB })),
    divisions: model.meta.divisions,
    playoffTeams: model.meta.playoffTeams,
  };
}
