/* Where an NFL game stands on the field: who has the ball, where, what down, and how the quarters went. Pure: no fetching, no React.

   Source (checked live on Sunday Oct 18, 2026): `metadata` of each game in GET /scores/nfl/regular/{season}/{week}
   - `possession`            team code with the ball ("LAC"), "" between drives
   - `yard_line`             1 to 50: yards from the goal line of `yard_line_territory` (a number, or "" when there is no spot)
   - `yard_line_territory`   whose half of the field the ball is on ("KC"); "" at midfield or with no spot
   - `down`, `down_and_distance`   2 and "2nd & 7" (also "1st & Goal"); "" between plays
   - `red_zone`              the code of the team that is in the red zone, or ""
   - `away_used_timeouts`, `home_used_timeouts`   timeouts used so far (3 per half; 2 in overtime)
   - `*_score_quarter1..4`, `*_score_overtime`   points by period

   THE YARD MAPPING. Sleeper's spot is "yard_line yards from territory's goal line". Two readings of it:
   - from the possession team's own goal line (0 to 100, how far the offense has come):  own = territory === possession ? yard_line : 100 - yard_line
     so 0 is its own goal line, 50 midfield, 99 is one yard from scoring and `100 - own` is the distance to the goal it attacks.
   - on a screen: the field is drawn left to right with the AWAY team's goal line at the left (0) and the HOME team's at the right (100), the way a TV
     broadcast shows it. x = territory === away ? yard_line : 100 - yard_line. The away team attacks the right goal line, so when it has the ball the
     offense moves right; when the home team has it, left.
   Midfield (yard_line 50) is x = 50 in both readings, whichever territory is given (or none). A spot with no territory and not at midfield is unknown (null).
   The red zone is the last 20 yards before the goal the offense attacks: `100 - own <= 20`, or Sleeper's own `red_zone` flag. */
import type { NflGame } from './types.ts';

const TO_GOAL_RED_ZONE = 20;

/** One game's ball and clock situation. Every field is null when the feed has nothing for it (a kickoff, a break between drives). */
export interface GameSituation {
  /** team code with the ball */
  possession: string | null;
  /** 1 to 50 */
  yardLine: number | null;
  /** the half of the field the spot is in */
  territory: string | null;
  /** 1 to 4 */
  down: number | null;
  /** "7", "goal" or null */
  distance: string | null;
  /** "2nd & 7", "" when the feed has none */
  downText: string;
  redZone: boolean;
  /** timeouts left (3 minus used), null when the feed does not say */
  homeTimeouts: number | null;
  awayTimeouts: number | null;
}

/** Points by period. */
export interface LineScore {
  /** "1", "2", "3", "4" and "ot" for each period played so far */
  labels: string[];
  home: number[];
  away: number[];
}

const num = (x: unknown): number | null => {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return null;
};
const code = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim().toUpperCase() : null);

/** "2nd & 7" or "1st & Goal" to its down and distance. */
export function parseDownText(text: string): { down: number; distance: string } | null {
  const m = /^\s*(\d)(?:st|nd|rd|th)?\s*&\s*(goal|inches|\d+)\s*$/i.exec(text);
  return m ? { down: Number(m[1]), distance: m[2]!.toLowerCase() } : null;
}

/** The situation of a game from its feed metadata, or null when there is nothing about the ball at all. */
export function parseSituation(meta: Record<string, unknown> | null | undefined): GameSituation | null {
  if (!meta) return null;
  const possession = code(meta.possession);
  const yardLine = num(meta.yard_line);
  const territory = code(meta.yard_line_territory);
  const downText = typeof meta.down_and_distance === 'string' ? meta.down_and_distance.trim() : '';
  const parsed = parseDownText(downText);
  const down = parsed?.down ?? num(meta.down);
  const redZoneTeam = code(meta.red_zone);
  const left = (used: unknown) => { const u = num(used); return u === null ? null : Math.max(0, 3 - u); };
  const homeTimeouts = left(meta.home_used_timeouts), awayTimeouts = left(meta.away_used_timeouts);
  if (possession === null && yardLine === null && downText === '' && homeTimeouts === null && awayTimeouts === null) return null;
  const s: GameSituation = {
    possession, yardLine: yardLine !== null && yardLine >= 0 && yardLine <= 50 ? yardLine : null, territory,
    down: down !== null && down >= 1 && down <= 4 ? down : null, distance: parsed?.distance ?? null, downText,
    redZone: redZoneTeam !== null, homeTimeouts, awayTimeouts,
  };
  if (!s.redZone) s.redZone = inRedZone(s);
  return s;
}

/* ---------- the yard mapping ---------- */

/** Yards the offense has come from its own goal line, 0 to 100 (see the mapping above). Null with no possession or no usable spot. */
export function yardsFromOwnGoal(s: Pick<GameSituation, 'possession' | 'yardLine' | 'territory'>): number | null {
  if (s.possession === null || s.yardLine === null) return null;
  if (s.yardLine === 50) return 50;
  if (s.territory === null) return null;
  return s.territory === s.possession ? s.yardLine : 100 - s.yardLine;
}

/** Yards to the goal line the offense is attacking. */
export function yardsToGoal(s: Pick<GameSituation, 'possession' | 'yardLine' | 'territory'>): number | null {
  const own = yardsFromOwnGoal(s);
  return own === null ? null : 100 - own;
}

function inRedZone(s: Pick<GameSituation, 'possession' | 'yardLine' | 'territory'>): boolean {
  const toGoal = yardsToGoal(s);
  return toGoal !== null && toGoal <= TO_GOAL_RED_ZONE;
}

