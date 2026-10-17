// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { SleeperLeague } from '../../data/contract.ts';
import type { SleeperClient } from '../../data/sleeper.ts';
import { loadDraftInputs } from './load.ts';
import { leagueOf } from './test-helpers.ts';

const fetched = (data: unknown) => ({ data, asOf: 100, fromCache: false, stale: false });

function fakeSleeper() {
  return {
    seasonProjections: vi.fn(async () => fetched([])),
    draft: vi.fn(async () => fetched({ draft_id: 'd', settings: {} })),
    draftPicks: vi.fn(async () => fetched([])),
    draftTradedPicks: vi.fn(async () => fetched([])),
    fantasyCalc: vi.fn(async () => fetched([{ player: { name: 'A', sleeperId: '1', position: 'WR' }, value: 5, overallRank: 1, positionRank: 1 }])),
    players: vi.fn(async () => fetched({})),
  };
}
const league = { ...leagueOf(), league_id: 'L', season: '2026', draft_id: 'd' } as unknown as SleeperLeague;

describe('loadDraftInputs', () => {
  it('passes force through to FantasyCalc, and asks for dynasty values in startup and rookie modes of a redraft league', async () => {
    for (const mode of ['startup', 'rookie'] as const) {
      const s = fakeSleeper();
      const r = await loadDraftInputs(s as unknown as SleeperClient, league, { mode, force: true });
      expect(r.fantasyCalc.ok).toBe(true);
      expect(r.fantasyCalc.params.isDynasty).toBe(true);
      expect(s.fantasyCalc).toHaveBeenCalledWith(expect.objectContaining({ isDynasty: true }), { force: true });
    }
  });
  it('an unforced load stays unforced, and a redraft draft does not touch FantasyCalc', async () => {
    const s = fakeSleeper();
    await loadDraftInputs(s as unknown as SleeperClient, league, { mode: 'startup' });
    expect(s.fantasyCalc).toHaveBeenCalledWith(expect.anything(), { force: undefined });
    const r = fakeSleeper();
    await loadDraftInputs(r as unknown as SleeperClient, league, { mode: 'redraft' });
    expect(r.fantasyCalc).not.toHaveBeenCalled();
  });
});
