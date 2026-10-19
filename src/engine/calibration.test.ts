// @vitest-environment node
/* The two corrections from the model-validation study (src/engine/calibration.ts): the team weekly SD scale and the
   late-season blend of projection and season average. Both are off in referenceCompat builds. */
import { describe, expect, it } from 'vitest';
import { planPull } from '../data/plan.ts';
import type { NflState, SleeperLeague, SleeperRoster } from '../data/contract.ts';
import type { ProjectionRow, WeekStats } from '../data/types.ts';
import {
  BLEND_MIN_GAMES, PROJECTION_BLEND_START_WEEK, SD_CALIBRATION, blendWeight, blendedMean, calibratedSd,
} from './calibration.ts';
import { createEngine, emptyScenario } from './index.ts';
import { winProb } from './league.ts';
import { buildModel } from './model.ts';
import { simInputFor } from './simInput.ts';
import { tradeSimInputs } from './trades.ts';
import type { LeaguePull } from './types.ts';

interface SP { pid: string; pos: string; team?: string; proj: number; actual?: Record<number, number>; roster?: number; inj?: string }

/** A two-team league in week `week`. `actual` gives points in the weeks the player played. */
function pull(week: number, players: SP[]): LeaguePull {
  const state: NflState = { week, season: '2026', season_type: 'regular', league_season: '2026' };
  const league = {
    league_id: 'LG', name: 'Synthetic', season: '2026', status: 'in_season', total_rosters: 2,
    roster_positions: ['QB', 'RB', 'FLEX', 'BN'], scoring_settings: { rec: 1 },
    settings: { playoff_week_start: 15, playoff_teams: 2, divisions: 0, waiver_budget: 100 },
    previous_league_id: null, draft_id: null, avatar: null, metadata: null,
  } as SleeperLeague;
  const plan = planPull(state, league);
  const projections: Record<number, ProjectionRow[]> = {};
  const stats: Record<number, WeekStats> = {};
  for (const w of [...plan.calWeeks, ...plan.projWeeks]) {
    projections[w] = players.map((p) => ({
      player_id: p.pid, week: w, team: p.team ?? 'AAA', stats: { pts_ppr: p.proj },
      player: { first_name: p.pid, last_name: 'X', position: p.pos, team: p.team ?? 'AAA', injury_status: p.inj ?? null },
    }));
  }
  for (const w of plan.statWeeks) {
    stats[w] = {};
    for (const p of players) if (p.actual?.[w] != null) stats[w]![p.pid] = { pts_ppr: p.actual[w]!, gms_active: 1 };
  }
  const rosters: SleeperRoster[] = [1, 2].map((rid) => ({
    roster_id: rid, owner_id: `u${rid}`, players: players.filter((p) => (p.roster ?? 1) === rid).map((p) => p.pid), starters: [], reserve: [], settings: { wins: 0, losses: 0 },
  }));
  const matchups: Record<number, never[]> = {};
  for (const w of plan.matchWeeks) matchups[w] = [];
  return {
    leagueId: 'LG', userId: 'u1', state, league, plan, rosters,
    users: [{ user_id: 'u1', display_name: 'Me', avatar: null }, { user_id: 'u2', display_name: 'You', avatar: null }],
    schedule: [], trending: [], matchups, stats, projections, asOf: 123, stale: false, errors: [],
  };
}
const weeks = (from: number, to: number, v: number): Record<number, number> => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, v]));
const mu = (m: ReturnType<typeof buildModel>, pid: string, w: number) => m.players.find((p) => p.pid === pid)!.mu[w]!;

