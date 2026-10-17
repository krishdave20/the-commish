import { LOSERS_COPY, TITLE_COPY } from '../../app/names';
import type { BracketKind } from '../../engine';

export interface BracketCopy {
  name: string;
  kicker: string;
  odds: string;
  oddsHeader: string;
  champ: string;
  line: string;
  verb: string;
  advanced: string;
  chance: string;
  hint: string;
}

/** The words a bracket uses, by kind. */
export function copyFor(kind: BracketKind): BracketCopy {
  return kind === 'championship' ? TITLE_COPY : LOSERS_COPY[kind];
}

/** "week 15", "weeks 17 and 18" */
export function weeksLabel(weeks: readonly number[]): string {
  return weeks.length === 0 ? '' : weeks.length === 1 ? `week ${weeks[0]}` : `weeks ${weeks.slice(0, -1).join(', ')} and ${weeks[weeks.length - 1]}`;
}

/** The label above a round's column. */
export function roundLabel(round: number, rounds: number): string {
  if (round === rounds) return 'final';
  if (round === rounds - 1) return 'semifinals';
  if (round === rounds - 2) return 'quarterfinals';
  return `round ${round}`;
}
