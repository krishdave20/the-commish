/* The pure rules of the nfl page's live tab: which games are in the red zone and how that reads, how live games sort, and the fantasy angle
   (your starters and the league's rostered players in each game). No React, no fetching. Everything is derived from the scores feed rows
   (`NfGame`, with the ball's situation) and the model's players; the yard mapping stays in engine/live/situation.ts. */
import { gameStatusText, spotText, yardsToGoal } from '../../engine/live';
import type { StarterLive } from '../../engine/live';
import type { ModelPlayer } from '../../engine/types';
import type { NfGame } from '../../engine/nfl';

const lower = (s: string | null | undefined) => (s ?? '').toLowerCase();
const WORD = ['', 'first', 'second', 'third', 'fourth'];

export const isHalftime = (g: Pick<NfGame, 'quarter'>) => /^(h|half|halftime)$/i.test(g.quarter);

/** The attacking team of a game that is in the red zone: the team with the ball inside the opponent's 20 (Sleeper's `red_zone` flag, or the
    yards to the goal line from the yard mapping, both folded into `situation.redZone` by the parser). Null otherwise, and at the half. */
export function redZoneTeam(g: NfGame): string | null {
  const s = g.situation;
  if (g.state !== 'live' || !s || !s.redZone || s.possession === null || isHalftime(g)) return null;
  return s.possession;
}

/** "at the ari 3": where the ball is, in the words of a broadcast. Empty with no spot. */
export function spotThe(g: NfGame): string {
  const s = g.situation;
  if (!s || s.yardLine === null) return '';
  if (s.yardLine === 50) return 'at midfield';
  return s.territory === null ? '' : `at the ${lower(s.territory)} ${s.yardLine}`;
}

/** "1st & goal at the ari 3", "2nd & 8 at the ari 14": the down and the spot. */
export function downAndSpot(g: NfGame): string {
  const s = g.situation;
  if (!s) return '';
  return [s.downText ? lower(s.downText) : '', spotThe(g)].filter(Boolean).join(' ');
}

/** The sentence a screen reader gets for the badge: "red zone: lar first and goal at the ari 3". */
export function redZoneSpoken(g: NfGame): string {
  const s = g.situation;
  const team = redZoneTeam(g);
  if (!s || team === null) return '';
  const down = s.down !== null ? `${WORD[s.down] ?? ''}${s.distance ? ` and ${s.distance}` : ''}` : '';
  return `red zone: ${[lower(team), down, spotThe(g)].filter(Boolean).join(' ')}`;
}

/** "lar · 1st & goal at the ari 3 · q4 2:01": one red-zone drive as a line. */
export function redZoneLine(g: NfGame): string {
  const team = redZoneTeam(g);
  return [lower(team), downAndSpot(g), gameStatusText(g)].filter(Boolean).join(' · ');
}

/** "lar ball · 1st & 10 at the ari 34": the situation line under a live game's score. Empty between plays and at the half. */
export function situationLine(g: NfGame): string {
  const s = g.situation;
  if (!s || g.state !== 'live' || isHalftime(g)) return '';
  const ball = s.possession !== null ? `${lower(s.possession)} ball` : '';
  const where = s.downText ? downAndSpot(g) : spotText(s) ? spotThe(g) : '';
  return [ball, where].filter(Boolean).join(' · ');
}

/* ---------- sorting ---------- */

/** Points between the two teams; Infinity when a score is missing (such a game sorts last). */
export const margin = (g: Pick<NfGame, 'homeScore' | 'awayScore'>) => (g.homeScore === null || g.awayScore === null ? Infinity : Math.abs(g.homeScore - g.awayScore));

export type LiveSort = 'closest' | 'relevant';

export interface Fantasy {
  /** my starters whose team is in this game, best points first */
  starters: StarterLive[];
  /** every player rostered by a team in my league whose NFL team is in this game (mine included) */
  rostered: number;
}