describe('SD calibration', () => {
  it('the constant is the validation report\'s 1.245', () => {
    expect(SD_CALIBRATION).toBe(1.245);
    expect(calibratedSd(18, false)).toBeCloseTo(22.41, 10);
    expect(calibratedSd(18, true)).toBe(18);
  });

  const players: SP[] = [
    { pid: 'q', pos: 'QB', proj: 18, roster: 1 }, { pid: 'r', pos: 'RB', proj: 12, roster: 1 }, { pid: 'w', pos: 'WR', proj: 11, roster: 1 },
    { pid: 'q2', pos: 'QB', proj: 17, roster: 2 }, { pid: 'r2', pos: 'RB', proj: 11, roster: 2 }, { pid: 'w2', pos: 'WR', proj: 10, roster: 2 },
  ];
  const p = pull(6, players);
  const def = buildModel(p, { userId: 'u1' });
  const compat = buildModel(p, { userId: 'u1', referenceCompat: true });

  it('the default model carries the calibrated SD, with the raw one kept beside it', () => {
    expect(def.meta.teamWeeklySdRaw).toBeGreaterThan(10);
    expect(def.meta.sdCalibration).toBe(SD_CALIBRATION);
    expect(def.meta.teamWeeklySd).toBeCloseTo(def.meta.teamWeeklySdRaw! * SD_CALIBRATION, 10);
  });
  it('referenceCompat stays uncalibrated', () => {
    expect(compat.meta.sdCalibration).toBe(1);
    expect(compat.meta.teamWeeklySd).toBe(compat.meta.teamWeeklySdRaw);
    expect(compat.meta.teamWeeklySd).toBeCloseTo(def.meta.teamWeeklySdRaw!, 10);
  });
  it('every probability reads that SD: simulation input, weekly win chance and trade odds', () => {
    const eng = createEngine(def);
    expect(simInputFor(def, {}).sd).toBe(def.meta.teamWeeklySd);
    expect(eng.winProb(100, 90)).toBeCloseTo(winProb(100, 90, def.meta.teamWeeklySdRaw! * SD_CALIBRATION), 12);
    expect(eng.winProb(100, 90)).toBeLessThan(winProb(100, 90, def.meta.teamWeeklySdRaw!)); // less extreme than before
    expect(eng.winProb(100, 90)).toBeGreaterThan(0.5);
    const t = tradeSimInputs(def, emptyScenario(), { partnerRid: 2, send: ['r'], get: ['r2'] });
    expect(t.before.sd).toBe(def.meta.teamWeeklySd);
    expect(t.after.sd).toBe(def.meta.teamWeeklySd);
  });
  it('the weekly swing slider multiplies the calibrated SD (1 means the calibrated one)', () => {
    const eng = createEngine(def);
    expect(eng.winProb(100, 90, 1.2)).toBeCloseTo(winProb(100, 90, def.meta.teamWeeklySd * 1.2), 12);
  });
});

describe('late-season blend: unit', () => {
  it('weights the season average gp / (gp + 10) and the projection the rest', () => {
    expect(blendWeight(10)).toBeCloseTo(0.5, 12);
    expect(blendWeight(0)).toBe(0);
    expect(blendedMean(10, 20, 10)).toBeCloseTo(15, 12); // 0.5 × 10 + 0.5 × 20
    expect(blendedMean(10, 20, 15)).toBeCloseTo(0.4 * 10 + 0.6 * 20, 12);
    expect(blendedMean(20, 10, 10)).toBeCloseTo(15, 12); // pulls down as well as up
  });
  it('is the projection alone below the minimum games, without an average, or when the projection says he will not play', () => {
    expect(BLEND_MIN_GAMES).toBe(5);
    expect(blendedMean(10, 20, 4)).toBe(10);
    expect(blendedMean(10, 20, 5)).not.toBe(10);
    expect(blendedMean(10, null, 9)).toBe(10);
    expect(blendedMean(0.4, 20, 9)).toBe(0.4);
    expect(blendedMean(0, 20, 9)).toBe(0);
  });
});

