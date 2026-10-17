// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { NflState, SleeperDraft, SleeperLeague } from './contract';
import { detectPhase } from './phase';

const state = (o: Partial<NflState> = {}): NflState => ({ week: 6, season: '2026', league_season: '2026', season_type: 'regular', ...o });
const league = (o: Partial<SleeperLeague> = {}): SleeperLeague => ({
  league_id: 'L1', name: 'Test league', season: '2026', status: 'in_season', total_rosters: 12,
  roster_positions: [], scoring_settings: {}, settings: { playoff_week_start: 15 },
  previous_league_id: null, draft_id: 'D1', avatar: null, metadata: null, ...o,
});
const draft = (status: SleeperDraft['status']): SleeperDraft => ({
  draft_id: 'D1', league_id: 'L1', season: '2026', status, type: 'snake', start_time: null, settings: {}, draft_order: null,
});

describe('detectPhase', () => {
  it('in-season league during the regular season', () => {
    expect(detectPhase(state(), league(), draft('complete'))).toBe('in_season');
  });
  it('a live or paused draft wins over everything', () => {
    expect(detectPhase(state({ season_type: 'off' }), league({ status: 'pre_draft' }), draft('drafting'))).toBe('drafting');
    expect(detectPhase(state(), league(), draft('paused'))).toBe('drafting');
    expect(detectPhase(state({ season_type: 'pre' }), league({ status: 'drafting' }), null)).toBe('drafting');
  });
  it('pre-draft league before the season, even when the NFL calendar says off', () => {
    expect(detectPhase(state({ season_type: 'pre' }), league({ status: 'pre_draft' }), draft('pre_draft'))).toBe('pre_draft');
    expect(detectPhase(state({ season_type: 'off' }), league({ status: 'pre_draft' }), null)).toBe('pre_draft');
  });
  it('league playoffs start at playoff_week_start, before the NFL postseason', () => {
    expect(detectPhase(state({ week: 14 }), league(), null)).toBe('in_season');
    expect(detectPhase(state({ week: 15 }), league(), null)).toBe('postseason');
    expect(detectPhase(state({ week: 16 }), league({ settings: { playoff_week_start: 17 } }), null)).toBe('in_season');
  });
  it('complete league: postseason while football is on, offseason once it is off', () => {
    expect(detectPhase(state({ week: 17 }), league({ status: 'complete' }), null)).toBe('postseason');
    expect(detectPhase(state({ season_type: 'post', week: 1 }), league({ status: 'complete' }), null)).toBe('postseason');
    expect(detectPhase(state({ season_type: 'off' }), league({ status: 'complete' }), null)).toBe('offseason');
  });
  it("last season's league is offseason", () => {
    expect(detectPhase(state({ season_type: 'off', league_season: '2027', season: '2026' }), league({ status: 'complete' }), null)).toBe('offseason');
    expect(detectPhase(state({ season_type: 'pre', league_season: '2027' }), league({ status: 'in_season' }), null)).toBe('offseason');
  });
  it('falls back to state.season when league_season is missing', () => {
    expect(detectPhase(state({ league_season: undefined }), league(), null)).toBe('in_season');
  });
});
