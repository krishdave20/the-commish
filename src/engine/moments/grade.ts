/* The grade of a finished draft: every team's best projected lineup from the players it actually drafted, ranked (the mock draft's grade, on
   the real picks). Pure. */
import { gradeRosters } from '../draft/mock.ts';
import type { RankedPlayer, Rankings } from '../draft/rankings.ts';
import type { DraftPick } from '../../data/types.ts';

export function draftGradeFromPicks(rankings: Rankings, picks: readonly Pick<DraftPick, 'player_id' | 'roster_id'>[], myRosterId: number): { letter: string; rank: number; teams: number } | null {
  const rosters: Record<number, RankedPlayer[]> = {};
  for (const p of picks) {
    const r = rankings.byPid[p.player_id];
    if (!r || p.roster_id == null) continue;
    (rosters[p.roster_id] ??= []).push(r);
  }
  if (!rosters[myRosterId] || Object.keys(rosters).length < 2) return null;
  const g = gradeRosters(rosters, rankings.slots, myRosterId);
  return { letter: g.letter, rank: g.rank, teams: g.teams };
}
