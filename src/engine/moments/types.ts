/* The moments contract. A Moment is one thing worth the viewer's attention right now: a countdown, a lineup risk, a live score.
   Moments come from rules over real data and the clock (SPEC section 1: no LLM). The engine is pure: `moments(ctx)` reads nothing but
   its argument, so the same context always gives the same list. Anything the context is missing means the moment does not fire. */
import type { NflState, Phase } from '../../data/contract.ts';

export type MomentKind =
  | 'draft-countdown' | 'draft-mock' | 'draft-tiers' | 'draft-queue' | 'draft-clock' | 'draft-grade'
  | 'waivers-tonight' | 'waivers-cleared'
  | 'game-day' | 'lineup-swap' | 'lineup-ok' | 'injury-risk' | 'final-check'
  | 'live-matchup' | 'monday-night' | 'final-whistle' | 'week-recap'
  | 'trade-deadline' | 'clinch' | 'clinched' | 'toilet-bowl' | 'playoffs'
  | 'dynasty-movers' | 'rookie-prep' | 'take';

/** The pages that show a banner. A moment lists the pages it is relevant to. */
export type MomentPage = 'home' | 'team' | 'waivers' | 'trades' | 'draft' | 'gameday';

export interface MomentAction { label: string; to: string }

export interface Moment {
  /** stable across polls so a dismissed pill stays dismissed */
  id: string;
  kind: MomentKind;
  /** 0 to 100; the highest wins the huddle's top slot and the live activity */
  priority: number;
  /** short, lowercase: "game day starts tonight 7:15 pm" */
  title: string;
  /** one line with real numbers */
  detail: string;
  action: MomentAction;
  /** the moment is not shown before this instant (epoch ms) */
  startsAt?: number;
  /** the moment expires at this instant */
  endsAt?: number;
  /** the instant a countdown runs to */
  countdownTo?: number;
  /** from this instant the live activity may show the countdown (default: 12 hours before `countdownTo`) */
  ongoingFrom?: number;
  /** something is happening right now (a live score, a draft pick on the clock) */
  live?: boolean;
  /** short name of what the countdown is to: "waivers", "kickoff", "inactives", "draft" */
  label?: string;
  /** show seconds in the countdown */
  precise?: boolean;
  /** live activity text for a live moment: "icemen 95.0 · 58.8 · 80%", with the win share for a tiny bar */
  pill?: { text: string; bar?: number };
  /** the live activity may show this moment while it is current, though it is neither live nor a countdown (the final whistle's recap) */
  glance?: boolean;
  /** the pages whose banner may show this moment */
  pages: MomentPage[];
}

/* ---------- context ---------- */

/** League settings the rules read (all optional: Sleeper leaves some out). */
export interface MomentSettings {
  /** Sleeper's `waiver_day_of_week`: 0 = Monday … 6 = Sunday (a value of 2 processed on Wednesday at 3:05 am ET on the real league) */
  waiverDayOfWeek?: number;
  /** `waiver_type`: 0 rolling priority, 1 reverse standings, 2 FAAB */
  waiverType?: number;
  /** `daily_waivers`: 1 when waivers run every day */
  dailyWaivers?: number;
  waiverClearDays?: number;
  /** `trade_deadline`: the NFL week */
  tradeDeadline?: number;
  /** `playoff_week_start` */
  playoffWeekStart?: number;
}

export interface Kickoff {
  id: string;
  home: string;
  away: string;
  /** epoch ms; games without a time are left out */
  kickoff: number;
  state: 'pre' | 'live' | 'final';
}

export interface StarterInfo { pid: string; name: string; pos: string; nfl: string | null; injury: string; played: boolean }

export interface Swap { inName: string; inPid: string; outName: string | null; gain: number }

export interface InjuryRisk {
  pid: string;
  name: string;
  pos: string;
  /** "questionable", "doubtful", "out" */
  status: string;
  /** the best bench player who can fill the slot, with his expected points */
  fallback: { name: string; points: number } | null;
}

export interface WaiverTop { pid: string; name: string; pos: string; gain: number; bid: number; dropName: string }

