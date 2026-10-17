// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RELEVANCE_ORDER, buildTakes, rankTakes, relevanceOf, validateTake } from './index.ts';
import { DEFAULT_THRESHOLDS, loadThresholds, validateThresholds } from './thresholds.ts';
import { games, makeInputs, teamRow, weekRow, type World } from './testData.ts';
import type { Take } from './types.ts';

/** Players whose usage_spike fires (50% -> 80% of snaps) */
const spikers = (pids: string[]) => pids.flatMap((pid) => [...games(pid, () => ({}), [2, 3, 4]), weekRow(pid, 5, { off_snaps: 48 })]);

function world(extra: Partial<World> = {}): World {
  return {
    players: [
      { pid: 'p1', pos: 'WR', owner: 1 }, { pid: 'p2', pos: 'WR', owner: 1 }, { pid: 'p3', pos: 'WR', owner: 0 },
      { pid: 'p4', pos: 'WR', owner: 2 }, { pid: 'p5', pos: 'WR', owner: 2 },
    ],
    weekly: spikers(['p1', 'p2', 'p3', 'p4', 'p5']),
    handTeams: [{ rid: 1, name: 'Mine FC', starters: ['0', '0', '0', 'p1'] }, { rid: 2, name: 'Rival FC' }],
    watchlist: ['p4'],
    ...extra,
  };
}

describe('relevance and why-it-matters', () => {
  const byPid = (w: World) => Object.fromEntries(buildTakes(makeInputs(w), DEFAULT_THRESHOLDS).map((t) => [t.pid, t]));
  it('assigns relevance from ownership, the watchlist and trade targets', () => {
    const t = byPid(world());
    expect(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.relevance]))).toEqual({ p1: 'mine', p2: 'mine', p3: 'waiver', p4: 'trade_target', p5: 'league' });
    expect(relevanceOf(makeInputs(world({ watchlist: [], tradeTargets: ['p5'] })), 'p5')).toBe('trade_target');
  });
  it('a watchlisted player on a free-agent or own roster is waiver / mine, not trade_target', () => {
    const t = byPid(world({ watchlist: ['p1', 'p3'] }));
    expect(t.p1!.relevance).toBe('mine');
    expect(t.p3!.relevance).toBe('waiver');
  });
  it('whyForYou per relevance', () => {
    const t = byPid(world({ waiverGains: { p3: 4.2 } }));
    expect(t.p1!.whyForYou).toBe("he's in your flex this week");
    expect(t.p2!.whyForYou).toBe("he's on your bench");
    expect(t.p3!.whyForYou).toBe('free agent; lineup lift +4.2 for the rest of season');
    expect(t.p4!.whyForYou).toBe("on Rival FC's roster");
    expect(t.p5!.whyForYou).toBeNull();
  });
  it('a starter in a fixed slot says which one', () => {
    const t = byPid(world({ handTeams: [{ rid: 1, name: 'Mine FC', starters: ['0', '0', 'p1', '0'] }, { rid: 2, name: 'Rival FC' }] }));
    expect(t.p1!.whyForYou).toBe("he's starting for you at wr this week");
  });
  it('computes the waiver lift itself when the UI passes none, and says just "free agent" never wrongly', () => {
    const t = byPid(world());
    expect(t.p3!.whyForYou).toMatch(/^free agent(; (lineup lift \+\d+\.\d for the rest of season|no lineup lift for your team right now))?$/);
  });
});

describe('ordering', () => {
  it('sorts by relevance bucket, then score', () => {
    const takes = buildTakes(makeInputs(world()), DEFAULT_THRESHOLDS);
    expect(takes.map((t) => t.relevance)).toEqual([...takes.map((t) => t.relevance)].sort((a, b) => RELEVANCE_ORDER[a] - RELEVANCE_ORDER[b]));
    expect(takes[0]!.relevance).toBe('mine');
    expect(takes.at(-1)!.relevance).toBe('league');
  });
  it('a league take with a higher score still ranks below a mine take with a lower one', () => {
    const w = world();
    w.weekly = [...games('p1', () => ({}), [2, 3, 4]), weekRow('p1', 5, { off_snaps: 40 }), ...games('p5', () => ({}), [2, 3, 4]), weekRow('p5', 5, { off_snaps: 60 })];
    const takes = buildTakes(makeInputs(w), DEFAULT_THRESHOLDS);
    expect(takes.map((t) => t.pid)).toEqual(['p1', 'p5']);
    expect(takes[0]!.score).toBeLessThan(takes[1]!.score);
  });
  it('is deterministic', () => {
    expect(buildTakes(makeInputs(world()), DEFAULT_THRESHOLDS)).toEqual(buildTakes(makeInputs(world()), DEFAULT_THRESHOLDS));
  });
  it('every take it builds satisfies the contract', () => {
    for (const t of buildTakes(makeInputs(world()), DEFAULT_THRESHOLDS)) expect(validateTake(t)).toEqual([]);
  });
});

