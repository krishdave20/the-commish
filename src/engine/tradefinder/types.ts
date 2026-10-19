/* Types for the trade finder (need-driven 2-for-1, 1-for-2 and three-team ideas) and for real-trade grades.
   Plain data only: an idea can be cached, tested and passed to a worker. */
import type { GroupKey, Tier } from '../draft/ratings.ts';
import type { Pos } from '../types.ts';

export type FinderKind = 'two-for-one' | 'one-for-two' | 'three-team';

/** A player in an idea: just what the cards and the sentence need. */
export interface FinderPlayer {
  pid: string;
  name: string;
  pos: Pos;
  nfl: string | null;
  /** expected points, rest of the regular season (weeks cur+1 .. last) */
  ros: number;
  /** FantasyCalc value (dynasty only); null = none on file */
  value: number | null;
}

/** What one team does in an idea. In a two-team deal there are two sides; in a rotation, three. */
export interface FinderSide {
  rid: number;
  team: string;
  isMe: boolean;
  send: FinderPlayer[];
  get: FinderPlayer[];
  /** the cheapest bench player this team drops to stay inside the roster limit (null = no drop needed) */
  drop: FinderPlayer | null;
  /** change in the best lineup, rest of the regular season (after any drop) */
  reg: number;
  /** change in the best lineup, playoff weeks */
  po: number;
  /** reg + po */
  gain: number;
  /** gain ÷ weeks scored */
  perWeek: number;
  /** the position group that gains: your need for you, the group of what they receive for them */
  group: GroupKey | null;
  /** that group's tier before and after the deal (null when the league rates no such group) */
  tier: { before: Tier; after: Tier } | null;
  /** the group is this team's biggest need */
  fillsNeed: boolean;
  /** dynasty only: FantasyCalc value out and in, and how far apart they are */
  value: ValueBalance | null;
}

export interface ValueBalance {
  out: number;
  in: number;
  /** |in − out| ÷ the bigger side, 0 to 1 */
  gap: number;
  /** more than LOPSIDED_GAP apart */
  lopsided: boolean;
  /** which way it leans for this team */
  leans: 'for' | 'against' | 'even';
  /** assets with no value on file (counted as 0) */
  missing: string[];
}

export interface FinderIdea {
  /** stable: kind + sorted pids */
  id: string;
  kind: FinderKind;
  /** sides[0] is you; the rest are the partner (two-team) or the two other teams in the rotation order you → B → C → you */
  sides: FinderSide[];
  /** the smallest gain among the sides: the ranking key */
  minGain: number;
  /** the one-line, rule-based explanation with the numbers */
  text: string;
  /** dynasty: set when any side is more than LOPSIDED_GAP apart on value */
  lopsided: boolean;
  /** weeks the gains add up over (rest of the regular season and the playoff weeks) */
  weeks: number;
  /** how many of those weeks the incoming player at your need starts for you */
  startsForMe: number;
}

/** What "load in analyzer" puts into the analyzer tab. For a rotation it is your leg only (the analyzer holds two teams). */
export interface Prefill {
  partnerRid: number;
  send: string[];
  get: string[];
  /** true for a rotation: only your own leg is loaded, so the partner's numbers in the analyzer are not the rotation's */
  partial: boolean;
}

export interface FinderResult {
  ideas: FinderIdea[];
  /** your biggest need and surplus, with what they mean */
  need: GroupKey | null;
  surplus: GroupKey | null;
  needTier: Tier | null;
  surplusTier: Tier | null;
  /** the surplus was missing, so the bench players were used as the trade pool */
  usedBench: boolean;
  /** when there are no ideas: why, in one line */
  reason: string;
  /** the roster limit used for the drop rule */
  rosterSize: number;
  /** candidate deals scored in the search (before the keep rules) */
  evaluated: number;
  /** how long the search took, ms */
  ms: number;
}
