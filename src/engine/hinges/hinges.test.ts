import { describe, expect, it } from 'vitest';
import { winProb } from '../league.ts';
import { buildView } from '../live/derive.ts';
import { ctx, games, snapshot } from '../live/test-helpers.ts';
import { liveWinProb } from '../live/winprob.ts';
import { handModel } from '../test-helpers.ts';
import { hingesOf, matchupHinges, replacementLevels, sidesFromLive, sidesFromModel } from './index.ts';
import type { HingeOpts, HingeSide, HingeStarter } from './index.ts';

const starter = (o: Partial<HingeStarter> & { pid: string; pos: string; mu: number }): HingeStarter => ({
  slot: o.pos, name: o.pid, nfl: 'AAA', state: 'pre', actual: 0, remaining: 1, opp: 'BBB', home: true, statusText: '', kickoff: 1000, ...o,
});
const side = (name: string, isMe: boolean, starters: HingeStarter[], actual = starters.reduce((s, p) => s + p.actual, 0)): HingeSide =>
  ({ rid: isMe ? 1 : 2, name, isMe, actual, starters });
const opts = (over: Partial<HingeOpts> = {}): HingeOpts => ({ sd: 20, replacement: { QB: 14, RB: 8, WR: 7 }, ...over });

describe('replacementLevels', () => {
  const model = handModel({
    slots: ['QB', 'RB', 'WR'], teams: [{ rid: 1 }, { rid: 2 }],
    players: [
      { pid: 'q', pos: 'QB', mu: 20, owner: 1 },
      // free-agent WRs: 14 of them, the top 12 are 20..9 (the median of 20,19,...,9 is 14.5)
      ...Array.from({ length: 14 }, (_, i) => ({ pid: `w${i}`, pos: 'WR' as const, mu: 20 - i, owner: 0 })),
      { pid: 'k1', pos: 'K', mu: 8, owner: 0 },
      { pid: 'k2', pos: 'K', mu: 6, owner: 0 },
      { pid: 'played', pos: 'RB', mu: 40, owner: 0, played: true },
      { pid: 'bye', pos: 'RB', mu: 12, owner: 0, bye: [5] },
      { pid: 'rb1', pos: 'RB', mu: 10, owner: 0 },
      { pid: 'rb2', pos: 'RB', mu: 6, owner: 0 },
      { pid: 'rb3', pos: 'RB', mu: 2, owner: 0 },
    ],
  });

  it('is the median of the top 12 free agents at the position', () => {
    expect(replacementLevels(model, 5).WR).toBe(14.5);
    expect(replacementLevels(model, 5, 4).WR).toBe(18.5);
  });

  it('takes whoever there is at a thin position, and skips rostered, played and bye players', () => {
    const r = replacementLevels(model, 5);
    expect(r.K).toBe(7);
    // played (his 40 is an actual score) and bye are out; rb1/rb2/rb3 remain: median 6
    expect(r.RB).toBe(6);
    expect(r.QB).toBeUndefined();
  });
});

