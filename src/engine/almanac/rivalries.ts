/* Head to head. Every game between two managers, regular season and playoffs, as a series: the record, the average margin, each side's
   biggest win, the current streak and the playoff meetings. The matrix reads these series; "your rivals" picks two of them. */
import type { Game, Meeting, Rivals, Series } from './types.ts';

const chrono = (a: Meeting, b: Meeting) => Number(a.season) - Number(b.season) || a.week - b.week || (a.kind === 'playoff' ? 1 : 0) - (b.kind === 'playoff' ? 1 : 0);

export interface Rivalries {
  /** the series between two managers, told from the first one's side; null when they never met */
  get(a: string, b: string): Series | null;
  /** every series that has at least one meeting, told from each pair's lexically first side */
  all: Series[];
  /** the managers that have met someone */
  managers: string[];
}

/** A series from `a`'s side, built from meetings already stored from a's side. */
function seriesOf(a: string, b: string, meetings: Meeting[]): Series {
  const ms = meetings.slice().sort(chrono);
  let aWins = 0, bWins = 0, ties = 0, margin = 0, aSum = 0, bSum = 0;
  let biggestA: Meeting | null = null, biggestB: Meeting | null = null;
  for (const m of ms) {
    aSum += m.aPts; bSum += m.bPts; margin += Math.abs(m.aPts - m.bPts);
    if (m.winner === a) {
      aWins++;
      if (!biggestA || m.aPts - m.bPts > biggestA.aPts - biggestA.bPts) biggestA = m;
    } else if (m.winner === b) {
      bWins++;
      if (!biggestB || m.bPts - m.aPts > biggestB.bPts - biggestB.aPts) biggestB = m;
    } else ties++;
  }
  // the streak: who won the latest meetings in a row
  let streak: Series['streak'] = { mgr: null, length: 0 };
  const last = ms[ms.length - 1];
  if (last) {
    let n = 0;
    for (let i = ms.length - 1; i >= 0 && ms[i]!.winner === last.winner; i--) n++;
    streak = { mgr: last.winner, length: n };
  }
  const n = ms.length || 1;
  return {
    a, b, meetings: ms, aWins, bWins, ties, avgMargin: margin / n, aAvg: aSum / n, bAvg: bSum / n,
    biggestA, biggestB, streak, playoffMeetings: ms.filter((m) => m.kind === 'playoff'),
  };
}

/** Flip a series to the other manager's side. */
function flip(s: Series): Series {
  const f = (m: Meeting | null): Meeting | null => (m ? { ...m, aPts: m.bPts, bPts: m.aPts } : null);
  const meetings = s.meetings.map((m) => f(m)!);
  return {
    ...s, a: s.b, b: s.a, meetings, aWins: s.bWins, bWins: s.aWins, aAvg: s.bAvg, bAvg: s.aAvg,
    biggestA: f(s.biggestB), biggestB: f(s.biggestA), playoffMeetings: meetings.filter((m) => m.kind === 'playoff'),
  };
}

export function buildRivalries(games: readonly Game[], keep: (mgr: string) => boolean = () => true): Rivalries {
  const raw = new Map<string, Meeting[]>();
  for (const g of games) {
    if (g.a.mgr === g.b.mgr || !keep(g.a.mgr) || !keep(g.b.mgr)) continue;
    // stored from the lexically first manager's side
    const flipped = g.a.mgr > g.b.mgr;
    const [x, y] = flipped ? [g.b, g.a] : [g.a, g.b];
    const key = `${x.mgr}\u0000${y.mgr}`;
    raw.set(key, [...(raw.get(key) ?? []), {
      season: g.season, week: g.week, kind: g.kind, round: g.round, aPts: x.pts, bPts: y.pts, winner: g.winner,
    }]);
  }
  const all: Series[] = [];
  const byKey = new Map<string, Series>();
  for (const [key, ms] of raw) {
    const [a, b] = key.split('\u0000') as [string, string];
    const s = seriesOf(a, b, ms);
    all.push(s);
    byKey.set(key, s);
  }
  const managers = [...new Set(all.flatMap((s) => [s.a, s.b]))].sort();
  return {
    all, managers,
    get(a, b) {
      if (a === b) return null;
      if (a < b) return byKey.get(`${a}\u0000${b}`) ?? null;
      const s = byKey.get(`${b}\u0000${a}`);
      return s ? flip(s) : null;
    },
  };
}

/** Your closest series (at least two meetings, nearest to even; more meetings break a tie) and the opponent you have played the most. */
export function rivalsOf(r: Rivalries, me: string): Rivals {
  const mine = r.managers.filter((m) => m !== me).map((m) => r.get(me, m)).filter((s): s is Series => !!s);
  const decided = (s: Series) => s.aWins + s.bWins + s.ties;
  const closeness = (s: Series) => Math.abs(s.aWins - s.bWins);
  const closest = mine.filter((s) => decided(s) >= 2)
    .sort((x, y) => closeness(x) - closeness(y) || decided(y) - decided(x) || x.avgMargin - y.avgMargin || x.b.localeCompare(y.b))[0] ?? null;
  // the most meetings; a tie goes to the opponent you met most recently
  const latest = (s: Series) => s.meetings.length ? Number(s.meetings[s.meetings.length - 1]!.season) * 100 + s.meetings[s.meetings.length - 1]!.week : 0;
  const mostPlayed = mine.slice().sort((x, y) => decided(y) - decided(x) || latest(y) - latest(x) || x.b.localeCompare(y.b))[0] ?? null;
  return { closest, mostPlayed };
}