/** Where the ball sits on a field drawn left to right with the away team's goal line at 0 and the home team's at 100. */
export function fieldX(s: Pick<GameSituation, 'yardLine' | 'territory'>, game: Pick<NflGame, 'home' | 'away'>): number | null {
  if (s.yardLine === null) return null;
  if (s.yardLine === 50) return 50;
  if (s.territory === null) return null;
  return s.territory === game.away ? s.yardLine : 100 - s.yardLine;
}

/** Which way the offense is going on that field: 'right' when the away team has the ball (it attacks the home goal line at 100), 'left' for the home team. */
export function driveDirection(possession: string | null, game: Pick<NflGame, 'home' | 'away'>): 'right' | 'left' | null {
  if (possession === null) return null;
  if (possession === game.away) return 'right';
  if (possession === game.home) return 'left';
  return null;
}

/* ---------- who is on the field ---------- */

export type Unit = 'offense' | 'defense';
export interface FieldRole {
  /** the unit this player belongs to: a team defense is the defense, everyone else (kickers included) the offense */
  unit: Unit;
  /** that unit is on the field right now */
  onField: boolean;
  /** "on offense", "on defense", or "off the field" */
  label: string;
}

/** Offense or defense, from `possession` against the player's team. A skill player is on offense while his team has the ball; a team defense is the
    reverse, on defense while the OTHER team has it; a kicker counts as offense. Null with no possession (a break between drives) or no team. */
export function fieldRole(pos: string, team: string | null | undefined, possession: string | null | undefined): FieldRole | null {
  if (!team || !possession) return null;
  const has = team.toUpperCase() === possession.toUpperCase();
  const unit: Unit = pos === 'DEF' ? 'defense' : 'offense';
  const onField = unit === 'offense' ? has : !has;
  return { unit, onField, label: onField ? `on ${unit}` : 'off the field' };
}

/* ---------- words ---------- */

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();
const spoken = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** "at kc 44", "at midfield", "" when there is no spot. */
export function spotText(s: Pick<GameSituation, 'yardLine' | 'territory'>): string {
  if (s.yardLine === null) return '';
  if (s.yardLine === 50) return 'at midfield';
  return s.territory === null ? '' : `at ${lower(s.territory)} ${s.yardLine}`;
}

/** "2nd & 7 · at kc 44": what the card shows. Empty between plays. */
export function situationText(s: GameSituation | null | undefined): string {
  if (!s) return '';
  return [s.downText ? lower(s.downText) : '', spotText(s)].filter(Boolean).join(' · ');
}

/** "2nd and 7": the down in words. */
export function downSpoken(s: Pick<GameSituation, 'down' | 'distance' | 'downText'>): string {
  if (s.down === null) return '';
  const d = s.distance;
  return d ? `${spoken(s.down)} and ${d === 'goal' ? 'goal' : d}` : spoken(s.down);
}

/** The mini field's accessible text: "lac on offense, 2nd and 7 at the kc 44, red zone". The team with the ball is the one on offense. */
export function fieldLabel(g: Pick<NflGame, 'home' | 'away'>, s: GameSituation | null | undefined): string {
  if (!s || s.possession === null) return `${lower(g.away)} at ${lower(g.home)}, no ball position right now`;
  const parts = [`${lower(s.possession)} on offense`];
  const down = downSpoken(s);
  const spot = s.yardLine === null ? '' : s.yardLine === 50 ? 'at midfield' : s.territory === null ? '' : `at the ${lower(s.territory)} ${s.yardLine}`;
  if (down || spot) parts.push([down, spot].filter(Boolean).join(' '));
  if (s.redZone) parts.push('red zone');
  return parts.join(', ');
}

/* ---------- the quarters ---------- */

/** Periods played: a final game has all four (and overtime when there was one); a live game has the quarters up to the current one. */
function periodsPlayed(g: NflGame, meta: Record<string, unknown>): number {
  const ot = meta.is_overtime === true || g.quarter.toUpperCase() === 'F/OT' || g.quarter.toUpperCase() === 'OT';
  if (g.state === 'final') return ot ? 5 : 4;
  const q = g.quarter.toUpperCase();
  if (q === 'H' || q === 'HALF' || q === 'HALFTIME') return 2;
  if (q === 'OT') return 5;
  const n = Number(q);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 0;
}

/** The quarter-by-quarter score, or null when it is not there or does not add up to the score on the board
    (a feed that is mid-update must not show numbers that disagree). */
export function lineScore(g: NflGame, meta: Record<string, unknown> | null | undefined): LineScore | null {
  if (!meta || g.state === 'pre' || g.homeScore === null || g.awayScore === null) return null;
  const n = periodsPlayed(g, meta);
  if (n === 0) return null;
  const home: number[] = [], away: number[] = [], labels: string[] = [];
  for (let q = 1; q <= Math.min(n, 4); q++) {
    const h = num(meta[`home_score_quarter${q}`]), a = num(meta[`away_score_quarter${q}`]);
    if (h === null || a === null) return null;
    home.push(h); away.push(a); labels.push(String(q));
  }
  if (n === 5) {
    const h = num(meta.home_score_overtime), a = num(meta.away_score_overtime);
    if (h === null || a === null) return null;
    home.push(h); away.push(a); labels.push('ot');
  }
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  return sum(home) === g.homeScore && sum(away) === g.awayScore ? { labels, home, away } : null;
}
