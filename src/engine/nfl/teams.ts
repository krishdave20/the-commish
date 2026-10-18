/* The 32 NFL teams: facts only (Sleeper's abbreviation, city, nickname, conference and division). Text, no logos, no team colours:
   SPEC section 1 keeps NFL and team marks out of the app. Sleeper writes the Rams as LAR and Washington as WAS, which is why those two are here. */

export type Conference = 'AFC' | 'NFC';
export type DivisionName = 'East' | 'North' | 'South' | 'West';

export interface NflTeam {
  /** Sleeper's abbreviation */
  abbr: string;
  city: string;
  nickname: string;
  conf: Conference;
  division: DivisionName;
}

const t = (abbr: string, city: string, nickname: string, conf: Conference, division: DivisionName): NflTeam => ({ abbr, city, nickname, conf, division });

export const NFL_TEAMS: readonly NflTeam[] = [
  t('BUF', 'Buffalo', 'Bills', 'AFC', 'East'), t('MIA', 'Miami', 'Dolphins', 'AFC', 'East'),
  t('NE', 'New England', 'Patriots', 'AFC', 'East'), t('NYJ', 'New York', 'Jets', 'AFC', 'East'),
  t('BAL', 'Baltimore', 'Ravens', 'AFC', 'North'), t('CIN', 'Cincinnati', 'Bengals', 'AFC', 'North'),
  t('CLE', 'Cleveland', 'Browns', 'AFC', 'North'), t('PIT', 'Pittsburgh', 'Steelers', 'AFC', 'North'),
  t('HOU', 'Houston', 'Texans', 'AFC', 'South'), t('IND', 'Indianapolis', 'Colts', 'AFC', 'South'),
  t('JAX', 'Jacksonville', 'Jaguars', 'AFC', 'South'), t('TEN', 'Tennessee', 'Titans', 'AFC', 'South'),
  t('DEN', 'Denver', 'Broncos', 'AFC', 'West'), t('KC', 'Kansas City', 'Chiefs', 'AFC', 'West'),
  t('LV', 'Las Vegas', 'Raiders', 'AFC', 'West'), t('LAC', 'Los Angeles', 'Chargers', 'AFC', 'West'),
  t('DAL', 'Dallas', 'Cowboys', 'NFC', 'East'), t('NYG', 'New York', 'Giants', 'NFC', 'East'),
  t('PHI', 'Philadelphia', 'Eagles', 'NFC', 'East'), t('WAS', 'Washington', 'Commanders', 'NFC', 'East'),
  t('CHI', 'Chicago', 'Bears', 'NFC', 'North'), t('DET', 'Detroit', 'Lions', 'NFC', 'North'),
  t('GB', 'Green Bay', 'Packers', 'NFC', 'North'), t('MIN', 'Minnesota', 'Vikings', 'NFC', 'North'),
  t('ATL', 'Atlanta', 'Falcons', 'NFC', 'South'), t('CAR', 'Carolina', 'Panthers', 'NFC', 'South'),
  t('NO', 'New Orleans', 'Saints', 'NFC', 'South'), t('TB', 'Tampa Bay', 'Buccaneers', 'NFC', 'South'),
  t('ARI', 'Arizona', 'Cardinals', 'NFC', 'West'), t('LAR', 'Los Angeles', 'Rams', 'NFC', 'West'),
  t('SF', 'San Francisco', '49ers', 'NFC', 'West'), t('SEA', 'Seattle', 'Seahawks', 'NFC', 'West'),
];

export const NFL_TEAM: Readonly<Record<string, NflTeam>> = Object.fromEntries(NFL_TEAMS.map((x) => [x.abbr, x]));

export const CONFERENCES: readonly Conference[] = ['AFC', 'NFC'];
export const DIVISION_ORDER: readonly DivisionName[] = ['East', 'North', 'South', 'West'];

/** A few feeds still write an old code (the players file has OAK, Sleeper's older exports JAC and LA); all map to today's. */
const ALIASES: Record<string, string> = { JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR', WSH: 'WAS' };

export function teamOf(abbr: string | null | undefined): NflTeam | null {
  if (!abbr) return null;
  const up = abbr.toUpperCase();
  return NFL_TEAM[up] ?? NFL_TEAM[ALIASES[up] ?? ''] ?? null;
}

/** "Kansas City" for KC; an unknown code reads as itself. */
export const cityOf = (abbr: string): string => teamOf(abbr)?.city ?? abbr;
/** "Chiefs" for KC. */
export const nicknameOf = (abbr: string): string => teamOf(abbr)?.nickname ?? abbr;
/** "Kansas City Chiefs". */
export const fullName = (abbr: string): string => { const x = teamOf(abbr); return x ? `${x.city} ${x.nickname}` : abbr; };
