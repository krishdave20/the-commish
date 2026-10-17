/* Fetch everything the reference's load() fetches, through the data layer, and return it raw.

   Inputs are only `leagueId` and `userId`; nothing else is looked up by name or hard-coded. Week ranges come
   from planPull (a mirror of the reference). `asOf` is the OLDEST piece's fetch time, so "data as of" never
   overstates how fresh the model is. */
import type { FetchOpts, Fetched } from '../data/contract.ts';
import { planPull } from '../data/plan.ts';
import type { SleeperClient } from '../data/sleeper.ts';
import type { Matchup, ProjectionRow, TrendingRow, WeekStats } from '../data/types.ts';
import type { ByWeek, LeaguePull } from './types.ts';

export interface LoadProgress { done: number; total: number; label: string }

export interface LoadOpts {
  /** skip fresh cache copies */
  force?: boolean;
  onProgress?: (p: LoadProgress) => void;
}

export async function loadLeaguePull(
  sleeper: SleeperClient,
  ids: { leagueId: string; userId: string },
  opts: LoadOpts = {},
): Promise<LeaguePull> {
  const o: FetchOpts = { force: opts.force };
  const pieces: Array<Fetched<unknown>> = [];
  let done = 0, total = 2;
  const tick = (label: string) => { done++; opts.onProgress?.({ done, total, label }); };
  const take = async <T>(p: Promise<Fetched<T>>, label: string): Promise<T> => {
    const f = await p;
    pieces.push(f);
    tick(label);
    return f.data;
  };

  const [state, league] = await Promise.all([
    take(sleeper.nflState(o), 'NFL calendar'),
    take(sleeper.league(ids.leagueId, o), 'league'),
  ]);
  const plan = planPull(state, league);
  total = done + 4 + plan.matchWeeks.length + plan.statWeeks.length + plan.calWeeks.length + plan.projWeeks.length;
  const season = plan.season;
  const projWeeks = [...plan.calWeeks, ...plan.projWeeks];

  const [rosters, users, schedule, trending, matchupList, statList, projList] = await Promise.all([
    take(sleeper.rosters(ids.leagueId, o), 'rosters'),
    take(sleeper.users(ids.leagueId, o), 'managers'),
    take(sleeper.schedule(season, o), 'NFL schedule'),
    // trending adds only decorate the waiver list; the model works without them
    take(sleeper.trending('add', 72, 50, o), 'trending adds').catch((): TrendingRow[] => (tick('trending adds'), [])),
    Promise.all(plan.matchWeeks.map((w) => take(sleeper.matchups(ids.leagueId, w, o), `week ${w} matchups`))),
    Promise.all(plan.statWeeks.map((w) => take(sleeper.stats(season, w, o), `week ${w} stats`))),
    Promise.all(projWeeks.map((w) => take(sleeper.projections(season, w, plan.positions, o), `week ${w} projections`))),
  ]);

  const matchups: ByWeek<Matchup[]> = {}, stats: ByWeek<WeekStats> = {}, projections: ByWeek<ProjectionRow[]> = {};
  plan.matchWeeks.forEach((w, i) => { matchups[w] = matchupList[i] ?? []; });
  plan.statWeeks.forEach((w, i) => { stats[w] = statList[i] ?? {}; });
  projWeeks.forEach((w, i) => { projections[w] = projList[i] ?? []; });

  return {
    leagueId: ids.leagueId, userId: ids.userId, state, league, plan, rosters, users, schedule, trending,
    matchups, stats, projections,
    asOf: Math.min(...pieces.map((p) => p.asOf)),
    stale: pieces.some((p) => p.stale),
    errors: pieces.map((p) => p.error).filter((e): e is string => !!e),
  };
}