/** The waiver board as the moments read it: the top add, the top two for the live activity, and whether bids are FAAB. */
export interface WaiverInfo { top: WaiverTop | null; faab: boolean; adds?: WaiverTop[] }

export interface LastResult { week: number; mine: number; theirs: number; oppName: string }

export interface TradeIdeaInfo { give: string; get: string; partner: string; myGain: number; theirGain: number }

/** What the rules need from the engine's model, flattened to plain data (built by `momentModel` in adapt.ts). */
export interface MomentModel {
  week: number;
  lastRegularWeek: number;
  teamName: string;
  record: { w: number; l: number; t: number };
  /** this week's projection (before the games) */
  matchup: { oppName: string; mine: number; theirs: number; p: number } | null;
  starters: StarterInfo[];
  /** the best lineup for the week against the one set in Sleeper */
  lineup: { best: number; swaps: Swap[] } | null;
  injuries: InjuryRisk[];
  /** null when the board has not been computed; `top: null` when nobody on the wire beats the bench */
  waiver: WaiverInfo | null;
  /** my FAAB budget left, in dollars (leagues that bid; the number is there either way) */
  faabLeft?: number | null;
  playoffPct: number | null;
  magic: { spot: number | null; open: number; winOut: boolean; clinched: boolean; eliminated: boolean } | null;
  titlePct: number | null;
  /** the non-playoff bracket and my chance to win it */
  losers: { name: string; champ: string; pct: number | null; inPct: number | null } | null;
  /** the most recent finished week of mine */
  lastResult: LastResult | null;
  trade: TradeIdeaInfo | null;
}

export interface LiveSide {
  name: string;
  pts: number;
  left: Array<{ name: string; pos: string }>;
  /** the starter who scored the most so far */
  top?: { name: string; pts: number } | null;
}

/** My matchup as the live layer sees it. */
export interface LiveMatch {
  mine: LiveSide;
  theirs: LiveSide;
  /** chance I win from here */
  winP: number;
  /** the matchup has points on the board */
  started: boolean;
  final: boolean;
  /** when the matchup's last game ended, as far as kickoff times tell (epoch ms; an estimate: kickoff + a game's length) */
  finalAt?: number | null;
  /** the NFL week of the matchup */
  week?: number;
}

export interface DraftCtx {
  status: 'pre_draft' | 'drafting' | 'paused' | 'complete';
  startTime: number | null;
  mySlot: number | null;
  teams: number;
  /** picks made by others before my next one; 0 = I am on the clock; null when unknown or when I have none left */
  picksUntilMine: number | null;
  /** the position of the first tier to study, e.g. "rb" (needs the rankings) */
  tierPos: string | null;
  /** the letter grade of my draft once it is over */
  grade: { letter: string; rank: number; teams: number } | null;
}

export interface MomentTake { id: string; pid: string; headline: string; statLine: string }

export interface OffseasonCtx {
  /** my players with the biggest 30-day value moves (FantasyCalc), dynasty leagues only */
  movers: Array<{ name: string; delta: number }>;
  /** the top of the rookie class */
  rookies: Array<{ name: string; pos: string }>;
}

export interface MomentCtx {
  now: Date;
  /** the viewer's time zone (an IANA name) */
  tz: string;
  phase: Phase | null;
  nflState: Pick<NflState, 'week' | 'season' | 'season_type'> | null;
  settings: MomentSettings;
  /** this week's NFL games and next week's, kickoff times as Sleeper reports them */
  schedule: { games: Kickoff[]; nextGames: Kickoff[] };
  draft: DraftCtx | null;
  model: MomentModel | null;
  takes: MomentTake[];
  live: LiveMatch | null;
  offseason: OffseasonCtx | null;
  /** the odds recorded earlier: the playoff chance on the first look at `week`, for the recap's "66% → 74%" */
  previous: { week: number; playoffPct: number } | null;
  /** last season, for the offseason sentence */
  lastSeason: { teamName: string; w: number; l: number; t: number; rank: number; teams: number } | null;
  /** pre-draft checklist items already ticked */
  prep: { mock: boolean; tiers: boolean; queue: boolean } | null;
}
