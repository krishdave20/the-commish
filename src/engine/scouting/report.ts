/* The scouting report for one team in one week: everything the scouting tab shows, as plain data. */
import type { Transaction } from '../../data/types.ts';
import type { HistoryRow } from '../types.ts';
import type { HingesResult } from '../hinges/index.ts';
import { pts1 } from './format.ts';
import { headToHead } from './headToHead.ts';
import type { HeadToHead } from './headToHead.ts';
import { howToBeat } from './keys.ts';
import type { Key } from './keys.ts';
import { scoutLineup, teamProjection } from './lineup.ts';
import type { LineupScout } from './lineup.ts';
import { recentMoves } from './moves.ts';
import type { Move, MoveLookup } from './moves.ts';
import { tendencies } from './tendencies.ts';
import type { PastWeek, Tendencies } from './tendencies.ts';
import type { ScoutLabels, ScoutPlayer, ScoutTeam } from './types.ts';

export interface ScoutInput {
  week: number;
  /** the week is over: the report reads points, not projections */
  review: boolean;
  /** the team being scouted */
  target: ScoutTeam;
  /** the team across from it (the one asking) */
  you: ScoutTeam;
  labels: ScoutLabels;
  /** the scouted team's hinges (its win chance against `you`), null when the week is over or there is no model */
  hinges: HingesResult | null;
  /** the scouted team's finished weeks */
  past: readonly PastWeek[];
  history: readonly HistoryRow[];
  transactions: readonly Transaction[];
  moves: MoveLookup;
}

export interface Threat1 {
  player: ScoutPlayer;
  /** "21.3 proj · 14 points of win chance" or, in a review, "27.4 pts" */
  detail: string;
  atStake: number | null;
}

export interface Headline {
  /** their number for the week: projection, points so far, or the final score */
  projection: number;
  /** the other side's */
  otherProjection: number;
  lineup: { isOptimal: boolean; left: number };
  threat: Threat1 | null;
}

export interface ScoutReport {
  week: number;
  review: boolean;
  target: { rid: number; name: string };
  headline: Headline;
  lineup: LineupScout;
  /** the scouted team's hinges, null when the week is over */
  hinges: HingesResult | null;
  tendencies: Tendencies;
  moves: Move[];
  headToHead: HeadToHead;
  keys: Key[];
}

function biggestThreat(target: ScoutTeam, hinges: HingesResult | null, review: boolean): Threat1 | null {
  const starters = target.starters.filter((p): p is ScoutPlayer => !!p);
  if (review) {
    const top = [...starters].sort((a, b) => b.actual - a.actual)[0];
    return top ? { player: top, detail: `${pts1(top.actual)} pts`, atStake: null } : null;
  }
  const byPid = new Map(starters.map((p) => [p.pid, p]));
  const row = hinges?.rows.find((r) => r.state !== 'final' && r.atStake > 0 && byPid.has(r.pid));
  if (row) return { player: byPid.get(row.pid)!, detail: `${pts1(row.projection)} proj · ${Math.round(row.atStake)} points of win chance`, atStake: row.atStake };
  const open = starters.filter((p) => p.state === 'pre' || p.state === 'live').sort((a, b) => b.projection - a.projection)[0];
  return open ? { player: open, detail: `${pts1(open.projection)} proj`, atStake: null } : null;
}

export function buildScoutReport(input: ScoutInput): ScoutReport {
  const { week, review, target, you } = input;
  const lineup = scoutLineup(target, { review });
  const tend = tendencies({ rid: target.rid, week, past: input.past, history: input.history });
  const hinges = review ? null : input.hinges;
  const keys = review ? [] : howToBeat({ you, target, labels: input.labels, lineup, hinges, tendencies: tend });
  return {
    week, review, target: { rid: target.rid, name: target.name },
    headline: {
      projection: lineup.projection, otherProjection: teamProjection(you),
      lineup: { isOptimal: lineup.isOptimal, left: lineup.left },
      threat: biggestThreat(target, hinges, review),
    },
    lineup, hinges, tendencies: tend,
    moves: recentMoves({ rid: target.rid, week, transactions: input.transactions, lookup: input.moves }),
    headToHead: headToHead({ you: you.rid, them: target.rid, week, history: input.history }),
    keys,
  };
}

