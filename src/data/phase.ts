import type { NflState, Phase, SleeperDraft, SleeperLeague } from './contract';

/* Which season phase a league is in. Drives the Home page layout and the default tabs.
   Inputs (all straight from Sleeper):
   - state.season_type: 'pre' | 'regular' | 'post' | 'off'  (NFL calendar, from /v1/state/nfl)
   - league.status:     'pre_draft' | 'drafting' | 'in_season' | 'complete'
   - draft?.status:     'pre_draft' | 'drafting' | 'paused' | 'complete'  (the league's current draft, may be missing)
   - league.season vs state.league_season tells you whether this is last year's league.
   Precedence: a live draft beats everything (draft day jumps to the assistant), then the league's
   own lifecycle, and the NFL calendar only breaks the tie for finished or out-of-date leagues. */
export function detectPhase(state: NflState, league: SleeperLeague, draft: SleeperDraft | null): Phase {
  if (draft && (draft.status === 'drafting' || draft.status === 'paused')) return 'drafting';
  if (league.status === 'drafting') return 'drafting';
  const currentSeason = state.league_season ?? state.season;
  if (league.season !== currentSeason) return 'offseason';
  if (league.status === 'pre_draft') return 'pre_draft';
  if (league.status === 'complete') return state.season_type === 'off' ? 'offseason' : 'postseason';
  // in_season: the league's playoffs start before the NFL's postseason, so use the league's own week
  const playoffStart = league.settings.playoff_week_start ?? 15;
  if (state.season_type === 'post' || (state.season_type === 'regular' && state.week >= playoffStart)) return 'postseason';
  if (state.season_type === 'off') return 'offseason';
  return 'in_season';
}
