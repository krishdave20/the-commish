import type { PlayoffRules } from './types.ts';

/** The bits of a Sleeper league's settings the bracket reads. */
export interface LeagueSettingsLike {
  playoff_teams?: number;
  playoff_week_start?: number;
  playoff_round_type?: number;
  playoff_seed_type?: number;
  playoff_type?: number;
  [k: string]: unknown;
}

/** Playoff rules from a league's settings. A missing `playoff_week_start` is week 15 (as the data layer assumes), `playoff_teams` 6. */
export function rulesFromLeagueSettings(s: LeagueSettingsLike | null | undefined, teamCount?: number): PlayoffRules {
  const n = Number(s?.playoff_teams) || 6;
  return {
    teams: teamCount ? Math.min(n, teamCount) : n,
    weekStart: Number(s?.playoff_week_start) || 15,
    roundType: Number(s?.playoff_round_type) || 0,
    seedType: Number(s?.playoff_seed_type) || 0,
    type: Number(s?.playoff_type) || 0,
  };
}

/** The rules a model carries (`meta.playoff`), or the defaults implied by its other fields: one week per round, fixed bracket. */
export function rulesOf(meta: { playoff?: PlayoffRules; playoffTeams: number; lastRegularWeek: number }): PlayoffRules {
  return meta.playoff ?? { teams: meta.playoffTeams, weekStart: meta.lastRegularWeek + 1, roundType: 0, seedType: 0, type: 0 };
}