describe('hingesOf', () => {
  const mine = side('me', true, [
    starter({ pid: 'qb', pos: 'QB', mu: 28 }), // far above replacement (14)
    starter({ pid: 'rb', pos: 'RB', mu: 8 }), // exactly replacement level
    starter({ pid: 'wr', pos: 'WR', mu: 15 }),
  ]);
  const theirs = side('them', false, [
    starter({ pid: 'tq', pos: 'QB', mu: 20 }), starter({ pid: 'tr', pos: 'RB', mu: 12 }), starter({ pid: 'tw', pos: 'WR', mu: 10 }),
  ]);

  it('before kickoff the win chance is the engine\'s winProb', () => {
    const h = hingesOf(mine, theirs, opts());
    expect(h.winNow).toBeCloseTo(winProb(51, 42, 20), 10);
    expect(h.started).toBe(false);
  });

  it('puts a strong starter well above zero and a replacement-level one at zero', () => {
    const h = hingesOf(mine, theirs, opts());
    const byPid = Object.fromEntries(h.rows.map((r) => [r.pid, r]));
    expect(byPid.qb!.atStake).toBeGreaterThan(5);
    expect(byPid.wr!.atStake).toBeGreaterThan(0);
    expect(byPid.rb!.atStake).toBeCloseTo(0, 10);
    // the swap is worth (mu - replacement) points, run through the same win chance
    expect(byPid.qb!.swing).toBe(14);
    expect(byPid.qb!.winWithout).toBeCloseTo(winProb(51 - 14, 42, 20), 10);
    expect(byPid.qb!.atStake).toBeCloseTo((winProb(51, 42, 20) - winProb(37, 42, 20)) * 100, 8);
  });

  it('sorts by what is at stake, biggest first', () => {
    const h = hingesOf(mine, theirs, opts());
    expect(h.rows.map((r) => r.pid)).toEqual(['qb', 'wr', 'rb']);
    for (let i = 1; i < h.rows.length; i++) expect(h.rows[i - 1]!.atStake).toBeGreaterThanOrEqual(h.rows[i]!.atStake);
  });

  it('shows a negative number when a typical free agent would be the better play', () => {
    const weak = side('me', true, [starter({ pid: 'qb', pos: 'QB', mu: 4 }), starter({ pid: 'wr', pos: 'WR', mu: 15 })]);
    const h = hingesOf(weak, theirs, opts());
    expect(h.rows.find((r) => r.pid === 'qb')!.atStake).toBeLessThan(0);
    expect(h.rows[h.rows.length - 1]!.pid).toBe('qb');
  });

  it('a finished player has nothing at stake, and his points stay in the projection', () => {
    const done = side('me', true, [
      starter({ pid: 'qb', pos: 'QB', mu: 28, state: 'final', actual: 31, remaining: 0, statusText: 'final' }),
      starter({ pid: 'wr', pos: 'WR', mu: 15 }),
    ]);
    const h = hingesOf(done, theirs, opts());
    const qb = h.rows.find((r) => r.pid === 'qb')!;
    expect(qb.atStake).toBe(0);
    expect(qb.winWithout).toBe(h.winNow);
    expect(qb.projection).toBe(31);
    // projection = 31 actual + 15 to come
    expect(h.projection).toBe(46);
    expect(h.started).toBe(true);
  });

  it('for a game in progress only the unplayed share is swapped; points scored stay', () => {
    const wr = starter({ pid: 'wr', pos: 'WR', mu: 15, state: 'live', actual: 12, remaining: 0.4, statusText: 'q3 10:00' });
    const live = side('me', true, [starter({ pid: 'qb', pos: 'QB', mu: 20, state: 'final', actual: 20, remaining: 0 }), wr]);
    const foe = side('them', false, [starter({ pid: 'tq', pos: 'QB', mu: 20 }), starter({ pid: 'tw', pos: 'WR', mu: 10 })]);
    const h = hingesOf(live, foe, opts());
    const row = h.rows.find((r) => r.pid === 'wr')!;
    // swing = (15 - 7) × 0.4 = 3.2, not 15 - 7 = 8
    expect(row.swing).toBe(3.2);
    const projMe = 20 + 12 + 15 * 0.4, projThem = 30, remMe = 0.2, remThem = 1;
    expect(h.winNow).toBeCloseTo(liveWinProb(projMe, projThem, 20, remMe, remThem), 10);
    expect(row.winWithout).toBeCloseTo(liveWinProb(projMe - 3.2, projThem, 20, remMe, remThem), 10);
    expect(row.atStake).toBeGreaterThan(0);
    // far less than if he had not played yet
    const fresh = hingesOf(side('me', true, [live.starters[0]!, { ...wr, state: 'pre', actual: 0, remaining: 1 }]), foe, opts());
    expect(fresh.rows.find((r) => r.pid === 'wr')!.atStake).toBeGreaterThan(row.atStake);
  });

  it('scores the opponent from their side: their win chance, and the two chances add to one', () => {
    const both = matchupHinges(mine, theirs, opts());
    expect(both.theirs.isMe).toBe(false);
    expect(both.theirs.winNow).toBeCloseTo(1 - both.mine.winNow, 10);
    // their best QB (20 vs replacement 14) matters, and the rows are their starters
    expect(both.theirs.rows.map((r) => r.pid).sort()).toEqual(['tq', 'tr', 'tw']);
    expect(both.theirs.rows[0]!.atStake).toBeGreaterThan(0);
    expect(both.theirs.rows.find((r) => r.pid === 'tq')!.winWithout).toBeCloseTo(winProb(42 - 6, 51, 20), 10);
  });

  it('carries points per game and snap share through, and leaves them null when unknown', () => {
    const h = hingesOf(mine, theirs, opts({ perGame: (pid) => (pid === 'qb' ? 22.5 : null), snaps: (pid) => (pid === 'wr' ? 0.87 : undefined) }));
    expect(h.rows.find((r) => r.pid === 'qb')!.perGame).toBe(22.5);
    expect(h.rows.find((r) => r.pid === 'wr')!.snapPct).toBe(0.87);
    expect(h.rows.find((r) => r.pid === 'rb')!.snapPct).toBeNull();
    expect(h.rows.find((r) => r.pid === 'rb')!.perGame).toBeNull();
  });

  it('a position with no replacement data replaces to zero', () => {
    const h = hingesOf(mine, theirs, opts({ replacement: {} }));
    expect(h.rows.find((r) => r.pid === 'rb')!.swing).toBe(8);
  });
});

