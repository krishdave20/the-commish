/* Turn Sleeper's NFL game feeds into NflGame rows.

   Real sources (checked Oct 18, 2026, CORS `*`):
   - GET /scores/nfl/regular/{season}/{week} (undocumented): per game `status` (pre_game, in_game, complete), `start_time` (epoch ms),
     and `metadata` with the quarter ("1" to "4", "F", "F/OT"), the game clock ("7:21"), both scores, `is_in_progress`, `date_time`.
   - GET /schedule/nfl/regular/{season} (documented-ish): only `status`, `date`, `home`, `away`, `week`. No kickoff time, no clock.
   The scores feed is the one game day uses; the schedule is the fallback when it is down. */
import type { ScheduleGame, ScoreGame } from '../../data/types.ts';
import type { GameState, NflGame } from './types.ts';

const QUARTER_MIN = 15;

/** Share of regulation played for a quarter label and its clock, or null when they cannot be read. */
export function elapsedFraction(quarter: string | number | undefined | null, clock: string | undefined | null): number | null {
  const q = String(quarter ?? '').trim().toUpperCase();
  if (q === '') return 0;
  if (q === 'F' || q === 'F/OT' || q === 'FINAL') return 1;
  if (q === 'H' || q === 'HALF' || q === 'HALFTIME') return 0.5;
  if (q === 'OT' || q === '5') return 0.98;
  const n = Number(q);
  if (!Number.isInteger(n) || n < 1 || n > 4) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec((clock ?? '').trim());
  // a quarter with no readable clock counts as half played
  const left = m ? Math.min(QUARTER_MIN, Number(m[1]) + Number(m[2]) / 60) : QUARTER_MIN / 2;
  return Math.max(0, Math.min(1, ((n - 1) * QUARTER_MIN + (QUARTER_MIN - left)) / (4 * QUARTER_MIN)));
}

function stateOf(g: ScoreGame): GameState {
  const m = g.metadata ?? {};
  if (m.canceled === true) return 'final';
  const s = g.status.toLowerCase();
  if (s === 'complete' || s === 'final' || m.is_over === true) return 'final';
  if (s === 'in_game' || s === 'inprogress' || s === 'in_progress' || m.is_in_progress === true) return 'live';
  return 'pre';
}

function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

export function parseScores(rows: readonly ScoreGame[]): NflGame[] {
  const out: NflGame[] = [];
  for (const g of rows) {
    const m = g.metadata ?? {};
    if (!m.home_team || !m.away_team) continue;
    const state = stateOf(g);
    const iso = typeof m.date_time === 'string' ? Date.parse(m.date_time) : NaN;
    const kickoff = num(g.start_time) ?? (Number.isFinite(iso) ? iso : null);
    const quarter = state === 'pre' ? '' : String(m.quarter ?? '');
    out.push({
      id: g.game_id, home: m.home_team, away: m.away_team, kickoff, state, quarter,
      clock: state === 'live' ? String(m.time_remaining ?? '') : '',
      homeScore: state === 'pre' ? null : num(m.home_score), awayScore: state === 'pre' ? null : num(m.away_score),
      elapsed: state === 'pre' ? 0 : state === 'final' ? 1 : elapsedFraction(quarter, m.time_remaining),
    });
  }
  return out.sort((a, b) => (a.kickoff ?? 0) - (b.kickoff ?? 0) || a.id.localeCompare(b.id));
}

/** The fallback: statuses from the plain schedule. No kickoff times, so a live game's progress is unknown. */
export function gamesFromSchedule(schedule: readonly ScheduleGame[], week: number): NflGame[] {
  return schedule.filter((g) => g.week === week).map((g): NflGame => {
    const s = (g.status ?? '').toLowerCase();
    const state: GameState = s === 'complete' ? 'final' : s === 'in_progress' || s === 'in_game' ? 'live' : 'pre';
    return {
      id: g.game_id ?? `${g.away}@${g.home}`, home: g.home, away: g.away, kickoff: null, state,
      quarter: '', clock: '', homeScore: null, awayScore: null, elapsed: state === 'pre' ? 0 : state === 'final' ? 1 : null,
    };
  });
}

/** "q2 7:21", "halftime", "final", "final/ot", or "" before kickoff. */
export function gameStatusText(g: NflGame): string {
  if (g.state === 'pre') return '';
  const q = g.quarter.toUpperCase();
  if (g.state === 'final') return q === 'F/OT' ? 'final/ot' : 'final';
  if (q === 'H' || q === 'HALF' || q === 'HALFTIME') return 'halftime';
  if (q === 'OT') return g.clock ? `ot ${g.clock}` : 'ot';
  if (q === '') return 'live';
  return g.clock ? `q${q} ${g.clock}` : `q${q}`;
}

/** The week's games by NFL team code (each team plays at most once a week). */
export function gamesByTeam(games: readonly NflGame[]): Map<string, NflGame> {
  const m = new Map<string, NflGame>();
  for (const g of games) { m.set(g.home, g); m.set(g.away, g); }
  return m;
}

/** "cin vs pit": the player's team first, then the opponent. */
export function gameText(g: NflGame | null | undefined, team: string | null | undefined): string {
  if (!g || !team) return '';
  const opp = g.home === team ? g.away : g.home;
  return `${team} vs ${opp}`;
}
