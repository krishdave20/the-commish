import { describe, expect, it } from 'vitest';
import { expectedTds, isXtdModel, tdGap, xtdProbability, type XtdModel } from './xtd.ts';

const model: XtdModel = {
  version: 1,
  fit_season: 2025,
  buckets: [
    { play_type: 'pass', yardline_from: 1, yardline_to: 4, p_td: 0.4, n: 100 },
    { play_type: 'pass', yardline_from: 5, yardline_to: 19, p_td: 0.15, n: 400 },
    { play_type: 'pass', yardline_from: 20, yardline_to: 60, p_td: 0.04, n: 900 },
    { play_type: 'rush', yardline_from: 1, yardline_to: 2, p_td: 0.5, n: 100 },
    { play_type: 'rush', yardline_from: 3, yardline_to: 10, p_td: 0.2, n: 300 },
  ],
};

describe('xtdProbability', () => {
  it('looks up by play type and yardline_100; both bucket edges are inclusive', () => {
    expect(xtdProbability(model, 'pass', 1)).toBe(0.4);
    expect(xtdProbability(model, 'pass', 4)).toBe(0.4);
    expect(xtdProbability(model, 'pass', 5)).toBe(0.15);
    expect(xtdProbability(model, 'pass', 19)).toBe(0.15);
    expect(xtdProbability(model, 'pass', 20)).toBe(0.04);
    expect(xtdProbability(model, 'rush', 2)).toBe(0.5);
    expect(xtdProbability(model, 'rush', 3)).toBe(0.2);
  });
  it('single-yard buckets (from = to), as the notebook writes them, match exactly that yard', () => {
    const m: XtdModel = { version: 1, fit_season: 2025, buckets: [
      { play_type: 'pass', yardline_from: 1, yardline_to: 1, p_td: 0.58, n: 79 },
      { play_type: 'pass', yardline_from: 2, yardline_to: 2, p_td: 0.54, n: 98 },
      { play_type: 'pass', yardline_from: 4, yardline_to: 5, p_td: 0.47, n: 219 },
    ] };
    expect(xtdProbability(m, 'pass', 1)).toBe(0.58);
    expect(xtdProbability(m, 'pass', 2)).toBe(0.54);
    expect(xtdProbability(m, 'pass', 5)).toBe(0.47);
    // 3 falls between buckets: nearest wins (2 is one yard away, 4 is one yard away; the earlier bucket is kept)
    expect(xtdProbability(m, 'pass', 3)).toBe(0.54);
  });
  it('the farthest bucket includes its upper edge', () => {
    expect(xtdProbability(model, 'pass', 60)).toBe(0.04);
    expect(xtdProbability(model, 'rush', 10)).toBe(0.2);
  });
  it('outside every bucket it uses the nearest bucket of the same type', () => {
    expect(xtdProbability(model, 'pass', 80)).toBe(0.04);
    expect(xtdProbability(model, 'pass', 0)).toBe(0.4);
    expect(xtdProbability(model, 'rush', 45)).toBe(0.2);
  });
  it('null for a missing yardline or a play type with no buckets', () => {
    expect(xtdProbability(model, 'pass', null)).toBeNull();
    expect(xtdProbability({ ...model, buckets: model.buckets.filter((b) => b.play_type === 'pass') }, 'rush', 2)).toBeNull();
  });
});

describe('expected TDs and the gap', () => {
  it('sums p(TD) over the plays: 3 targets at 4, 12, 30 = 0.4 + 0.15 + 0.04', () => {
    expect(expectedTds(model, 'pass', [4, 12, 30])).toBe(0.59);
    expect(expectedTds(model, 'rush', [2, 2, 8])).toBe(1.2);
    expect(expectedTds(model, 'pass', [])).toBe(0);
  });
  it('is null without a model', () => {
    expect(expectedTds(null, 'pass', [4])).toBeNull();
  });
  it('td gap = TDs - xTD', () => {
    expect(tdGap(2, 1.2)).toBe(0.8);
    expect(tdGap(0, 1.2)).toBe(-1.2);
    expect(tdGap(3, null)).toBeNull();
  });
  it('recognizes the model file format', () => {
    expect(isXtdModel(model)).toBe(true);
    expect(isXtdModel(null)).toBe(false);
    expect(isXtdModel({ version: 1, fit_season: 2025, buckets: [{ play_type: 'kick' }] })).toBe(false);
    expect(isXtdModel({ version: 1, buckets: [] })).toBe(false);
  });
});
