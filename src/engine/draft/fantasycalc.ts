/* FantasyCalc trade values: league → request parameters, load (gracefully), and join to Sleeper ids. */
import type { SleeperClient } from '../../data/sleeper.ts';
import { DataError } from '../../data/errors.ts';
import type { FantasyCalcRow } from '../../data/types.ts';
import type { FantasyCalcParams } from '../../data/urls.ts';
import { isDynasty, isTwoQb, scoringKind, type LeagueLike } from './adp.ts';

/** `isDynasty` from settings.type === 2, `numQbs` 2 for superflex / 2+ QB slots, `numTeams`, `ppr` from `rec` (1, 0.5 or 0). */
export function fantasyCalcParams(league: LeagueLike, teams?: number): Required<FantasyCalcParams> {
  const kind = scoringKind(league.scoring_settings);
  return {
    isDynasty: isDynasty(league),
    numQbs: isTwoQb(league.roster_positions) ? 2 : 1,
    numTeams: teams ?? league.total_rosters ?? (league.settings?.num_teams as number | undefined) ?? 12,
    ppr: kind === 'ppr' ? 1 : kind === 'half_ppr' ? 0.5 : 0,
  };
}

export interface FcEntry {
  sleeperId: string;
  name: string;
  position: string;
  /** trade value */
  value: number;
  overallRank: number | null;
  positionRank: number | null;
  /** 30-day change in value (null when the API does not say) */
  trend30Day: number | null;
}

/** Join FantasyCalc rows to Sleeper player ids. Rows without a `sleeperId` (draft picks, unmapped players) are dropped. */
export function joinFantasyCalc(rows: readonly FantasyCalcRow[]): Record<string, FcEntry> {
  const out: Record<string, FcEntry> = {};
  for (const r of rows) {
    const id = r.player?.sleeperId;
    if (!id || typeof r.value !== 'number') continue;
    const trend = (r as Record<string, unknown>).trend30Day ?? (r as Record<string, unknown>).trend;
    out[String(id)] = {
      sleeperId: String(id), name: String(r.player.name ?? ''), position: String(r.player.position ?? ''), value: r.value,
      overallRank: typeof r.overallRank === 'number' ? r.overallRank : null,
      positionRank: typeof r.positionRank === 'number' ? r.positionRank : null,
      trend30Day: typeof trend === 'number' ? trend : null,
    };
  }
  return out;
}

export interface FcResult {
  ok: boolean;
  params: Required<FantasyCalcParams>;
  /** Sleeper id → entry (empty when FantasyCalc is unavailable) */
  byId: Record<string, FcEntry>;
  /** why it is empty ('' when ok) */
  reason: string;
  asOf: number | null;
  /** served from a stale cache copy */
  stale: boolean;
}

/** Load FantasyCalc values for a league. Never throws: when the service is down, `ok` is false, `byId` is empty and
    `reason` says why, so the draft room can carry on with Sleeper data only ("Values: FantasyCalc" is omitted). */
export async function loadFantasyCalc(sleeper: Pick<SleeperClient, 'fantasyCalc'>, league: LeagueLike, opts: { force?: boolean; teams?: number } = {}): Promise<FcResult> {
  const params = fantasyCalcParams(league, opts.teams);
  try {
    const res = await sleeper.fantasyCalc(params, { force: opts.force });
    const byId = joinFantasyCalc(res.data);
    if (!Object.keys(byId).length) return { ok: false, params, byId: {}, reason: 'FantasyCalc returned no players', asOf: res.asOf, stale: res.stale };
    return { ok: true, params, byId, reason: '', asOf: res.asOf, stale: res.stale };
  } catch (e) {
    const reason = e instanceof DataError ? e.message : `FantasyCalc is unavailable: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, params, byId: {}, reason, asOf: null, stale: false };
  }
}
