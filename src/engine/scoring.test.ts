// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { makeScorer } from './model.ts';

const line = { pts_ppr: 20, pts_half_ppr: 17, pts_std: 14, pass_td: 2 };

describe('makeScorer (league scoring settings)', () => {
  it('uses the PPR column for full PPR', () => {
    expect(makeScorer({ rec: 1 })({ pts_ppr: 20, pts_half_ppr: 17, pts_std: 14 })).toBe(20);
  });
  it('uses the half-PPR column when rec is 0.5', () => {
    expect(makeScorer({ rec: 0.5 })({ pts_ppr: 20, pts_half_ppr: 17, pts_std: 14 })).toBe(17);
  });
  it('uses the standard column when rec is 0', () => {
    expect(makeScorer({ rec: 0 })({ pts_ppr: 20, pts_half_ppr: 17, pts_std: 14 })).toBe(14);
  });
  it('treats a missing rec as full PPR, and falls back to pts_ppr when the chosen column is absent', () => {
    expect(makeScorer({})({ pts_ppr: 20, pts_std: 14 })).toBe(20);
    expect(makeScorer({ rec: 0.5 })({ pts_ppr: 9 })).toBe(9);
  });
  it('rounds the rec cut-offs the way the reference does (≥0.75 PPR, ≥0.25 half)', () => {
    const l = { pts_ppr: 3, pts_half_ppr: 2, pts_std: 1 };
    expect(makeScorer({ rec: 0.75 })(l)).toBe(3);
    expect(makeScorer({ rec: 0.74 })(l)).toBe(2);
    expect(makeScorer({ rec: 0.25 })(l)).toBe(2);
    expect(makeScorer({ rec: 0.24 })(l)).toBe(1);
  });
  it('adjusts for passing-TD points relative to the 4-point baseline', () => {
    expect(makeScorer({ rec: 1, pass_td: 6 })(line)).toBe(20 + 2 * 2);
    expect(makeScorer({ rec: 1, pass_td: 4 })(line)).toBe(20);
    expect(makeScorer({ rec: 1, pass_td: 3 })(line)).toBe(20 - 2);
    expect(makeScorer({ rec: 1 })(line)).toBe(20); // unset pass_td means the Sleeper default of 4
  });
  it('adds TE, WR and RB catch bonuses per bonus reception', () => {
    const te = { pts_ppr: 10, bonus_rec_te: 6 };
    expect(makeScorer({ rec: 1, bonus_rec_te: 0.5 })(te)).toBe(13);
    expect(makeScorer({ rec: 1, bonus_rec_wr: 0.5 })(te)).toBe(10); // WR bonus does not apply to a TE line
    expect(makeScorer({ rec: 1, bonus_rec_wr: 0.25 })({ pts_ppr: 10, bonus_rec_wr: 8 })).toBe(12);
    expect(makeScorer({ rec: 1, bonus_rec_rb: 1 })({ pts_ppr: 10, bonus_rec_rb: 3 })).toBe(13);
    expect(makeScorer({ rec: 1, bonus_rec_te: 0.5, bonus_rec_wr: 0.25, bonus_rec_rb: 1, pass_td: 6 })({ pts_ppr: 10, bonus_rec_te: 2, bonus_rec_wr: 4, bonus_rec_rb: 1, pass_td: 1 })).toBe(10 + 1 + 1 + 1 + 2);
  });
  it('scores a missing line as zero', () => {
    expect(makeScorer({ rec: 1 })(null)).toBe(0);
    expect(makeScorer({ rec: 1 })(undefined)).toBe(0);
  });
});
