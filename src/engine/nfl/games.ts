/* One NFL game for the NFL page: the live engine's NflGame (state, clock, score, kickoff) plus what Sleeper's scores feed also carries
   (points by quarter, the TV channel, the stadium city, the teams' records). Pure: no fetching, no React.

   Checked Oct 18, 2026 against GET /scores/nfl/regular/2026/{week}: `metadata.home_score_quarter1..4` and `away_score_quarter1..4`
   (numbers, 0 before the quarter), `home_score_overtime` / `away_score_overtime`, `is_overtime`, `channel` ("FOX", "NBC/Peacock"),
   `home_record` / `away_record` ("4-2-0"), `stadium_details.city`. `quarter` also reads "HALF" at the half. */
import type { ScoreGame } from '../../data/types.ts';
import { parseScores } from '../live/scores.ts';
import type { NflGame } from '../live/types.ts';

export interface LineScore {
  /** "1", "2", "3", "4" and "ot" for each period played so far */
  labels: string[];
  home: number[];
  away: number[];
}

export interface NfGame extends NflGame {
  week: number;
  channel: string | null;
  /** the stadium's city, "Atlanta" */
  stadiumCity: string | null;
  homeRecord: string | null;
  awayRecord: string | null;
  /** points by quarter; null before kickoff, or when the feed's quarters do not add up to the score */
  line: LineScore | null;
}

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/** "4-2-0" to "4-2" (a tie shows only when there is one: "3-2-1"). */
export function trimRecord(r: string | null): string | null {
  if (!r) return null;
  const m = /^(\d+)-(\d+)(?:-(\d+))?$/.exec(r);
  if (!m) return r;
  return m[3] && m[3] !== '0' ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
}

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

/** Sleeper's scores rows for one week as NfGame rows, soonest kickoff first. */
export function parseGameRows(rows: readonly ScoreGame[], week: number): NfGame[] {
  const raw = new Map(rows.map((r) => [r.game_id, r]));
  return parseScores(rows).map((g): NfGame => {
    const meta = (raw.get(g.id)?.metadata ?? null) as Record<string, unknown> | null;
    const city = meta && typeof meta.stadium_details === 'object' && meta.stadium_details !== null
      ? str((meta.stadium_details as Record<string, unknown>).city) : null;
    return {
      ...g, week,
      channel: str(meta?.channel), stadiumCity: city,
      homeRecord: trimRecord(str(meta?.home_record)), awayRecord: trimRecord(str(meta?.away_record)),
      line: lineScore(g, meta),
    };
  });
}

/** Lay the live poller's view of the current week over the rows read from the scores feed: state, quarter, clock and scores come from the
    poller (the single source of live truth); the extras (channel, records, the line score) stay from the feed. A game the poller does not have
    keeps its feed values. When the poller's score disagrees with a game's line score (the two were read a moment apart) the feed's own row
    is kept whole, so the score and its quarters never contradict each other; the next read brings them level. */
export function overlayLive(base: readonly NfGame[], live: readonly NflGame[]): NfGame[] {
  const by = new Map(live.map((g) => [g.id, g]));
  return base.map((g) => {
    const l = by.get(g.id);
    if (!l) return g;
    if (g.line && l.state !== 'pre') {
      const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
      if (sum(g.line.home) !== l.homeScore || sum(g.line.away) !== l.awayScore) return g;
    }
    return { ...g, state: l.state, quarter: l.quarter, clock: l.clock, homeScore: l.homeScore, awayScore: l.awayScore, elapsed: l.elapsed, kickoff: l.kickoff ?? g.kickoff, line: l.state === 'pre' ? null : g.line };
  });
}

/* ---------- time slots ---------- */

export interface SlotGroup<T> {
  key: string;
  /** "sunday early", "monday night" */
  label: string;
  /** the first kickoff of the group, epoch ms (null when the feed has none) */
  at: number | null;
  games: T[];
}

const ET = {
  weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long' }),
  hour: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }),
  day: new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }),
};

/** The NFL's own time slots are defined in Eastern time (1:00 pm early, 4:05 and 4:25 pm late, 8:20 pm Sunday night), so the viewer's time
    zone does not move a game from one slot to another. Sunday: before 3 pm ET is "early" (it covers the 9:30 am games in London), 3 to 7 pm
    is "late", from 7 pm is "night". Any other day: from 7 pm ET is "night", earlier is "afternoon". */
export function timeSlot(kickoff: number | null): { key: string; label: string } {
  if (kickoff === null) return { key: 'tbd', label: 'time to be set' };
  const day = ET.weekday.format(kickoff).toLowerCase();
  const hour = Number(ET.hour.format(kickoff));
  const part = day === 'sunday' ? (hour < 15 ? 'early' : hour < 19 ? 'late' : 'night') : hour >= 19 ? 'night' : 'afternoon';
  const date = ET.day.format(kickoff);
  return { key: `${date} ${day} ${part}`, label: `${day} ${part}` };
}

/** The eastern calendar date of a kickoff, "oct 18" (for the small date beside a slot's name). */
export function slotDate(kickoff: number | null): string {
  if (kickoff === null) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(kickoff).toLowerCase();
}

/** Games grouped by time slot, groups in kickoff order, games inside a group in kickoff order then by id. */
export function groupBySlot<T extends { id: string; kickoff: number | null }>(games: readonly T[]): Array<SlotGroup<T>> {
  const groups = new Map<string, SlotGroup<T>>();
  const sorted = [...games].sort((a, b) => (a.kickoff ?? Infinity) - (b.kickoff ?? Infinity) || a.id.localeCompare(b.id));
  for (const g of sorted) {
    const s = timeSlot(g.kickoff);
    const hit = groups.get(s.key);
    if (hit) hit.games.push(g);
    else groups.set(s.key, { key: s.key, label: s.label, at: g.kickoff, games: [g] });
  }
  return [...groups.values()];
}
