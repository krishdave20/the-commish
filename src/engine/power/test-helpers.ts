/* A small league for the power-ranking tests: six teams, a few finished weeks of points, and rosters whose strength runs the other way. */
import { handModel } from '../test-helpers.ts';
import type { HistoryRow, Model } from '../types.ts';

export const RIDS = [1, 2, 3, 4, 5, 6];

/** Points per week (rows) for teams 1..6 (columns). Week w pairs 1-2, 3-4, 5-6 when odd and 1-3, 2-5, 4-6 when even. */
export const POINTS: number[][] = [
  [100, 90, 80, 70, 60, 50],
  [100, 90, 80, 70, 60, 50],
  [60, 70, 100, 90, 50, 80],
  [50, 60, 120, 100, 70, 90],
];

const PAIRS_ODD: Array<[number, number]> = [[1, 2], [3, 4], [5, 6]];
const PAIRS_EVEN: Array<[number, number]> = [[1, 3], [2, 5], [4, 6]];

export function historyOf(points: number[][], final: (week: number) => boolean = () => true): HistoryRow[] {
  const rows: HistoryRow[] = [];
  points.forEach((week, i) => {
    const w = i + 1;
    for (const [a, b] of w % 2 ? PAIRS_ODD : PAIRS_EVEN) {
      const pa = week[a - 1]!, pb = week[b - 1]!;
      rows.push({ key: `w${w}-${a}`, week: w, rid: a, opp: b, pts: pa, oppPts: pb, final: final(w) });
      rows.push({ key: `w${w}-${b}`, week: w, rid: b, opp: a, pts: pb, oppPts: pa, final: final(w) });
    }
  });
  return rows;
}

export interface LeagueOpts {
  points?: number[][];
  /** the model's current week (default: one after the last week of points) */
  cur?: number;
  last?: number;
  meRid?: number;
  /** ROS points a week for each team's one QB (default: team 6 strongest, team 1 weakest) */
  mu?: (rid: number) => number;
}

/** One QB per team, slots [QB]: a team's ROS is its QB's weekly points times the weeks left. */
export function league(o: LeagueOpts = {}): Model {
  const points = o.points ?? POINTS;
  const cur = o.cur ?? points.length + 1;
  const m = handModel({
    cur, last: o.last ?? 8, slots: ['QB'], meRid: o.meRid ?? 1,
    teams: RIDS.map((rid) => ({ rid, name: `Team ${rid}` })),
    players: RIDS.map((rid) => ({ pid: `q${rid}`, pos: 'QB' as const, mu: (o.mu ?? ((r) => 10 + 4 * r))(rid), owner: rid, name: `QB ${rid}` })),
  });
  m.history = historyOf(points, (w) => w < cur);
  return m;
}