describe('sidesFromLive', () => {
  it('turns a live matchup into sides whose live win chance matches the view\'s own', () => {
    const c = ctx();
    const view = buildView(c, snapshot({ q1: 12, r1: 5 }, games('live', 0.5)));
    const m = view.mine!;
    const { mine, theirs } = sidesFromLive(m);
    expect(mine.isMe).toBe(true);
    expect(mine.starters.map((p) => p.pid)).toEqual(['q1', 'r1', 'w1']);
    expect(mine.starters[0]!.statusText).toBe('q3 7:30');
    expect(mine.starters[0]!.opp).toBe('BBB');
    const h = hingesOf(mine, theirs, { sd: c.sd, replacement: { QB: 10, RB: 8, WR: 6 } });
    const winMine = m.a.isMe ? m.winA : 1 - m.winA;
    expect(h.winNow).toBeCloseTo(winMine, 10);
  });

  it('a finished game is worth nothing, an unplayed one is worth something', () => {
    const c = ctx();
    const gs = games('pre');
    // AAA@BBB (q1 and r1's teams) is over; the rest not started
    gs[0] = { ...gs[0]!, state: 'final', elapsed: 1, quarter: 'F' };
    const view = buildView(c, snapshot({ q1: 25, r1: 3 }, gs));
    const { mine, theirs } = sidesFromLive(view.mine!);
    const h = hingesOf(mine, theirs, { sd: c.sd, replacement: { QB: 10, RB: 8, WR: 6 } });
    expect(h.rows.find((r) => r.pid === 'q1')!.atStake).toBe(0);
    expect(h.rows.find((r) => r.pid === 'w1')!.atStake).toBeGreaterThan(0);
    expect(h.rows.find((r) => r.pid === 'q1')!.projection).toBe(25);
  });
});

describe('sidesFromModel', () => {
  const model = handModel({
    cur: 5, slots: ['QB', 'WR'], sd: 20, teams: [{ rid: 1, starters: ['q1', 'w1'] }, { rid: 2, starters: ['q2', 'w2'] }], games: [[5, 1, 2]],
    players: [
      { pid: 'q1', pos: 'QB', mu: 24, owner: 1 }, { pid: 'w1', pos: 'WR', mu: 12, owner: 1 }, { pid: 'b1', pos: 'WR', mu: 5, owner: 1 },
      { pid: 'q2', pos: 'QB', mu: 18, owner: 2 }, { pid: 'w2', pos: 'WR', mu: 14, owner: 2 },
      { pid: 'fq', pos: 'QB', mu: 12, owner: 0 }, { pid: 'fw', pos: 'WR', mu: 6, owner: 0 },
    ],
  });

  it('builds both sides from the model and ranks my starters', () => {
    const sides = sidesFromModel(model)!;
    expect(sides.mine.starters.map((p) => p.pid).sort()).toEqual(['q1', 'w1']);
    expect(sides.theirs.starters.map((p) => p.pid)).toEqual(['q2', 'w2']);
    const h = hingesOf(sides.mine, sides.theirs, { sd: model.meta.teamWeeklySd, replacement: replacementLevels(model) });
    expect(h.winNow).toBeCloseTo(winProb(36, 32, 20), 10);
    // the QB is 12 above the free-agent QB, the WR 6 above
    expect(h.rows.map((r) => r.pid)).toEqual(['q1', 'w1']);
    expect(h.rows[0]!.atStake).toBeGreaterThan(h.rows[1]!.atStake);
  });

  it('falls back to the opponent\'s best lineup when he has set none', () => {
    const bare = handModel({
      cur: 5, slots: ['QB', 'WR'], teams: [{ rid: 1, starters: ['q1', 'w1'] }, { rid: 2 }], games: [[5, 1, 2]],
      players: [
        { pid: 'q1', pos: 'QB', mu: 24, owner: 1 }, { pid: 'w1', pos: 'WR', mu: 12, owner: 1 },
        { pid: 'q2', pos: 'QB', mu: 18, owner: 2 }, { pid: 'w2', pos: 'WR', mu: 14, owner: 2 }, { pid: 'w2b', pos: 'WR', mu: 3, owner: 2 },
      ],
    });
    expect(sidesFromModel(bare)!.theirs.starters.map((p) => p.pid).sort()).toEqual(['q2', 'w2']);
  });

  it('applies the what-if to my side only', () => {
    const sides = sidesFromModel(model, { overrides: {}, adds: [], drops: ['q1'], pins: [], benches: [], volatility: 1 })!;
    expect(sides.mine.starters.some((p) => p.pid === 'q1')).toBe(false);
  });

  it('is null with no opponent', () => {
    const lone = handModel({ cur: 5, slots: ['QB'], teams: [{ rid: 1 }, { rid: 2 }], players: [{ pid: 'q', pos: 'QB', mu: 1, owner: 1 }] });
    expect(sidesFromModel(lone)).toBeNull();
  });
});