describe('late-season blend: in the model', () => {
  const start = PROJECTION_BLEND_START_WEEK;
  /** a veteran averaging 20 over every week before `week`, a player with four games, a rookie with none, a defense, a questionable starter */
  const roster = (week: number): SP[] => [
    { pid: 'vet', pos: 'RB', proj: 10, roster: 1, actual: weeks(1, week - 1, 20) },
    { pid: 'few', pos: 'RB', proj: 10, roster: 1, actual: weeks(week - 4, week - 1, 20) },
    { pid: 'rook', pos: 'WR', proj: 10, roster: 1 },
    { pid: 'DEN', pos: 'DEF', team: 'DEN', proj: 10, roster: 1, actual: weeks(1, week - 1, 20) },
    { pid: 'quest', pos: 'RB', proj: 10, roster: 1, inj: 'Questionable', actual: weeks(1, week - 1, 20) },
    { pid: 'low', pos: 'RB', proj: 0.3, roster: 1, actual: weeks(1, week - 1, 20) },
    { pid: 'opp', pos: 'RB', proj: 10, roster: 2 },
  ];

  it('is unchanged in the early weeks: the start week is week 9, and week 8 uses the projection', () => {
    expect(start).toBe(9);
    const m = buildModel(pull(start - 1, roster(start - 1)), { userId: 'u1' });
    expect(m.meta.projectionBlend).toEqual({ startWeek: start, active: false });
    expect(mu(m, 'vet', start - 1)).toBe(10);
    expect(mu(m, 'vet', start + 1)).toBe(10);
  });
  it('blends from the start week on: week 9, a veteran with 8 games averaging 20', () => {
    const m = buildModel(pull(start, roster(start)), { userId: 'u1' });
    expect(m.meta.projectionBlend).toEqual({ startWeek: start, active: true });
    const w = 8 / 18; // gp / (gp + 10)
    expect(mu(m, 'vet', start)).toBeCloseTo((1 - w) * 10 + w * 20, 2);
    expect(mu(m, 'vet', start + 2)).toBeCloseTo((1 - w) * 10 + w * 20, 2); // later weeks use the same history
  });
  it('weights the average more as the season goes on (week 11: 10 games, half and half)', () => {
    const m = buildModel(pull(11, roster(11)), { userId: 'u1' });
    expect(mu(m, 'vet', 11)).toBeCloseTo(15, 2);
  });
  it('leaves players with fewer than 5 games on the projection', () => {
    const m = buildModel(pull(start, roster(start)), { userId: 'u1' });
    expect(mu(m, 'few', start)).toBe(10); // 4 games
    expect(mu(m, 'rook', start)).toBe(10); // none
  });
  it('does not touch defenses, projections at or under half a point, or the injury multiplier order', () => {
    const m = buildModel(pull(start, roster(start)), { userId: 'u1' });
    expect(mu(m, 'DEN', start)).toBe(10);
    expect(mu(m, 'low', start)).toBe(0.3);
    const w = 8 / 18, blended = (1 - w) * 10 + w * 20;
    expect(mu(m, 'quest', start)).toBeCloseTo(0.85 * blended, 2); // the blend, then the Questionable multiplier
    expect(mu(m, 'quest', start + 1)).toBeCloseTo(blended, 2);
  });
  it('is off in referenceCompat', () => {
    const m = buildModel(pull(start + 2, roster(start + 2)), { userId: 'u1', referenceCompat: true });
    expect(m.meta.projectionBlend).toEqual({ startWeek: start, active: false });
    expect(mu(m, 'vet', start + 2)).toBe(10);
    expect(mu(m, 'vet', start + 3)).toBe(10);
  });
  it('feeds the team\'s expected points', () => {
    const early = buildModel(pull(start - 1, roster(start - 1)), { userId: 'u1' });
    const late = buildModel(pull(start, roster(start)), { userId: 'u1' });
    // slots QB, RB, FLEX: the veteran and 'quest' (blended up) take RB and FLEX
    expect(late.teams.find((t) => t.rid === 1)!.exp[start + 1]!).toBeGreaterThan(early.teams.find((t) => t.rid === 1)!.exp[start]! + 5);
  });
});
