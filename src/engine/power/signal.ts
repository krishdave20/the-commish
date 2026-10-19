/* A small signal for the moments engine (not wired in here): the power rankings of a week are ready, and where a team stands in them.
   The Tuesday recap can say "you're up to 5th". */
import type { PowerRankings } from './types.ts';

export interface PowerSignal {
  week: number;
  rid: number;
  rank: number;
  /** places gained since the previous set; null in the first week */
  movement: number | null;
  /** "you're up to 5th", "you're down to 7th", "you're 5th" */
  text: string;
}

const ord = (n: number) => {
  const r = n % 100;
  return `${n}${r >= 11 && r <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

/** The signal for `rid` in the rankings of `week`, or null when that week has no rankings yet. */
export function powerRankingsReady(rankings: PowerRankings, week: number, rid: number): PowerSignal | null {
  const w = rankings.weeks.find((x) => x.week === week);
  const t = w?.teams.find((x) => x.rid === rid);
  if (!w || !t) return null;
  const m = t.movement;
  const text = m === null || m === 0 ? `you're ${ord(t.rank)}` : m > 0 ? `you're up to ${ord(t.rank)}` : `you're down to ${ord(t.rank)}`;
  return { week, rid, rank: t.rank, movement: m, text };
}
