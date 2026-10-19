/* The record book: the best and worst of everything, each with its season and week. Regular-season games only (a playoff score is
   a different kind of game, so it never sets a regular-season record). Each list is ranked best-first and cut to the top entries. */
import type {
  Callout, CalloutKind, Game, GameEntry, Mark, PlayerWeek, Records, ScoreEntry, SeasonEntry, SeasonOutcome, StreakEntry,
} from './types.ts';

export const TOP = 5;

/** Both teams' sides of a game, as ranked entries. */
export function entriesOf(g: Game): [ScoreEntry, ScoreEntry] {
  const mk = (me: Game['a'], op: Game['b']): ScoreEntry => ({
    season: g.season, week: g.week, mgr: me.mgr, team: me.team, pts: me.pts, oppMgr: op.mgr, oppTeam: op.team, oppPts: op.pts,
    margin: Math.abs(me.pts - op.pts), won: g.winner === me.mgr,
  });
  return [mk(g.a, g.b), mk(g.b, g.a)];
}

/** A game as one entry: winner on top (the first side wins a tie, so a tie has a stable order). */
export function gameEntryOf(g: Game): GameEntry {
  const [x, y] = entriesOf(g);
  const [winner, loser] = g.winner === null ? [x, y] : x.won ? [x, y] : [y, x];
  return { season: g.season, week: g.week, winner, loser, margin: winner.margin };
}

const chrono = (a: Mark, b: Mark) => Number(a.season) - Number(b.season) || a.week - b.week;
const sortBy = <T extends Mark>(xs: T[], key: (x: T) => number, dir: 1 | -1): T[] =>
  xs.slice().sort((a, b) => dir * (key(a) - key(b)) || chrono(a, b));

/** Streaks of consecutive wins (or losses) for each manager, through every season in order. A tie ends both kinds. */
function streaks(games: readonly Game[], kind: 'win' | 'loss'): StreakEntry[] {
  const by = new Map<string, Array<{ at: Mark; result: 'w' | 'l' | 't' }>>();
  for (const g of games) {
    for (const me of [g.a, g.b]) {
      const result = g.winner === null ? 't' : g.winner === me.mgr ? 'w' : 'l';
      by.set(me.mgr, [...(by.get(me.mgr) ?? []), { at: { season: g.season, week: g.week }, result }]);
    }
  }
  const want = kind === 'win' ? 'w' : 'l';
  const out: StreakEntry[] = [];
  for (const [mgr, list] of by) {
    list.sort((a, b) => chrono(a.at, b.at));
    let start = -1;
    const close = (end: number, ongoing: boolean) => {
      if (start >= 0 && end >= start) out.push({ mgr, length: end - start + 1, from: list[start]!.at, to: list[end]!.at, ongoing });
      start = -1;
    };
    list.forEach((x, i) => {
      if (x.result === want) { if (start < 0) start = i; } else close(i - 1, false);
    });
    close(list.length - 1, true);
  }
  return out;
}

function seasonEntries(outcomes: readonly SeasonOutcome[]): { entries: SeasonEntry[]; partial: boolean } {
  const all: SeasonEntry[] = outcomes.flatMap((o) => o.standings.filter((s) => s.w + s.l + s.t > 0).map((s) => ({
    mgr: s.mgr, team: s.team, season: o.season, partial: !o.complete, w: s.w, l: s.l, t: s.t,
    pct: (s.w + s.t / 2) / (s.w + s.l + s.t), pf: s.pf, pa: s.pa,
  })));
  // season-long records compare whole seasons; an unfinished one is used only when there is nothing else
  const done = all.filter((e) => !e.partial);
  return done.length ? { entries: done, partial: false } : { entries: all, partial: true };
}

export function buildRecords(games: readonly Game[], outcomes: readonly SeasonOutcome[]): Records {
  const sides = games.flatMap(entriesOf);
  const ge = games.map(gameEntryOf);
  const { entries: seasonal, partial } = seasonEntries(outcomes);
  const players: PlayerWeek[] = games.flatMap((g) => [g.a, g.b].flatMap((s) => (s.top ? [{
    season: g.season, week: g.week, pid: s.top.pid, pts: s.top.pts, mgr: s.mgr, team: s.team,
  }] : [])));
  const pf = (e: SeasonEntry) => e.pf;
  const by = (xs: StreakEntry[]) => xs.sort((a, b) => b.length - a.length || chrono(a.from, b.from));
  return {
    highestScore: sortBy(sides, (e) => e.pts, -1).slice(0, TOP),
    lowestScore: sortBy(sides, (e) => e.pts, 1).slice(0, TOP),
    biggestBlowout: sortBy(ge, (e) => e.margin, -1).slice(0, TOP),
    closestGame: sortBy(ge, (e) => e.margin, 1).slice(0, TOP),
    mostPointsInLoss: sortBy(sides.filter((e) => e.pts < e.oppPts), (e) => e.pts, -1).slice(0, TOP),
    fewestPointsInWin: sortBy(sides.filter((e) => e.won), (e) => e.pts, 1).slice(0, TOP),
    mostPointsInSeason: seasonal.slice().sort((a, b) => pf(b) - pf(a) || chrono({ season: a.season, week: 0 }, { season: b.season, week: 0 })).slice(0, TOP),
    bestRecord: seasonal.slice().sort((a, b) => b.pct - a.pct || b.pf - a.pf).slice(0, TOP),
    worstRecord: seasonal.slice().sort((a, b) => a.pct - b.pct || a.pf - b.pf).slice(0, TOP),
    longestWinStreak: by(streaks(games, 'win')).slice(0, TOP),
    longestLossStreak: by(streaks(games, 'loss')).slice(0, TOP),
    topPlayerWeek: sortBy(players, (p) => p.pts, -1).slice(0, TOP),
    seasonRecordsPartial: partial,
  };
}

/** Where the latest season's games rank among every game on record. For each kind it reports the season's best entry that makes the top
    `limit` (default ten) of all time, so a quiet season says nothing. */
export function calloutsFor(games: readonly Game[], season: string, limit = 10): Callout[] {
  const sides = games.flatMap(entriesOf);
  const ge = games.map(gameEntryOf);
  const out: Callout[] = [];
  const pick = <T extends Mark>(kind: CalloutKind, all: T[], key: (x: T) => number, dir: 1 | -1) => {
    const sorted = sortBy(all, key, dir);
    const i = sorted.findIndex((e) => e.season === season);
    // a tie shares its rank: two 130-point weeks are both the 4th highest
    const rank = i < 0 ? 0 : sorted.findIndex((e) => key(e) === key(sorted[i]!)) + 1;
    if (i >= 0 && rank <= limit) out.push({ kind, rank, of: sorted.length, entry: sorted[i] as unknown as Callout['entry'] });
  };
  pick('highest', sides, (e) => e.pts, -1);
  pick('lowest', sides, (e) => e.pts, 1);
  pick('blowout', ge, (e) => e.margin, -1);
  pick('closest', ge, (e) => e.margin, 1);
  return out;
}
