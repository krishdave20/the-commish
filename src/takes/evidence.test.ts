// @vitest-environment node
/* Evidence from the notebook: tone override, verdict multipliers, track-record strings, and the coverage relevance filter.
   Uses explicit threshold fixtures, never the live data/takes_thresholds.json, so a re-tune cannot break these. */
import { describe, expect, it } from 'vitest';
import type { Candidate } from './common.ts';
import { buildTakes } from './index.ts';
import { NOT_BACKTESTED_FACTOR, NOT_BACKTESTED_TEXT, VERDICT_FACTOR, applyEvidence, trackRecordFor } from './evidence.ts';
import { DEFAULT_THRESHOLDS } from './thresholds.ts';
import { games, makeInputs, weekRow, type World } from './testData.ts';
import type { CoverageRow } from '../data/nflverseTypes.ts';
import type { TakesThresholds } from './types.ts';

const ev = (evidence: Record<string, unknown>): TakesThresholds => ({ ...DEFAULT_THRESHOLDS, evidence });

function cand(kind: Candidate['kind'], over: Partial<Candidate> = {}, facts?: Candidate['facts']): Candidate {
  const f: Record<string, Candidate['facts']> = {
    usage_spike: { kind: 'usage_spike', now: 0.8, base: 0.5, baseFrom: 2, baseTo: 4, baseGames: 3, week: 5 },
    sell_high: { kind: 'sell_high', tds: 5, xtd: 2.2, gap: 2.8, opps: 40, games: 5 },
    rz_role_change: { kind: 'rz_role_change', now: 0.4, prior: 0.1, up: true, from: 3, to: 5, touchesNow: 7, touchesPrior: 2, teamPlays: 30 },
    waiver_riser: { kind: 'waiver_riser', adds: 5000, measure: 'snap share', now: 0.6, base: 0.4, from: 2, to: 4, baseGames: 3, week: 5 },
  };
  return {
    id: `${kind}:1:6`, kind, pid: '1', player: 'Test Player', pos: 'WR', team: 'AAA', season: '2026', week: 6, throughWeek: 5, tone: 'good', score: 0.5,
    sample: { label: 'games', n: 3 }, dataLabel: null, sources: ['nflverse'], actions: ['profile'], facts: facts ?? f[kind]!, ...over,
  };
}

const base = { backtested: true, n: 119, hit_rate: 0.454, universe_hit_rate: 0.37 };

describe('tone from evidence', () => {
  it('suggested_tone overrides the detector\'s tone', () => {
    const out = applyEvidence(cand('usage_spike'), ev({ usage_spike: { ...base, verdict: 'signal', suggested_tone: 'watch' } }));
    expect(out.tone).toBe('watch');
  });
  it('keeps the detector\'s tone with no evidence, no suggestion or an invalid one', () => {
    expect(applyEvidence(cand('usage_spike'), ev({})).tone).toBe('good');
    expect(applyEvidence(cand('usage_spike'), ev({ usage_spike: { ...base } })).tone).toBe('good');
    expect(applyEvidence(cand('usage_spike'), ev({ usage_spike: { ...base, suggested_tone: 'hype' } })).tone).toBe('good');
    expect(applyEvidence(cand('sell_high', { tone: 'bad' }), ev({ sell_high: { ...base, suggested_tone: 'bad' } })).tone).toBe('bad');
  });
  it('rz_role_change: a direction\'s own suggestion beats the pooled one; otherwise the pooled "watch" applies', () => {
    const down = cand('rz_role_change', { tone: 'bad' }, { kind: 'rz_role_change', now: 0.1, prior: 0.4, up: false, from: 3, to: 5, touchesNow: 2, touchesPrior: 7, teamPlays: 30 });
    const e = { rz_role_change: { ...base, suggested_tone: 'watch', by_direction: { up: { n: 109, hit_rate: 0.394, suggested_tone: 'good' }, down: { n: 82, hit_rate: 0.585 } } } };
    expect(applyEvidence(cand('rz_role_change'), ev(e)).tone).toBe('good');
    expect(applyEvidence(down, ev(e)).tone).toBe('watch');
  });
});

describe('verdict multipliers', () => {
  const scored = (e: Record<string, unknown>) => applyEvidence(cand('usage_spike', { score: 0.5 }), ev({ usage_spike: e })).score;
  it('signal 1.0, weak 0.8, none and leans_wrong 0.6', () => {
    expect(VERDICT_FACTOR).toEqual({ signal: 1, weak: 0.8, none: 0.6, leans_wrong: 0.6 });
    expect(scored({ ...base, verdict: 'signal' })).toBe(0.5);
    expect(scored({ ...base, verdict: 'weak' })).toBe(0.4);
    expect(scored({ ...base, verdict: 'none' })).toBe(0.3);
    expect(scored({ ...base, verdict: 'leans_wrong' })).toBe(0.3);
  });
  it('not backtested: 0.7', () => {
    expect(NOT_BACKTESTED_FACTOR).toBe(0.7);
    expect(scored({ backtested: false })).toBe(0.35);
  });
  it('no evidence at all: unchanged', () => {
    expect(applyEvidence(cand('usage_spike'), ev({})).score).toBe(0.5);
    expect(scored({ ...base })).toBe(0.5); // backtested but no verdict
  });
  it('a weaker verdict can drop a take below a lower-scored one with better evidence', () => {
    const weak = applyEvidence(cand('usage_spike', { score: 0.6 }), ev({ usage_spike: { ...base, verdict: 'none' } }));
    const strong = applyEvidence(cand('sell_high', { score: 0.5, tone: 'bad' }), ev({ sell_high: { ...base, verdict: 'signal' } }));
    expect(weak.score).toBeLessThan(strong.score);
  });
});