const take = (o: Partial<Take>): Take => ({
  id: 'usage_spike:1:6', kind: 'usage_spike', pid: '1', player: 'A', pos: 'WR', team: 'AAA', season: '2026', week: 6, throughWeek: 5, headline: 'h 1', statLine: 's 1 (3 games)',
  whyForYou: null, relevance: 'league', tone: 'good', score: 0.5, sample: { label: 'games', n: 3 }, dataLabel: null, sources: ['nflverse'], actions: ['profile'], ...o,
});

describe('rankTakes', () => {
  it('keeps at most 3 takes per player per week, the highest scoring', () => {
    const kinds = ['usage_spike', 'target_hog', 'buy_low', 'sell_high', 'rz_role_change'] as const;
    const takes = kinds.map((k, i) => take({ id: `${k}:1:6`, kind: k, score: 0.1 * (i + 1) }));
    const out = rankTakes(takes, 3);
    expect(out.map((t) => t.kind)).toEqual(['rz_role_change', 'sell_high', 'buy_low']);
  });
  it('counts weeks separately and players separately', () => {
    const takes = [
      ...['usage_spike', 'target_hog', 'buy_low', 'sell_high'].map((k, i) => take({ id: `${k}:1:6`, kind: k as Take['kind'], score: 0.5 + i / 100 })),
      take({ id: 'usage_spike:1:7', week: 7 }), take({ id: 'usage_spike:2:6', pid: '2' }),
    ];
    expect(rankTakes(takes, 3)).toHaveLength(5);
    expect(rankTakes(takes, 1)).toHaveLength(3);
  });
  it('dedupes identical ids, keeping the stronger', () => {
    const out = rankTakes([take({ score: 0.4, headline: 'weak' }), take({ score: 0.9, headline: 'strong' }), take({ score: 0.2 })], 3);
    expect(out).toHaveLength(1);
    expect(out[0]!.headline).toBe('strong');
  });
  it('orders mine, waiver, trade_target, league', () => {
    const rel = ['league', 'trade_target', 'waiver', 'mine'] as const;
    const out = rankTakes(rel.map((r, i) => take({ id: `usage_spike:${i}:6`, pid: String(i), relevance: r, score: 0.1 + i / 10 })), 3);
    expect(out.map((t) => t.relevance)).toEqual(['mine', 'waiver', 'trade_target', 'league']);
  });
  it('honors a smaller cap from the thresholds', () => {
    const w = world();
    // p1 trips usage_spike (50% -> 80% of snaps) and target_hog (5 of 20 passes a game)
    w.weekly = [...games('p1', (k) => ({ tgt: k >= 3 ? 5 : 0 }), [2, 3, 4]), weekRow('p1', 5, { off_snaps: 48, tgt: 5 })];
    w.teams = [3, 4, 5].map((k) => teamRow('AAA', k, { pass_att: 20 }));
    expect(buildTakes(makeInputs(w), DEFAULT_THRESHOLDS).filter((t) => t.pid === 'p1').map((t) => t.kind).sort()).toEqual(['target_hog', 'usage_spike']);
    const out = buildTakes(makeInputs(w), { ...DEFAULT_THRESHOLDS, max_per_player_week: 1 }).filter((t) => t.pid === 'p1');
    expect(out).toHaveLength(1);
  });
});

describe('thresholds', () => {
  it('validateThresholds falls back to defaults key by key', () => {
    const t = validateThresholds({ max_per_player_week: 0, detectors: { usage_spike: { snap_share_jump: 0.3, baseline_weeks: 2.5, junk: 1 }, target_hog: 'nope' } });
    expect(t.detectors.usage_spike).toEqual({ ...DEFAULT_THRESHOLDS.detectors.usage_spike, snap_share_jump: 0.3 });
    expect(t.detectors.target_hog).toEqual(DEFAULT_THRESHOLDS.detectors.target_hog);
    expect(t.max_per_player_week).toBe(3);
    expect(validateThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(validateThresholds(undefined).detectors.coverage_note.min_routes).toBe(20);
  });
  it('the shipped file loads, with every detector and numeric values', () => {
    const t = loadThresholds();
    expect(Object.keys(t.detectors).sort()).toEqual(Object.keys(DEFAULT_THRESHOLDS.detectors).sort());
    for (const block of Object.values(t.detectors)) for (const v of Object.values(block)) expect(Number.isFinite(v)).toBe(true);
    expect(t.max_per_player_week).toBeGreaterThanOrEqual(1);
  });
});
