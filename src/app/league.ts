import type { LeagueStatus, SleeperLeague } from '../data';

export type ScoringLabel = 'PPR' | 'Half' | 'Std';
export type LeagueTypeLabel = 'Redraft' | 'Keeper' | 'Dynasty';

/** PPR / Half / Std from `scoring_settings.rec`: 0.75 and up is PPR, 0.25 and up is Half. */
export function scoringLabel(rec: number | undefined): ScoringLabel {
  const r = rec ?? 0;
  if (r >= 0.75) return 'PPR';
  if (r >= 0.25) return 'Half';
  return 'Std';
}

export function leagueScoring(league: Pick<SleeperLeague, 'scoring_settings'>): ScoringLabel {
  return scoringLabel(league.scoring_settings?.rec);
}

/** `settings.type`: 0 redraft, 1 keeper, 2 dynasty. */
export function leagueTypeLabel(type: number | undefined): LeagueTypeLabel {
  if (type === 2) return 'Dynasty';
  if (type === 1) return 'Keeper';
  return 'Redraft';
}

const STATUS: Record<LeagueStatus, string> = {
  pre_draft: 'Pre-draft',
  drafting: 'Drafting',
  in_season: 'In season',
  complete: 'Complete',
};

export function statusLabel(status: string): string {
  return STATUS[status as LeagueStatus] ?? status.replace(/_/g, ' ');
}

/** "QB, RB, RB, BN, BN" becomes [["QB",1],["RB",2],["BN",2]] in first-seen order. */
export function groupSlots(positions: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const p of positions) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()];
}