/** The closest score first; ties go to the game with more played (it matters more), then to the id. */
export function byCloseness(a: NfGame, b: NfGame): number {
  return margin(a) - margin(b) || (b.elapsed ?? 0) - (a.elapsed ?? 0) || a.id.localeCompare(b.id);
}

/** Closest first, or most relevant to your league first: more of your starters, then more rostered players, then closeness. */
export function sortLive(games: readonly NfGame[], mode: LiveSort, fx: ReadonlyMap<string, Fantasy>): NfGame[] {
  const out = [...games];
  if (mode === 'closest') return out.sort(byCloseness);
  return out.sort((a, b) => {
    const fa = fx.get(a.id), fb = fx.get(b.id);
    return (fb?.starters.length ?? 0) - (fa?.starters.length ?? 0) || (fb?.rostered ?? 0) - (fa?.rostered ?? 0) || byCloseness(a, b);
  });
}

/** Your starters and the league's rostered players for each game (empty maps when there is nothing to count). */
export function fantasyByGame(games: readonly NfGame[], starters: readonly StarterLive[], players: readonly ModelPlayer[]): Map<string, Fantasy> {
  const rostered = new Map<string, number>();
  for (const p of players) if (p.ownerRid > 0 && p.nfl) rostered.set(p.nfl, (rostered.get(p.nfl) ?? 0) + 1);
  const out = new Map<string, Fantasy>();
  for (const g of games) {
    const here = starters.filter((s) => s.nfl === g.home || s.nfl === g.away).sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name));
    out.set(g.id, { starters: here, rostered: (rostered.get(g.home) ?? 0) + (rostered.get(g.away) ?? 0) });
  }
  return out;
}

/* ---------- the red zone's fantasy angle ---------- */

const SCORERS = new Set(['QB', 'RB', 'WR', 'TE']);

export interface Attack {
  /** my starters on the attacking team */
  mine: StarterLive[];
  /** other rostered players of that team in my league who could score (best season average first), my bench included */
  others: ModelPlayer[];
}

/** Who in your league is on the attacking team of a red-zone drive. Rule-based on possession and rosters only: it does not claim who is on the field. */
export function attackOf(team: string, starters: readonly StarterLive[], players: readonly ModelPlayer[]): Attack {
  const mine = starters.filter((s) => s.nfl === team && s.pos !== 'DEF').sort((a, b) => b.actual - a.actual || a.name.localeCompare(b.name));
  const ids = new Set(mine.map((s) => s.pid));
  const others = players
    .filter((p) => p.ownerRid > 0 && p.nfl === team && SCORERS.has(p.pos) && !ids.has(p.pid))
    .sort((a, b) => (b.seasonAvg ?? 0) - (a.seasonAvg ?? 0) || a.name.localeCompare(b.name));
  return { mine, others };
}

/* ---------- the whip-around (the red zone section drawn like a broadcast) ---------- */

/** Yards from the ball to the goal line for the team with the ball (1 to 99), null with no spot. */
export function yardsOut(g: NfGame): number | null {
  const s = g.situation;
  return s ? yardsToGoal(s) : null;
}

export type ScoreKind = 'touchdown' | 'field goal' | 'score';

/** What a jump in one team's score most likely was: 6 or more is a touchdown (with the try, or more, inside one poll), 3 a field goal. */
export const scoreKind = (delta: number): ScoreKind => (delta >= 6 ? 'touchdown' : delta === 3 ? 'field goal' : 'score');

/** The game clock as a scoreboard draws it: the period ("q2", "ot") and the clock ("7:30", or "" when the feed has none). */
export function clockParts(g: Pick<NfGame, 'quarter' | 'clock' | 'state'>): { period: string; clock: string } {
  const q = g.quarter.toLowerCase();
  const period = q === 'ot' ? 'ot' : /^\d$/.test(q) ? `q${q}` : '';
  return { period, clock: g.state === 'live' ? g.clock : '' };
}
