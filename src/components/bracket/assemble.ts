/* From a model to the brackets the pages draw. Pure. */
import type { BracketRow } from '../../data';
import type { LosersMode } from '../../app/names';
import type { SimSummary } from '../../engine';
import {
  buildBracket, bracketFromSleeper, machineOrder, projectedOrder, realGamesOf, splitOrder, standingsOrder,
  type Bracket, type BracketPicks, type Model, type PlayoffRules, type SeedRules, type SeedTeam,
} from '../../engine';
import { teamResult } from '../../app/results';

export type SeedingMode = 'today' | 'projected' | 'machine';

export const SEEDING_LABEL: Record<SeedingMode, string> = {
  today: 'if it ended today',
  projected: 'projected',
  machine: 'from the machine',
};

export const seedTeamsOf = (model: Model): SeedTeam[] =>
  model.teams.map((t) => ({ rid: t.rid, wins: t.wins, losses: t.losses, ties: t.ties, pf: t.pf, divId: t.divId }));

export const seedRulesOf = (model: Model): SeedRules => ({ playoffTeams: model.meta.playoffTeams, divisions: model.meta.divisions });

export interface OrderInputs {
  model: Model;
  /** the simulation the page is showing (what-if applied); the model's own first run when null */
  sim: SimSummary | null | undefined;
  /** playoff-machine picks */
  picks: BracketPicks;
  /** expected points by team and week */
  means: Record<number, Record<number, number>>;
}

/** Every team best-first under a seeding mode: the first `playoffTeams` are the playoff seeds. */
export function orderFor(mode: SeedingMode, o: OrderInputs): number[] {
  const { model } = o;
  const teams = seedTeamsOf(model), rules = seedRulesOf(model);
  if (mode === 'today') return standingsOrder(teams, rules);
  if (mode === 'machine') return machineOrder(teams, model.games, o.picks, o.means, rules);
  return projectedOrder(model.teams.map((t) => {
    const r = teamResult(model, o.sim, t.rid);
    return { rid: t.rid, seeds: r.seeds, expW: r.expW, pf: t.pf };
  }), model.meta.playoffTeams);
}

export interface Brackets {
  /** the championship bracket (null when fewer than two teams make the playoffs) */
  title: Bracket | null;
  /** the non-playoff teams' bracket (null when fewer than two teams miss) */
  field: Bracket | null;
}

/** The championship bracket and the non-playoff bracket for a best-first ranking. Games Sleeper's losers bracket already played lock the field's games. */
export function bracketsFor(order: readonly number[], rules: PlayoffRules, losers: LosersMode, losersRows?: readonly BracketRow[] | null): Brackets {
  const split = splitOrder(order, rules.teams, losers);
  return {
    title: split.playoff.length >= 2 ? buildBracket({ kind: 'championship', seedOrder: split.playoff, rules }) : null,
    field: split.field.length >= 2 ? buildBracket({ kind: losers, seedOrder: split.field, rules, real: realGamesOf(losersRows) }) : null,
  };
}

/** Sleeper's own winners bracket with its real results locked, or null when Sleeper has none. Seeds the layout cannot place come from `order`. */
export function titleFromSleeper(rows: readonly BracketRow[] | null | undefined, rules: PlayoffRules, order: readonly number[]): Bracket | null {
  const seeds: Record<number, number> = {};
  order.slice(0, rules.teams).forEach((rid, i) => { seeds[rid] = i + 1; });
  return bracketFromSleeper(rows, { rules, seeds });
}

/** The teams that miss the playoffs when Sleeper's own bracket is the truth: everyone not on its title road. */
export function fieldOrderFromSleeper(title: Bracket, order: readonly number[], losers: LosersMode): number[] {
  const inTitle = new Set(title.matches.flatMap((m) => [m.a, m.b]).flatMap((s) => (s.kind === 'team' ? [s.rid] : [])));
  const rest = order.filter((r) => !inTitle.has(r));
  return losers === 'toilet' ? [...rest].reverse() : rest;
}
