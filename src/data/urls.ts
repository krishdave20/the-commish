/* Every URL the app talks to, built in one place so the client, the health checks, the fixture
   capture script and the fixture transport all agree byte for byte. Pure: no DOM, no imports
   beyond types, so Node scripts can use it. */
import type { TrendingType } from './types.ts';

export const SLEEPER_BASE = 'https://api.sleeper.app';
export const FANTASYCALC_BASE = 'https://api.fantasycalc.com';
export const NFLVERSE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/';

export const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const IDP_POSITIONS = ['DL', 'LB', 'DB'];
const IDP_SLOTS = ['DL', 'LB', 'DB', 'IDP_FLEX'];

/** Positions to request from the projection endpoints: IDP only when the league starts IDP slots (as the reference engine does). */
export function positionsFor(rosterPositions: string[] | null | undefined): string[] {
  const idp = (rosterPositions ?? []).some((s) => IDP_SLOTS.includes(s));
  return idp ? [...OFFENSE_POSITIONS, ...IDP_POSITIONS] : OFFENSE_POSITIONS;
}

const posQuery = (positions: string[]) => positions.map((p) => `position[]=${p}`).join('&');
const B = SLEEPER_BASE;

export const sleeperUrls = {
  state: () => `${B}/v1/state/nfl`,
  user: (username: string) => `${B}/v1/user/${encodeURIComponent(username)}`,
  userLeagues: (userId: string, season: string) => `${B}/v1/user/${userId}/leagues/nfl/${season}`,
  league: (id: string) => `${B}/v1/league/${id}`,
  rosters: (id: string) => `${B}/v1/league/${id}/rosters`,
  users: (id: string) => `${B}/v1/league/${id}/users`,
  matchups: (id: string, week: number) => `${B}/v1/league/${id}/matchups/${week}`,
  transactions: (id: string, week: number) => `${B}/v1/league/${id}/transactions/${week}`,
  tradedPicks: (id: string) => `${B}/v1/league/${id}/traded_picks`,
  drafts: (id: string) => `${B}/v1/league/${id}/drafts`,
  draft: (draftId: string) => `${B}/v1/draft/${draftId}`,
  draftPicks: (draftId: string) => `${B}/v1/draft/${draftId}/picks`,
  draftTradedPicks: (draftId: string) => `${B}/v1/draft/${draftId}/traded_picks`,
  players: () => `${B}/v1/players/nfl`,
  trending: (type: TrendingType, lookbackHours = 24, limit = 50) =>
    `${B}/v1/players/nfl/trending/${type}?lookback_hours=${lookbackHours}&limit=${limit}`,
  /* undocumented */
  stats: (season: string, week: number, seasonType: 'regular' | 'post' | 'pre' = 'regular') =>
    `${B}/v1/stats/nfl/${seasonType}/${season}/${week}`,
  projections: (season: string, week: number, positions: string[] = OFFENSE_POSITIONS) =>
    `${B}/projections/nfl/${season}/${week}?season_type=regular&${posQuery(positions)}`,
  seasonProjections: (season: string, positions: string[] = OFFENSE_POSITIONS) =>
    `${B}/projections/nfl/${season}?season_type=regular&${posQuery(positions)}`,
  schedule: (season: string) => `${B}/schedule/nfl/regular/${season}`,
};

export interface FantasyCalcParams { isDynasty: boolean; numQbs?: 1 | 2; numTeams?: number; ppr?: number }
export const fantasyCalcUrl = (p: FantasyCalcParams) =>
  `${FANTASYCALC_BASE}/values/current?isDynasty=${p.isDynasty}&numQbs=${p.numQbs ?? 1}&numTeams=${p.numTeams ?? 12}&ppr=${p.ppr ?? 1}`;

export const nflverseUrls = {
  pbp: (season: string) => `${NFLVERSE_BASE}pbp/play_by_play_${season}.csv.gz`,
  snapCounts: (season: string) => `${NFLVERSE_BASE}snap_counts/snap_counts_${season}.csv`,
  ftn: (season: string) => `${NFLVERSE_BASE}ftn_charting/ftn_charting_${season}.csv`,
  participation: (season: string) => `${NFLVERSE_BASE}pbp_participation/pbp_participation_${season}.csv`,
  players: () => `${NFLVERSE_BASE}players/players.csv`,
};
