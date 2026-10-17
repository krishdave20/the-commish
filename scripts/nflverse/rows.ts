/* Turns raw CSV records into the small typed rows the aggregation needs. Everything not read here is dropped
   as soon as it is parsed, which is what keeps memory flat on the 370-column pbp file. */
import { normalizeTeam } from '../../src/data/ids.ts';
import { flag, int, num, str, type Rec } from './csv.ts';

/** One regular-season pbp row that has an offense. `type` is nflverse `play_type`. */
export interface Play {
  gameId: string;
  playId: number;
  week: number;
  team: string;
  opp: string | null;
  type: string;
  /** yardline_100: yards from the opponent's end zone */
  yl: number | null;
  air: number | null;
  passAtt: boolean;
  rushAtt: boolean;
  sack: boolean;
  scramble: boolean;
  dropback: boolean;
  twoPt: boolean;
  complete: boolean;
  receiver: string | null;
  rusher: string | null;
  recYds: number;
  rushYds: number;
  passTd: boolean;
  rushTd: boolean;
}

export function toPlay(r: Rec): Play | null {
  if (r.season_type !== 'REG') return null;
  const team = normalizeTeam(r.posteam);
  if (!team) return null;
  return {
    gameId: r.game_id,
    playId: int(r.play_id),
    week: int(r.week),
    team,
    opp: normalizeTeam(r.defteam),
    type: r.play_type,
    yl: num(r.yardline_100),
    air: num(r.air_yards),
    passAtt: flag(r.pass_attempt),
    rushAtt: flag(r.rush_attempt),
    sack: flag(r.sack),
    scramble: flag(r.qb_scramble),
    dropback: flag(r.qb_dropback),
    twoPt: flag(r.two_point_attempt),
    complete: flag(r.complete_pass),
    receiver: str(r.receiver_player_id),
    rusher: str(r.rusher_player_id),
    recYds: int(r.receiving_yards),
    rushYds: int(r.rushing_yards),
    passTd: flag(r.pass_touchdown),
    rushTd: flag(r.rush_touchdown),
  };
}

/** A pass play that counts as a pass attempt for team totals: sacks, spikes, two-point tries and penalty-wiped plays excluded. */
export const isPassAttempt = (p: Play) => p.type === 'pass' && p.passAtt && !p.sack && !p.twoPt;
/** A target: a counted pass attempt with an intended receiver (throwaways have none). */
export const isTarget = (p: Play) => isPassAttempt(p) && p.receiver !== null;
/** A run play: kneels and two-point tries excluded, QB scrambles included. */
export const isRun = (p: Play) => p.type === 'run' && p.rushAtt && !p.twoPt;
/** A dropback: pass attempts, sacks and scrambles. */
export const isDropback = (p: Play) => !p.twoPt && p.dropback && (p.type === 'pass' || (p.type === 'run' && p.scramble));

export interface Ftn {
  playAction: boolean;
  screen: boolean;
  catchable: boolean;
  contested: boolean;
  drop: boolean;
  blitzers: number;
  rushers: number;
  box: number;
}
export const ftnKey = (gameId: string, playId: number | string) => `${gameId}|${playId}`;

export function toFtn(r: Rec): [string, Ftn] | null {
  if (!r.nflverse_game_id || !r.nflverse_play_id) return null;
  return [ftnKey(r.nflverse_game_id, int(r.nflverse_play_id)), {
    playAction: flag(r.is_play_action),
    screen: flag(r.is_screen_pass),
    catchable: flag(r.is_catchable_ball),
    contested: flag(r.is_contested_ball),
    drop: flag(r.is_drop),
    blitzers: int(r.n_blitzers),
    rushers: int(r.n_pass_rushers),
    box: int(r.n_defense_box),
  }];
}

export interface SnapRow {
  gameId: string;
  week: number;
  team: string;
  opp: string | null;
  pfr: string;
  name: string;
  pos: string;
  snaps: number;
}

export function toSnap(r: Rec): SnapRow | null {
  if (r.game_type && r.game_type !== 'REG') return null;
  const team = normalizeTeam(r.team);
  if (!team || !r.pfr_player_id) return null;
  return { gameId: r.game_id, week: int(r.week), team, opp: normalizeTeam(r.opponent), pfr: r.pfr_player_id, name: r.player, pos: r.position, snaps: int(r.offense_snaps) };
}

export interface Participation {
  gameId: string;
  playId: number;
  /** gsis ids on the field for the offense */
  off: string[];
  /** position of each, aligned with `off` (play-specific: WR, TE, RB, FB, QB, T, G, C...) */
  pos: string[];
  man: boolean | null;
  shell: string | null;
}

export function toParticipation(r: Rec): Participation | null {
  if (!r.nflverse_game_id) return null;
  const mz = r.defense_man_zone_type;
  return {
    gameId: r.nflverse_game_id,
    playId: int(r.play_id),
    off: r.offense_players ? r.offense_players.split(';') : [],
    pos: r.offense_positions ? r.offense_positions.split(';') : [],
    man: mz === 'MAN_COVERAGE' ? true : mz === 'ZONE_COVERAGE' ? false : null,
    shell: str(r.defense_coverage_type),
  };
}

/** players.csv row, trimmed */
export interface PlayersCsvRow {
  gsis: string;
  pfr: string | null;
  espn: string | null;
  name: string;
  team: string | null;
  pos: string | null;
  birth: string | null;
}

export function toPlayersCsv(r: Rec): PlayersCsvRow | null {
  if (!r.gsis_id) return null;
  return {
    gsis: r.gsis_id,
    pfr: str(r.pfr_id),
    espn: str(r.espn_id),
    name: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(' '),
    team: normalizeTeam(r.latest_team),
    pos: str(r.position),
    birth: str(r.birth_date),
  };
}

/** Participation rows from a record stream (the 49 MB file is never held whole). */
export async function* participationRows(rows: AsyncIterable<Rec>): AsyncGenerator<Participation> {
  for await (const r of rows) {
    const p = toParticipation(r);
    if (p) yield p;
  }
}

/** Every dropback of a season keyed gameId|playId: what coverage needs to know about a participation row's play. */
export function dropbackMap(plays: Iterable<Play>): Map<string, Play> {
  const m = new Map<string, Play>();
  for (const p of plays) if (isDropback(p)) m.set(`${p.gameId}|${p.playId}`, p);
  return m;
}
