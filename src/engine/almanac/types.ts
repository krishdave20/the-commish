/* The league almanac: every number comes from Sleeper (league settings, users, rosters, weekly matchups and the two brackets) for the
   league and each earlier season on its `previous_league_id` chain. These are the plain shapes the pure functions in this folder read. */
import type { BracketRow, Matchup } from '../../data/types.ts';

/** A team in one season. Roster ids change between seasons; `ownerId` (the Sleeper user id) is what ties seasons together. */
export interface SeasonRoster {
  rid: number;
  ownerId: string | null;
  /** Sleeper's own season record, kept for reference (the almanac works from the matchups) */
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
}

export interface SeasonUser {
  userId: string;
  displayName: string;
  avatar: string | null;
  teamName: string | null;
}

/** One season of one league, as loaded from Sleeper. */
export interface SeasonData {
  leagueId: string;
  season: string;
  name: string;
  /** Sleeper's league status: `complete` once the playoffs are over, so nothing in this season changes any more */
  complete: boolean;
  playoffWeekStart: number;
  /** playoff_round_type: 0 one week per round, 1 two-week championship, 2 two weeks every round */
  playoffRoundType: number;
  /** the first scored week (`start_week`; 1 unless the league started late) */
  startWeek: number;
  /** regular-season weeks startWeek..throughWeek are final (the week in progress is not counted) */
  throughWeek: number;
  /** `metadata.latest_league_winner_roster_id`, where Sleeper records it */
  championRid: number | null;
  rosters: SeasonRoster[];
  users: SeasonUser[];
  /** week → that week's matchups. Regular-season weeks 1..throughWeek, plus the playoff weeks of a finished season. */
  matchups: Record<number, Matchup[]>;
  winners: BracketRow[];
  losers: BracketRow[];
  /** weeks that could not be loaded (the almanac says so and works from the rest) */
  missingWeeks: number[];
}

/** Every season of the league, oldest first. */
export interface HistoryData {
  seasons: SeasonData[];
  /** why the chain stopped early, when a earlier season could not be loaded */
  error?: string;
}

/** One person across every season, tied together by Sleeper user id. */
export interface Manager {
  id: string;
  /** display name from the latest season this person was in the league */
  name: string;
  avatar: string | null;
  /** the person's team name in each season, by season */
  teamBySeason: Record<string, string>;
  /** the latest team name */
  team: string;
  seasons: string[];
  /** the roster is open in that season (no owner), so it is not a person */
  vacant: boolean;
}

export type ManagerMap = Map<string, Manager>;

/** Where a game was played. `playoff` games come from the winners bracket (placement games included); consolation games are left out. */
export type GameKind = 'regular' | 'playoff';

export interface Side {
  mgr: string;
  rid: number;
  /** the team's name that season */
  team: string;
  pts: number;
  /** the best starter of the week, from the matchup's `players_points` */
  top?: { pid: string; pts: number };
}

export interface Game {
  season: string;
  week: number;
  kind: GameKind;
  /** the bracket round for a playoff game */
  round?: number;
  a: Side;
  b: Side;
  /** manager id of the winner; null for a tie */
  winner: string | null;
}

export interface Mark { season: string; week: number }

/** One team's side of a game, ranked in a record list. */
export interface ScoreEntry extends Mark {
  mgr: string;
  team: string;
  pts: number;
  oppMgr: string;
  oppTeam: string;
  oppPts: number;
  margin: number;
  won: boolean;
}

export interface GameEntry extends Mark {
  winner: ScoreEntry;
  loser: ScoreEntry;
  margin: number;
}

export interface SeasonEntry {
  mgr: string;
  team: string;
  season: string;
  /** the season is not over, so this is the record so far */
  partial: boolean;
  w: number;
  l: number;
  t: number;
  pct: number;
  pf: number;
  pa: number;
}

export interface StreakEntry {
  mgr: string;
  length: number;
  from: Mark;
  to: Mark;
  /** the streak is still going (the manager's latest game belongs to it) */
  ongoing: boolean;
}

export interface PlayerWeek extends Mark {
  pid: string;
  pts: number;
  mgr: string;
  team: string;
}

export interface StandingRow {
  rid: number;
  mgr: string;
  team: string;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  rank: number;
}

export interface SeasonOutcome {
  season: string;
  leagueId: string;
  name: string;
  complete: boolean;
  /** regular-season standings, best first */
  standings: StandingRow[];
  champion: { mgr: string; team: string; rid: number; source: 'bracket' | 'sleeper' } | null;
  runnerUp: { mgr: string; team: string; rid: number } | null;
  /** the toilet bowl winner: the team that lost every round of a toilet-bowl losers bracket, else the regular season's last place */
  toilet: { mgr: string; team: string; rid: number; source: 'toilet-bowl' | 'last-place' } | null;
  /** managers whose team made the winners bracket (empty until the season is over) */
  playoffTeams: string[];
}

export interface AllTimeRow {
  mgr: string;
  seasons: number;
  w: number;
  l: number;
  t: number;
  games: number;
  /** wins plus half the ties over games */
  pct: number;
  pf: number;
  pa: number;
  titles: number;
  titleSeasons: string[];
  playoffs: number;
  toilets: number;
}

export interface Records {
  highestScore: ScoreEntry[];
  lowestScore: ScoreEntry[];
  biggestBlowout: GameEntry[];
  closestGame: GameEntry[];
  mostPointsInLoss: ScoreEntry[];
  fewestPointsInWin: ScoreEntry[];
  mostPointsInSeason: SeasonEntry[];
  bestRecord: SeasonEntry[];
  worstRecord: SeasonEntry[];
  longestWinStreak: StreakEntry[];
  longestLossStreak: StreakEntry[];
  topPlayerWeek: PlayerWeek[];
  /** the seasons the season-long records come from are unfinished (no earlier season was complete) */
  seasonRecordsPartial: boolean;
}

export type CalloutKind = 'highest' | 'lowest' | 'blowout' | 'closest';

/** "this season so far against history": where this season's best (or worst) games rank among every game on record. */
export interface Callout {
  kind: CalloutKind;
  /** 1 is the record */
  rank: number;
  of: number;
  entry: ScoreEntry | GameEntry;
}

export interface Meeting extends Mark {
  kind: GameKind;
  round?: number;
  aPts: number;
  bPts: number;
  /** manager id of the winner; null for a tie */
  winner: string | null;
}

/** A series between two managers, told from `a`'s side. */
export interface Series {
  a: string;
  b: string;
  meetings: Meeting[];
  aWins: number;
  bWins: number;
  ties: number;
  /** average winning margin of all meetings, whoever won */
  avgMargin: number;
  /** average points each side scored */
  aAvg: number;
  bAvg: number;
  /** a's biggest win and b's biggest win */
  biggestA: Meeting | null;
  biggestB: Meeting | null;
  /** who has won the most recent meetings in a row (null: the last one was a tie) and how many */
  streak: { mgr: string | null; length: number };
  playoffMeetings: Meeting[];
}

export interface Rivals {
  /** the opponent with the closest series (at least two meetings) */
  closest: Series | null;
  /** the opponent met most often */
  mostPlayed: Series | null;
}
