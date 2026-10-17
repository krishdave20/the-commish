/* Light hand-written shape guards. They check only the fields the app reads, and for big collections
   only the first few entries, so a guard is cheap even on the 14 MB players file. A guard failing means
   Sleeper (or FantasyCalc) changed something; callers turn that into DataError('shape'). */

import type {
  LeagueUser, NflState, SleeperDraft, SleeperLeague, SleeperRoster, SleeperUser, TradedPick,
} from './contract.ts';
import type {
  DraftPick, FantasyCalcRow, Matchup, PlayersMap, ProjectionRow, ScheduleGame, Transaction, TrendingRow, WeekStats,
} from './types.ts';

export type Guard<T> = (x: unknown) => x is T;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStrNull = (x: unknown) => x === null || x === undefined || isStr(x);
const SAMPLE = 3;

const arrayOf = <T>(item: (x: unknown) => boolean): Guard<T[]> =>
  (x): x is T[] => Array.isArray(x) && x.slice(0, SAMPLE).every(item);

/** object keyed by id whose first few values pass `item` */
const mapOf = <T>(item: (x: unknown) => boolean): Guard<Record<string, T>> =>
  (x): x is Record<string, T> => {
    if (!isObj(x)) return false;
    let n = 0;
    for (const k in x) { if (!item(x[k])) return false; if (++n >= SAMPLE) break; }
    return true;
  };

const nflState = (x: unknown) => isObj(x) && isNum(x.week) && isStr(x.season) && isStr(x.season_type);
const user = (x: unknown) => isObj(x) && isStr(x.user_id) && isStr(x.display_name);
const league = (x: unknown) =>
  isObj(x) && isStr(x.league_id) && isStr(x.name) && isStr(x.season) && isNum(x.total_rosters) &&
  Array.isArray(x.roster_positions) && isObj(x.scoring_settings) && isObj(x.settings);
const roster = (x: unknown) => isObj(x) && isNum(x.roster_id) && isObj(x.settings) && (x.players === null || Array.isArray(x.players));
const leagueUser = (x: unknown) => isObj(x) && isStr(x.user_id) && isStr(x.display_name);
const draft = (x: unknown) => isObj(x) && isStr(x.draft_id) && isStr(x.status) && isStr(x.season);
const tradedPick = (x: unknown) => isObj(x) && isStr(x.season) && isNum(x.round) && isNum(x.roster_id) && isNum(x.owner_id);
const player = (x: unknown) => isObj(x) && (x.player_id === undefined || isStr(x.player_id)) && isStrNull(x.team) && isStrNull(x.position);
const statLine = (x: unknown) => isObj(x);
const projection = (x: unknown) => isObj(x) && isStr(x.player_id) && isObj(x.stats);
const game = (x: unknown) => isObj(x) && isNum(x.week) && isStr(x.home) && isStr(x.away);
const trending = (x: unknown) => isObj(x) && isStr(x.player_id) && isNum(x.count);
const matchup = (x: unknown) => isObj(x) && isNum(x.roster_id) && isNum(x.points);
const transaction = (x: unknown) => isObj(x) && isStr(x.transaction_id) && isStr(x.type) && isStr(x.status);
const pick = (x: unknown) => isObj(x) && isNum(x.round) && isNum(x.pick_no) && isStr(x.player_id);
const fcRow = (x: unknown) => isObj(x) && isObj(x.player) && isNum(x.value);

export const shapes = {
  nflState: nflState as Guard<NflState>,
  user: user as Guard<SleeperUser>,
  leagues: arrayOf<SleeperLeague>(league),
  league: league as Guard<SleeperLeague>,
  rosters: arrayOf<SleeperRoster>(roster),
  leagueUsers: arrayOf<LeagueUser>(leagueUser),
  drafts: arrayOf<SleeperDraft>(draft),
  draft: draft as Guard<SleeperDraft>,
  tradedPicks: arrayOf<TradedPick>(tradedPick),
  players: mapOf<PlayersMap[string]>(player) as Guard<PlayersMap>,
  weekStats: mapOf<WeekStats[string]>(statLine) as Guard<WeekStats>,
  projections: arrayOf<ProjectionRow>(projection),
  schedule: arrayOf<ScheduleGame>(game),
  trending: arrayOf<TrendingRow>(trending),
  matchups: arrayOf<Matchup>(matchup),
  transactions: arrayOf<Transaction>(transaction),
  draftPicks: arrayOf<DraftPick>(pick),
  fantasyCalc: arrayOf<FantasyCalcRow>(fcRow),
};
