/* The almanac for one league: every season's outcome, the all-time table, the record book, this season against history, and the rivalries. Pure. */
import { buildManagers, rosterIndex } from './managers.ts';
import { buildRecords, calloutsFor } from './records.ts';
import { buildRivalries } from './rivalries.ts';
import { outcomeOf } from './seasons.ts';
import { allTimeStandings } from './standings.ts';
import { playoffGames, regularGames } from './games.ts';
import type { AllTimeRow, Callout, Game, HistoryData, ManagerMap, Records, SeasonOutcome } from './types.ts';
import type { Rivalries } from './rivalries.ts';

export interface Almanac {
  managers: ManagerMap;
  /** newest season first */
  outcomes: SeasonOutcome[];
  allTime: AllTimeRow[];
  records: Records;
  /** the latest season's place in history (empty when it has no standout games) */
  callouts: Callout[];
  /** every regular-season game, oldest first */
  games: Game[];
  rivalries: Rivalries;
  /** the latest season in the chain */
  current: { season: string; leagueId: string; complete: boolean; throughWeek: number };
  /** more than one season is on record */
  hasHistory: boolean;
  /** no game has been played yet */
  empty: boolean;
  /** weeks that could not be loaded, as "2024 wk 3" */
  missing: string[];
}

export function buildAlmanac(history: HistoryData): Almanac {
  const seasons = history.seasons.slice().sort((a, b) => Number(a.season) - Number(b.season));
  const managers = buildManagers(seasons);
  const regular: Game[] = [];
  const playoff: Game[] = [];
  const outcomes: SeasonOutcome[] = [];
  for (const s of seasons) {
    const idx = rosterIndex(s);
    const reg = regularGames(s, idx);
    regular.push(...reg);
    playoff.push(...playoffGames(s, idx));
    outcomes.push(outcomeOf(s, idx, reg));
  }
  const latest = seasons[seasons.length - 1];
  const person = (m: string) => managers.has(m) && !managers.get(m)!.vacant;
  return {
    managers,
    outcomes: outcomes.slice().reverse(),
    allTime: allTimeStandings(outcomes, managers).filter((r) => person(r.mgr)),
    records: buildRecords(regular, outcomes),
    callouts: latest ? calloutsFor(regular, latest.season) : [],
    games: regular,
    rivalries: buildRivalries([...regular, ...playoff], person),
    current: { season: latest?.season ?? '', leagueId: latest?.leagueId ?? '', complete: latest?.complete ?? false, throughWeek: latest?.throughWeek ?? 0 },
    hasHistory: seasons.length > 1,
    empty: regular.length === 0,
    missing: seasons.flatMap((s) => s.missingWeeks.map((w) => `${s.season} wk ${w}`)),
  };
}
