/* "Who moves in the standings": the table before a week and the table if that week's results stand, with the model's own seeding rule
   (division winners first, then record, points for breaking ties: `rankTeams`). Pure: records come from the model's history rows (one row per
   team per week, `final` once the week is over), the week in question from the matchups on screen.

   - a live week:  before = the finished weeks; after = before + every matchup that has points on the board, as it stands now ("if it holds")
   - a past week:  before = weeks up to the one before; after = before + that week ("who moved")
   Playoff weeks do not count toward the regular-season table, so they give no moves. */
import { rankTeams } from '../bracket/seeding.ts';
import type { SeedRules, SeedTeam } from '../bracket/seeding.ts';
import type { HistoryRow } from '../types.ts';

export interface StandingTeam { rid: number; name: string; divId: number; isMe: boolean }
export interface WeekResult { a: number; b: number; ptsA: number; ptsB: number }

export interface Record3 { rank: number; wins: number; losses: number; ties: number }

export interface StandingsMove {
  rid: number;
  name: string;
  isMe: boolean;
  before: Record3;
  after: Record3;
  /** places gained (positive) or lost (negative) */
  delta: number;
  /** crossed the playoff line: 'in' moved into a playoff spot, 'out' fell out of one */
  line: 'in' | 'out' | null;
  /** holds a playoff spot after the week */
  inAfter: boolean;
  /** this week's result for the team: 'W', 'L', 'T' or null when it had no game on the board */
  result: 'W' | 'L' | 'T' | null;
}

export const recordText = (r: Pick<Record3, 'wins' | 'losses' | 'ties'>) => `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ''}`;

type Tally = Map<number, { wins: number; losses: number; ties: number; pf: number }>;

function tally(teams: readonly StandingTeam[], rows: readonly HistoryRow[], beforeWeek: number): Tally {
  const t: Tally = new Map(teams.map((x) => [x.rid, { wins: 0, losses: 0, ties: 0, pf: 0 }]));
  for (const r of rows) {
    if (r.week >= beforeWeek || !r.final) continue;
    const row = t.get(r.rid);
    if (!row) continue;
    row.pf += r.pts;
    if (r.pts > r.oppPts) row.wins++; else if (r.pts < r.oppPts) row.losses++; else row.ties++;
  }
  return t;
}

const seedTeams = (teams: readonly StandingTeam[], t: Tally): SeedTeam[] => teams.map((x) => ({ rid: x.rid, divId: x.divId, ...t.get(x.rid)! }));

export interface MovesInput {
  teams: readonly StandingTeam[];
  history: readonly HistoryRow[];
  /** the week in question */
  week: number;
  lastRegularWeek: number;
  /** the matchups of that week that have points on the board */
  results: readonly WeekResult[];
  rules: SeedRules;
}

export function standingsMoves(i: MovesInput): StandingsMove[] {
  if (i.week > i.lastRegularWeek || i.week < 1 || i.teams.length === 0) return [];
  const before = tally(i.teams, i.history, i.week);
  const after: Tally = new Map([...before].map(([k, v]) => [k, { ...v }]));
  const result = new Map<number, 'W' | 'L' | 'T'>();
  for (const r of i.results) {
    const a = after.get(r.a), b = after.get(r.b);
    if (!a || !b) continue;
    a.pf += r.ptsA; b.pf += r.ptsB;
    if (r.ptsA > r.ptsB) { a.wins++; b.losses++; result.set(r.a, 'W'); result.set(r.b, 'L'); }
    else if (r.ptsA < r.ptsB) { b.wins++; a.losses++; result.set(r.b, 'W'); result.set(r.a, 'L'); }
    else { a.ties++; b.ties++; result.set(r.a, 'T'); result.set(r.b, 'T'); }
  }
  const rankOf = (t: Tally) => new Map(rankTeams(seedTeams(i.teams, t), i.rules).map((rid, k) => [rid, k + 1]));
  const rb = rankOf(before), ra = rankOf(after);
  const n = i.rules.playoffTeams;
  return i.teams.map((x): StandingsMove => {
    const b = before.get(x.rid)!, a = after.get(x.rid)!;
    const rankBefore = rb.get(x.rid)!, rankAfter = ra.get(x.rid)!;
    const wasIn = rankBefore <= n, isIn = rankAfter <= n;
    return {
      rid: x.rid, name: x.name, isMe: x.isMe,
      before: { rank: rankBefore, wins: b.wins, losses: b.losses, ties: b.ties },
      after: { rank: rankAfter, wins: a.wins, losses: a.losses, ties: a.ties },
      delta: rankBefore - rankAfter, line: !wasIn && isIn ? 'in' : wasIn && !isIn ? 'out' : null, inAfter: isIn,
      result: result.get(x.rid) ?? null,
    };
  }).sort((p, q) => p.after.rank - q.after.rank);
}

/** Only the teams whose place or playoff status changed. */
export const moved = (moves: readonly StandingsMove[]) => moves.filter((m) => m.delta !== 0 || m.line !== null);
