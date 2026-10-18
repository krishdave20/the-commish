/* "Who this week hinges on": for each starter, my win chance now minus my win chance if he were swapped for a typical free agent.

   - The win chance is the engine's own: `liveWinProb(projA, projB, sd, remA, remB)`. Before kickoff both remaining shares are 1, which
     makes it exactly `winProb(projA, projB, sd)`; with games on, points already scored stay and only the unplayed share changes.
   - Team projection = points so far + the sum over starters of (expected game points × share of his game still to play).
   - Swapping a starter for a replacement-level player (see replacement.ts) changes that starter's unplayed part only:
         projection' = projection - (mu - replacement) × remaining
     His actual points stay. A finished game (remaining 0) therefore has nothing at stake, and the share of minutes left per team, which
     sets the live spread, does not change.
   - At stake = (win chance now - win chance with the swap) × 100, in percentage points. Positive: he is carrying you. Near 0: he is
     replacement level or his game is over. Negative: a typical free agent would have been the better play.
   Pure: no network, no React. The same function scores the opponent's starters, for their win chance, which is the scout view. */
import { liveWinProb } from '../live/winprob.ts';

export type HingeState = 'pre' | 'live' | 'final' | 'idle';

/** One starter, whichever source he came from (the live feed or the model). */
export interface HingeStarter {
  slot: string;
  pid: string;
  name: string;
  pos: string;
  nfl: string | null;
  state: HingeState;
  /** points so far */
  actual: number;
  /** expected points for the whole game */
  mu: number;
  /** share of his game still to play: 1 before kickoff, 0 when final or no game */
  remaining: number;
  /** NFL opponent code, null when unknown or no game */
  opp: string | null;
  /** true: his team is the home side; null when unknown */
  home: boolean | null;
  /** "q3 4:12", "final", "" before kickoff */
  statusText: string;
  /** kickoff, epoch ms */
  kickoff: number | null;
  /** the clock was unreadable, half the game is assumed left */
  assumed?: boolean;
}

export interface HingeSide {
  rid: number;
  name: string;
  isMe: boolean;
  /** the team's points so far (Sleeper's own total) */
  actual: number;
  starters: HingeStarter[];
}

export interface HingeRow extends HingeStarter {
  /** season points per game (null when unknown) */
  perGame: number | null;
  /** season offensive snap share, 0 to 1 (null for defenses, kickers or without nflverse data) */
  snapPct: number | null;
  /** a typical free agent's expected points at his position */
  replacement: number;
  /** projected points for the week now: actual + mu × remaining */
  projection: number;
  /** the team's points swing if he were swapped: (mu - replacement) × remaining */
  swing: number;
  /** the team's win chance with the swap, 0 to 1 */
  winWithout: number;
  /** percentage points of win chance riding on him (can be negative) */
  atStake: number;
}

export interface HingesResult {
  rid: number;
  name: string;
  isMe: boolean;
  /** the team's win chance now, 0 to 1 */
  winNow: number;
  /** the team's projection now, and the other team's */
  projection: number;
  otherProjection: number;
  /** sorted by at stake, biggest first */
  rows: HingeRow[];
  /** at least one starter has played or is playing */
  started: boolean;
}

export interface HingeOpts {
  /** the league's weekly team SD (model.meta.teamWeeklySd) */
  sd: number;
  /** expected points of a typical free agent by position */
  replacement: Readonly<Record<string, number>>;
  /** season points per game by pid */
  perGame?: (pid: string) => number | null | undefined;
  /** season snap share by pid, 0 to 1 */
  snaps?: (pid: string) => number | null | undefined;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

function teamNumbers(side: HingeSide): { projection: number; remaining: number } {
  const n = side.starters.length;
  return {
    projection: side.actual + side.starters.reduce((s, p) => s + p.mu * p.remaining, 0),
    remaining: n ? side.starters.reduce((s, p) => s + p.remaining, 0) / n : 0,
  };
}

/** `side`'s starters ranked by how much of `side`'s win chance rides on each, against `other`. */
export function hingesOf(side: HingeSide, other: HingeSide, opts: HingeOpts): HingesResult {
  const me = teamNumbers(side), them = teamNumbers(other);
  const winNow = liveWinProb(me.projection, them.projection, opts.sd, me.remaining, them.remaining);
  const rows = side.starters.map((p): HingeRow => {
    const replacement = opts.replacement[p.pos] ?? 0;
    const swing = (p.mu - replacement) * p.remaining;
    const winWithout = p.remaining > 0 ? liveWinProb(me.projection - swing, them.projection, opts.sd, me.remaining, them.remaining) : winNow;
    return {
      ...p,
      perGame: opts.perGame?.(p.pid) ?? null,
      snapPct: opts.snaps?.(p.pid) ?? null,
      replacement: r2(replacement),
      projection: r1(p.actual + p.mu * p.remaining),
      swing: r2(swing),
      winWithout,
      atStake: (winNow - winWithout) * 100,
    };
  });
  // stable: ties keep lineup order
  rows.sort((a, b) => b.atStake - a.atStake);
  return {
    rid: side.rid, name: side.name, isMe: side.isMe, winNow, projection: r1(me.projection), otherProjection: r1(them.projection), rows,
    started: side.starters.some((p) => p.state === 'live' || p.state === 'final' || p.actual !== 0),
  };
}

/** Both teams' hinges for one matchup: mine (my win chance) and theirs (their win chance, the scout view). */
export function matchupHinges(mine: HingeSide, theirs: HingeSide, opts: HingeOpts): { mine: HingesResult; theirs: HingesResult } {
  return { mine: hingesOf(mine, theirs, opts), theirs: hingesOf(theirs, mine, opts) };
}
