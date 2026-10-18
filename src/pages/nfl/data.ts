/* Fetching for the nfl page. Everything goes through the data layer's Sleeper client; the engine (src/engine/nfl) stays pure. */
import type { Fetched, SleeperClient } from '../../data';
import { compactWeek, parseGameRows } from '../../engine/nfl';
import type { NfGame, WeekOfStats } from '../../engine/nfl';

export const LAST_WEEK = 18;

/** One week's games with their extras. A finished week is kept for a day, the week in progress and later weeks for 30 seconds. */
export async function fetchWeekGames(
  sleeper: SleeperClient, season: string, week: number, currentWeek: number, o?: { force?: boolean },
): Promise<Fetched<NfGame[]>> {
  const r = await (week < currentWeek && typeof sleeper.pastScores === 'function' ? sleeper.pastScores(season, week, o) : sleeper.scores(season, week, o));
  return { data: parseGameRows(r.data, week), asOf: r.asOf, fromCache: r.fromCache, stale: r.stale, error: r.error };
}

/** Weeks 1 to `currentWeek - 1`, all at once (finished weeks; the current week comes from the live poller). */
export async function fetchSeasonResults(
  sleeper: SleeperClient, season: string, currentWeek: number, o?: { force?: boolean },
): Promise<Fetched<NfGame[]>> {
  const weeks = Array.from({ length: Math.max(0, currentWeek - 1) }, (_, i) => i + 1);
  const parts = await Promise.all(weeks.map((w) => fetchWeekGames(sleeper, season, w, currentWeek, o)));
  return {
    data: parts.flatMap((p) => p.data),
    asOf: parts.length ? Math.min(...parts.map((p) => p.asOf)) : Date.now(),
    fromCache: parts.length > 0 && parts.every((p) => p.fromCache),
    stale: parts.some((p) => p.stale),
    error: parts.find((p) => p.error)?.error,
  };
}

const SETTLE_MS = 4 * 3_600_000;

/** Weeks 1 to `currentWeek - 1` of stat lines, reduced to what the leaders read. A week's copy is kept for a day, but a copy saved before that
    week's last game ended is partial, so it is fetched again. */
export async function fetchSeasonStats(
  sleeper: SleeperClient, season: string, currentWeek: number, o?: { force?: boolean },
): Promise<Fetched<WeekOfStats[]>> {
  const weeks = Array.from({ length: Math.max(0, currentWeek - 1) }, (_, i) => i + 1);
  const parts = await Promise.all(weeks.map(async (week) => {
    const sc = await sleeper.pastScores(season, week, o).then((r) => r.data, () => []);
    const end = Math.max(0, ...sc.map((g) => g.start_time ?? 0)) + SETTLE_MS;
    let r = await sleeper.pastStats(season, week, o);
    if (r.fromCache && !o?.force && r.asOf < end) r = await sleeper.pastStats(season, week, { force: true });
    return { week, stats: compactWeek(r.data), r };
  }));
  return {
    data: parts.map(({ week, stats }) => ({ week, stats })),
    asOf: parts.length ? Math.min(...parts.map((p) => p.r.asOf)) : Date.now(),
    fromCache: parts.length > 0 && parts.every((p) => p.r.fromCache),
    stale: parts.some((p) => p.r.stale),
    error: parts.find((p) => p.r.error)?.r.error,
  };
}
