/* Words for the almanac: names, seasons and the "against history" sentences. Pure. */
import { formatPoints1, ordinal } from '../../app/format';
import type { Almanac, Callout, GameEntry, Manager, ScoreEntry } from '../../engine/almanac';

export const when = (m: { season: string; week: number }) => `${m.season} week ${m.week}`;

export const managerName = (a: Almanac, id: string): string => a.managers.get(id)?.name ?? 'unknown manager';
export const managerOf = (a: Almanac, id: string): Manager | undefined => a.managers.get(id);

/** "2nd highest", "highest" */
const place = (rank: number, word: string) => (rank === 1 ? `the ${word}` : `the ${ordinal(rank)} ${word}`);

/** One "against the record book" sentence. `scope` is "in league history" with earlier seasons on record, else "this season". */
export function calloutText(c: Callout, scope: string): string {
  const e = c.entry;
  switch (c.kind) {
    case 'highest': {
      const s = e as ScoreEntry;
      return `${s.team}’s ${formatPoints1(s.pts)} in week ${s.week} is ${place(c.rank, 'highest score')} ${scope}.`;
    }
    case 'lowest': {
      const s = e as ScoreEntry;
      return `${s.team}’s ${formatPoints1(s.pts)} in week ${s.week} is ${place(c.rank, 'lowest score')} ${scope}.`;
    }
    case 'blowout': {
      const g = e as GameEntry;
      return `${g.winner.team}’s ${formatPoints1(g.margin)}-point win over ${g.loser.team} in week ${g.week} is ${place(c.rank, 'biggest blowout')} ${scope}.`;
    }
    case 'closest': {
      const g = e as GameEntry;
      return g.margin === 0
        ? `${g.winner.team} and ${g.loser.team} tied in week ${g.week}, ${place(c.rank, 'closest game')} ${scope}.`
        : `${g.winner.team}’s ${formatPoints1(g.margin)}-point win over ${g.loser.team} in week ${g.week} is ${place(c.rank, 'closest game')} ${scope}.`;
    }
  }
}

/** A record as win-loss(-tie). */
export const recordText = (w: number, l: number, t: number) => `${w}–${l}${t ? `–${t}` : ''}`;

/** ".750" style win percentage */
export const pctText = (x: number) => (x >= 1 ? '1.000' : x.toFixed(3).replace(/^0/, ''));

export const ROUND_NAMES = (round: number | undefined, kind: 'regular' | 'playoff') => (kind === 'playoff' ? `playoffs${round ? `, round ${round}` : ''}` : 'regular season');
