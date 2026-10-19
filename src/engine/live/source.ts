/* A LiveSource answers "what is the league's week like right now?". The real source asks Sleeper; the replay source (replay.ts)
   plays a finished week back. Both go through the same poller and the same reducer (feed.ts), so a replay exercises exactly
   the code a game day does. Same idea as the draft room's PickSource. */
import type { Matchup, ScheduleGame, ScoreGame } from '../../data/types.ts';
import type { Loaded } from '../../data/sleeper.ts';
import type { FetchOpts } from '../../data/contract.ts';
import { gamesFromSchedule, parseScores } from './scores.ts';
import type { LiveRow, LiveSnapshot, NflGame } from './types.ts';

export interface LiveSource {
  kind: 'live' | 'replay';
  poll(o?: { force?: boolean }): Promise<LiveSnapshot>;
}

interface Reader {
  liveMatchups(id: string, week: number, o?: FetchOpts): Promise<Loaded<Matchup[]>>;
  scores(season: string, week: number, o?: FetchOpts): Promise<Loaded<ScoreGame[]>>;
  schedule(season: string, o?: FetchOpts): Promise<Loaded<ScheduleGame[]>>;
}

export function rowsFromMatchups(list: readonly Matchup[]): LiveRow[] {
  return list.map((m) => {
    const starters = m.starters ?? [];
    const pp = m.players_points ?? {};
    return {
      rid: m.roster_id,
      matchupId: m.matchup_id ?? null,
      points: m.points ?? 0,
      starters,
      startersPoints: starters.map((pid, i) => m.starters_points?.[i] ?? pp[pid] ?? 0),
      players: m.players ?? Object.keys(pp),
      playersPoints: pp,
    };
  });
}

/** Sleeper's matchups and NFL scores for one week. `force` skips the 30 s cache (the poller passes it on every tick).
    If the scores feed is down the plain schedule (statuses only) stands in; if that is down too, `gamesKnown` is false. */
export function liveSource(reader: Reader, o: { leagueId: string; season: string; week: number; now?: () => number }): LiveSource {
  const now = o.now ?? Date.now;
  return {
    kind: 'live',
    async poll(opts) {
      const f: FetchOpts = { force: !!opts?.force };
      const [m, s] = await Promise.all([
        reader.liveMatchups(o.leagueId, o.week, f),
        reader.scores(o.season, o.week, f).then((r) => r.data, () => null),
      ]);
      let games: NflGame[] = s ? parseScores(s) : [];
      if (games.length === 0) {
        const sched = await reader.schedule(o.season, f).then((r) => gamesFromSchedule(r.data, o.week), () => []);
        if (sched.length) games = sched;
      }
      const t = now();
      return { week: o.week, at: Math.max(t, 0), clock: t, kind: 'live', rows: rowsFromMatchups(m.data), games, gamesKnown: games.length > 0 };
    },
  };
}

interface PastReader {
  liveMatchups(id: string, week: number, o?: FetchOpts): Promise<Loaded<Matchup[]>>;
  scores(season: string, week: number, o?: FetchOpts): Promise<Loaded<ScoreGame[]>>;
  /** a finished week's scores, kept for a day */
  pastScores?(season: string, week: number, o?: FetchOpts): Promise<Loaded<ScoreGame[]>>;
}

/** One finished week, read once: its matchups and its NFL games (all final). Same snapshot shape as a live poll, so the same derivations apply. */
export function pastWeekSource(reader: PastReader, o: { leagueId: string; season: string; week: number; now?: () => number }): LiveSource {
  const now = o.now ?? Date.now;
  return {
    kind: 'live',
    async poll() {
      const [m, s] = await Promise.all([
        reader.liveMatchups(o.leagueId, o.week),
        (typeof reader.pastScores === 'function' ? reader.pastScores(o.season, o.week) : reader.scores(o.season, o.week)).then((r) => r.data, () => null),
      ]);
      const games: NflGame[] = s ? parseScores(s) : [];
      const t = now();
      return { week: o.week, at: t, clock: t, kind: 'live', rows: rowsFromMatchups(m.data), games, gamesKnown: games.length > 0 };
    },
  };
}