describe('track record strings', () => {
  it('backtested, beat-projection direction', () => {
    expect(trackRecordFor(cand('usage_spike'), ev({ usage_spike: { ...base, verdict: 'weak' } })))
      .toBe('2025 backtest: beat projection 45% of the time vs 37% for all players (119 takes)');
  });
  it('a bad-direction detector reads "fell short of projection"', () => {
    expect(trackRecordFor(cand('sell_high', { tone: 'bad' }), ev({ sell_high: { backtested: true, n: 112, hit_rate: 0.688, universe_hit_rate: 0.633 } })))
      .toBe('2025 backtest: fell short of projection 69% of the time vs 63% for all players (112 takes)');
  });
  it('rz_role_change uses the direction\'s numbers', () => {
    const e = { rz_role_change: { backtested: true, n: 191, hit_rate: 0.476, universe_hit_rate: 0.482, by_direction: { up: { n: 109, hit_rate: 0.394 }, down: { n: 82, hit_rate: 0.585 } } } };
    expect(trackRecordFor(cand('rz_role_change'), ev(e))).toBe('2025 backtest: beat projection 39% of the time vs 48% for all players (109 takes)');
    const down = cand('rz_role_change', { tone: 'bad' }, { kind: 'rz_role_change', now: 0.1, prior: 0.4, up: false, from: 3, to: 5, touchesNow: 2, touchesPrior: 7, teamPlays: 30 });
    expect(trackRecordFor(down, ev(e))).toBe('2025 backtest: fell short of projection 59% of the time vs 48% for all players (82 takes)');
  });
  it('not backtested', () => {
    expect(trackRecordFor(cand('waiver_riser'), ev({ waiver_riser: { backtested: false, reason: 'no history' } }))).toBe('not backtested: no 2025 history for this data');
    expect(NOT_BACKTESTED_TEXT).toBe('not backtested: no 2025 history for this data');
  });
  it('null when there is no evidence, or it is incomplete', () => {
    expect(trackRecordFor(cand('usage_spike'), ev({}))).toBeNull();
    expect(trackRecordFor(cand('usage_spike'), ev({ usage_spike: { backtested: true, n: 5 } }))).toBeNull();
  });
  it('lands on the take, lowercase, and the take keeps the detector order of magnitude', () => {
    const w: World = {
      players: [{ pid: 'p1', pos: 'WR', owner: 1 }],
      weekly: [...games('p1', () => ({}), [2, 3, 4]), weekRow('p1', 5, { off_snaps: 48 })], // 80% vs 50%
    };
    const th = ev({ usage_spike: { ...base, verdict: 'weak', suggested_tone: 'watch' } });
    const [t] = buildTakes(makeInputs(w), th);
    expect(t).toMatchObject({ kind: 'usage_spike', tone: 'watch', trackRecord: '2025 backtest: beat projection 45% of the time vs 37% for all players (119 takes)' });
    expect(t!.trackRecord).toBe(t!.trackRecord!.toLowerCase());
    const [plain] = buildTakes(makeInputs(w), ev({}));
    expect(plain!.trackRecord).toBeNull();
    expect(t!.score).toBeCloseTo(plain!.score * 0.8, 3);
  });
});

describe('coverage notes are limited to your roster, the wire and trade targets', () => {
  const row: CoverageRow = {
    pid: 'c1', team: 'AAA', routes: 150, tgt: 20, rec: 12, yds: 200, td: 1, man_routes: 30, man_tgt: 6, man_rec: 4, man_yds: 60, man_td: 0,
    zone_routes: 100, zone_tgt: 14, zone_rec: 8, zone_yds: 140, zone_td: 1, yprr: 1.3, tprr: 0.13, yprr_man: 2.0, tprr_man: 0.2, yprr_zone: 1.4, tprr_zone: 0.14,
  };
  const world = (owner: number, extra: Partial<World> = {}): World => ({
    players: [{ pid: 'c1', pos: 'WR', owner }], weekly: games('c1'), ...extra,
    coverage: { rows: [row], teams: { BBB: { dropbacks: 600, man: 0, zone: 0, man_rate: 0.6, shells: {} } }, isCurrent: false, season: '2025' },
  });
  const kinds = (w: World) => buildTakes(makeInputs(w), DEFAULT_THRESHOLDS).filter((t) => t.kind === 'coverage_note').map((t) => t.relevance);
  it('mine, waiver and trade_target stay', () => {
    expect(kinds(world(1))).toEqual(['mine']);
    expect(kinds(world(0))).toEqual(['waiver']);
    expect(kinds(world(2, { watchlist: ['c1'] }))).toEqual(['trade_target']);
    expect(kinds(world(2, { tradeTargets: ['c1'] }))).toEqual(['trade_target']);
  });
  it('league-wide coverage notes are dropped', () => expect(kinds(world(2))).toEqual([]));
});
