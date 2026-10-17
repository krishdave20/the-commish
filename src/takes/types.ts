/* The Hot Takes contract (SPEC section 7). Rule-based only: every take is a template filled from real
   numbers, and every number traces to Sleeper, nflverse or FantasyCalc. The takes engine (src/takes/**)
   produces Take[]; the UI renders them and never invents copy. */
import type { Model } from '../engine/types.ts';
import type { FcEntry } from '../engine/draft/fantasycalc.ts';
import type { TrendingRow } from '../data/types.ts';
import type { CoverageRow, CoverageTeam, NflverseManifest, PlayerSeason, PlayerWeek, TeamWeek } from '../data/nflverseTypes.ts';

export type TakeKind =
  | 'usage_spike' | 'target_hog' | 'buy_low' | 'sell_high' | 'rz_role_change' | 'box_count_edge'
  | 'blitz_beater' | 'soft_schedule' | 'waiver_riser' | 'dynasty_mover' | 'coverage_note';

/** Ranking buckets, in this order: your players, then waiver and trade targets, then league-wide. */
export type Relevance = 'mine' | 'waiver' | 'trade_target' | 'league';

export type TakeAction = 'profile' | 'watchlist' | 'lab' | 'trade';

export interface Take {
  /** stable: `${kind}:${pid}:${week}` */
  id: string;
  kind: TakeKind;
  pid: string;
  player: string;
  pos: string;
  team: string | null;
  season: string;
  /** the week the take is about (usually the next game); data runs through `throughWeek` */
  week: number;
  throughWeek: number;
  /** ≤12 words, plain and punchy, no hype words */
  headline: string;
  /** the actual numbers, the comparison, and the sample size */
  statLine: string;
  /** set when the player is on one of your rosters, on waivers, or a trade target */
  whyForYou: string | null;
  relevance: Relevance;
  tone: 'good' | 'bad' | 'watch';
  /** detector strength in 0..1, used to rank within a relevance bucket */
  score: number;
  sample: { label: string; n: number };
  /** e.g. 'last season (2025)' or 'proxy'; shown as a chip when set */
  dataLabel: string | null;
  sources: Array<'sleeper' | 'nflverse' | 'ftn' | 'fantasycalc'>;
  actions: TakeAction[];
}

/** Everything the detectors read. The UI assembles it from the model, the nflverse client, trending adds
    and FantasyCalc; any part may be missing, and detectors that need it simply produce nothing. */
export interface TakeInputs {
  season: string;
  /** current NFL week from Sleeper state */
  week: number;
  model: Model;
  nflverse: {
    manifest: NflverseManifest;
    weekly: PlayerWeek[];
    season: PlayerSeason[];
    teams: TeamWeek[];
    coverage: { rows: CoverageRow[]; teams: Record<string, CoverageTeam>; isCurrent: boolean; season: string } | null;
  } | null;
  trendingAdds: TrendingRow[];
  fantasyCalc: Record<string, FcEntry> | null;
  isDynasty: boolean;
  watchlist: string[];
  /** players you are looking at in the trade analyzer (optional) */
  tradeTargets: string[];
}

/** Shape of data/takes_thresholds.json. Defaults are SPEC section 7's numbers; notebooks/takes_thresholds.ipynb
    tunes them against 2025 data and records its evidence. */
export interface TakesThresholds {
  version: 1;
  fit_season: number | null;
  max_per_player_week: number;
  detectors: {
    usage_spike: { snap_share_jump: number; baseline_weeks: number; min_team_snaps: number };
    target_hog: { min_target_share: number; weeks: number; min_targets: number };
    buy_low: { ay_share_rank_max: number; ppg_rank_min: number; min_games: number };
    sell_high: { td_over_expected_min: number; min_opportunities: number };
    rz_role_change: { i10_share_delta: number; weeks: number; min_team_i10_plays: number };
    box_count_edge: { ypc_light_min: number; opp_light_rate_min: number; min_light_carries: number };
    blitz_beater: { ypt_blitz_over_baseline: number; opp_blitz_rate_min: number; min_blitz_targets: number };
    soft_schedule: { weeks: number; dvp_soft_min: number };
    waiver_riser: { min_trending_adds: number; usage_delta: number };
    dynasty_mover: { tail_pct: number };
    coverage_note: { yprr_gap_min: number; opp_rate_min: number; min_routes: number };
  };
  /** free-form notes from the notebook: hit rates, sample sizes, what changed from the defaults */
  evidence: Record<string, unknown>;
}
