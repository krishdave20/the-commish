/* Types for opponent scouting. Plain data, no React, no network: the report is rules over numbers the app already has
   (the week's matchup rows and projections, the model's history, the hinges engine and the league's transactions). */
import type { Slot } from '../types.ts';
import type { PlayerState } from '../live/project.ts';

export type { PlayerState };

/** One player as the scout sees him: where he sits, what he is projected for and whether his game is still to come. */
export interface ScoutPlayer {
  pid: string;
  name: string;
  pos: string;
  nfl: string | null;
  state: PlayerState;
  /** points so far (his whole game once it is final) */
  actual: number;
  /** expected points for the whole game, injury-adjusted for the current week */
  mu: number;
  /** points so far plus the unplayed share of `mu`: his number for the week as it stands (`actual` once final, `mu` before kickoff) */
  projection: number;
  /** kickoff, epoch ms (null when unknown) */
  kickoff: number | null;
  /** Sleeper's injury designation ("Questionable", "Out", ...), "" when healthy or unknown (past weeks carry none) */
  injury: string;
  /** the model's 80th-percentile outcome for the week, null when unknown */
  ceiling: number | null;
  /** the schedule is known and his team has no game this week */
  bye: boolean;
}

/** One team's week: the lineup slot by slot (null = an empty slot) and everyone else on the roster who could have started. */
export interface ScoutTeam {
  rid: number;
  name: string;
  manager: string;
  isMe: boolean;
  /** the league's starting slots, aligned with `starters` */
  slots: Slot[];
  starters: Array<ScoutPlayer | null>;
  /** rostered players not in the lineup and free to start (IR is left out) */
  bench: ScoutPlayer[];
  /** the team's points so far (Sleeper's own total) */
  actual: number;
}

/** What the scout calls the two sides in a sentence: "your flex vs their flex" for my matchup, team names for any other. */
export interface ScoutLabels {
  /** the viewer's side: "your" / "icemen’s" */
  youPoss: string;
  /** the scouted side: "their" / "killa k’s" */
  themPoss: string;
  /** "you" / "icemen" */
  youObj: string;
  /** "them" / "killa k" */
  themObj: string;
  /** what the side that plays last can say: "you will know what you need" / "icemen will know what it needs" */
  youKnow: string;
  themKnow: string;
}

export const MY_LABELS: ScoutLabels = {
  youPoss: 'your', themPoss: 'their', youObj: 'you', themObj: 'them',
  youKnow: 'you will know what you need', themKnow: 'they will know what they need',
};
export function teamLabels(you: string, them: string): ScoutLabels {
  return {
    youPoss: `${you}’s`, themPoss: `${them}’s`, youObj: you, themObj: them,
    youKnow: `${you} will know what it needs`, themKnow: `${them} will know what it needs`,
  };
}
