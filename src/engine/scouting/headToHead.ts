/* Head to head this season: the finished games between the two teams before `week`, from the model's schedule rows.
   `you` is the side asking, `them` the team being scouted. */
import type { HistoryRow } from '../types.ts';

export interface Meeting { week: number; you: number; them: number; result: 'W' | 'L' | 'T' }
export interface HeadToHead {
  meetings: Meeting[];
  wins: number;
  losses: number;
  ties: number;
  /** "1–0 so far this season" (yours), "no meeting yet this season" */
  summary: string;
}

export function headToHead(input: { you: number; them: number; week: number; history: readonly HistoryRow[]}): HeadToHead {
  const meetings = input.history
    .filter((h) => h.final && h.rid === input.you && h.opp === input.them && h.week < input.week)
    .sort((a, b) => a.week - b.week)
    .map((h): Meeting => ({ week: h.week, you: h.pts, them: h.oppPts, result: h.pts > h.oppPts ? 'W' : h.pts < h.oppPts ? 'L' : 'T' }));
  const wins = meetings.filter((m) => m.result === 'W').length, losses = meetings.filter((m) => m.result === 'L').length;
  const ties = meetings.length - wins - losses;
  const summary = meetings.length ? `${wins}–${losses}${ties ? `–${ties}` : ''} so far this season` : 'no meeting yet this season';
  return { meetings, wins, losses, ties, summary };
}
