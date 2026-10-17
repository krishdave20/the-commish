/* Which ADP column a league should read, and how to read it.

   Sleeper's season projections carry several ADP columns per player (adp_ppr, adp_half_ppr, adp_std, adp_2qb,
   adp_dynasty_*, adp_rookie, adp_idp ...). 999 (or absent) means "no ADP". */
import type { SleeperLeague } from '../../data/contract.ts';
import type { StatLine } from '../../data/types.ts';

/** The league fields the draft engine reads. */
export type LeagueLike = Pick<SleeperLeague, 'roster_positions' | 'scoring_settings' | 'settings'> & { total_rosters?: number };

/** redraft = one-year league (keeper leagues too); startup = first dynasty draft (all players); rookie = dynasty rookie draft. */
export type DraftMode = 'redraft' | 'startup' | 'rookie';

export const ADP_MISSING = 999;

export type ScoringKind = 'ppr' | 'half_ppr' | 'std';

/** PPR / half / standard from the league's `rec` (same cut-offs as the scorer). */
export function scoringKind(sc: Record<string, number> | null | undefined): ScoringKind {
  const rec = sc?.rec == null ? 1 : sc.rec;
  return rec >= 0.75 ? 'ppr' : rec >= 0.25 ? 'half_ppr' : 'std';
}

/** Superflex or 2+ QB slots (FantasyCalc's numQbs = 2, and the 2QB ADP column). */
export function isTwoQb(rosterPositions: readonly string[] | null | undefined): boolean {
  const rp = rosterPositions ?? [];
  return rp.includes('SUPER_FLEX') || rp.filter((s) => s === 'QB').length >= 2;
}

export const isDynasty = (league: Pick<LeagueLike, 'settings'>): boolean => league.settings?.type === 2;

/** Guess the draft mode: Sleeper's `player_type` 1 is a rookies-only draft; otherwise dynasty → startup, else redraft. */
export function inferDraftMode(league: Pick<LeagueLike, 'settings'>, draft?: { settings?: Record<string, number> | null } | null): DraftMode {
  if (draft?.settings?.player_type === 1) return 'rookie';
  return isDynasty(league) ? 'startup' : 'redraft';
}

/** The ADP column for offense positions. */
export function adpField(league: LeagueLike, mode: DraftMode = inferDraftMode(league)): string {
  if (mode === 'rookie') return 'adp_rookie';
  const kind = scoringKind(league.scoring_settings);
  const twoQb = isTwoQb(league.roster_positions);
  if (isDynasty(league)) return twoQb ? 'adp_dynasty_2qb' : `adp_dynasty_${kind}`;
  return twoQb ? 'adp_2qb' : `adp_${kind}`;
}

export const IDP_POSITIONS: readonly string[] = ['DL', 'LB', 'DB'];

/** The ADP column for one position: IDP players use Sleeper's IDP columns (a rookie draft still uses adp_rookie). */
export function adpFieldFor(pos: string, league: LeagueLike, mode: DraftMode = inferDraftMode(league)): string {
  if (IDP_POSITIONS.includes(pos) && mode !== 'rookie') return isTwoQb(league.roster_positions) ? 'adp_idp' : 'adp_idp_1qb';
  return adpField(league, mode);
}

/** An ADP value, or null when absent, not a number, or the 999 placeholder. */
export function readAdp(stats: StatLine | null | undefined, field: string, fallbackField?: string): number | null {
  for (const f of [field, fallbackField]) {
    if (!f) continue;
    const v = stats?.[f];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < ADP_MISSING) return v;
  }
  return null;
}

/** How far a pick typically lands from its ADP (picks): used by bots and by "likely gone" odds. */
export const adpSd = (adp: number): number => 3 + 0.08 * adp;
