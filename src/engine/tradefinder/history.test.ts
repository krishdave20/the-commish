import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../data/types.ts';
import { handModel, type HandPlayer } from '../test-helpers.ts';
import { bigTrade as big, evenTrade as even, seasonModel as season } from './test-helpers.ts';
import { DECISIVE_PER_WEEK, FLEECE_MIN_POINTS, GRADE_CUTS, gradeTrades, letterFor, parseTrades, tradeSimPair, tradeWeeks, type RealTrade } from './history.ts';

const trade = (id: string, o: Partial<Transaction> = {}): Transaction => ({
  transaction_id: id, type: 'trade', status: 'complete', roster_ids: [1, 2], created: 1_000, adds: { x: 1, y: 2 }, drops: { x: 2, y: 1 }, ...o,
});

describe('parseTrades', () => {
  it('reads who got and sent whom, picks and FAAB, from hand-built transactions', () => {
    const t = trade('t1', {
      adds: { x: 1, y: 2 }, drops: { x: 2, y: 1 },
      draft_picks: [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }, { season: '2028', round: 3, roster_id: 1, previous_owner_id: 1, owner_id: 2 }],
      waiver_budget: [{ amount: 12, sender: 1, receiver: 2 }],
    });
    const out = parseTrades({ 3: [t] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 't1', week: 3, at: 1_000 });
    const [a, b] = out[0]!.teams;
    expect(a).toEqual({ rid: 1, got: ['x'], sent: ['y'], picksGot: [{ season: '2027', round: 1, from: 2 }], picksSent: [{ season: '2028', round: 3, from: 1 }], faab: -12 });
    expect(b).toEqual({ rid: 2, got: ['y'], sent: ['x'], picksGot: [{ season: '2028', round: 3, from: 1 }], picksSent: [{ season: '2027', round: 1, from: 2 }], faab: 12 });
  });

  it('keeps only completed trades: not waivers, free agents, failed or pending trades', () => {
    const out = parseTrades({
      2: [
        trade('ok'), trade('failed', { status: 'failed' }), trade('pending', { status: 'proposed' }),
        { transaction_id: 'w', type: 'waiver', status: 'complete', adds: { z: 1 } }, { transaction_id: 'f', type: 'free_agent', status: 'complete', adds: { z: 1 } },
      ],
    });
    expect(out.map((t) => t.id)).toEqual(['ok']);
  });

  it('puts trades in order of week, then time, and tolerates weeks with nothing', () => {
    const out = parseTrades({ 5: [trade('late', { created: 5 })], 2: [trade('b', { created: 20 }), trade('a', { created: 10 })], 3: [], 4: null });
    expect(out.map((t) => t.id)).toEqual(['a', 'b', 'late']);
    expect(parseTrades({})).toEqual([]);
    expect(parseTrades({ 1: [] })).toEqual([]);
  });

  it('keeps a three-team trade as it is', () => {
    const t = trade('three', { roster_ids: [1, 2, 3], adds: { x: 2, y: 3, z: 1 }, drops: { x: 1, y: 2, z: 3 } });
    const [g] = parseTrades({ 4: [t] });
    expect(g!.teams.map((x) => [x.rid, x.got, x.sent])).toEqual([[1, ['z'], ['x']], [2, ['x'], ['y']], [3, ['y'], ['z']]]);
  });

  it('skips a trade with fewer than two teams, and ignores malformed picks', () => {
    expect(parseTrades({ 2: [trade('solo', { roster_ids: [1], adds: {}, drops: {} })] })).toEqual([]);
    const [g] = parseTrades({ 2: [trade('p', { draft_picks: [{ season: '2027' }, null] as never })] });
    expect(g!.teams[0]!.picksGot).toEqual([]);
  });
});

describe('gradeTrades', () => {
  const model = season();
  const g = gradeTrades(model, [big, even]);

  it('scores the lineup swing from the trade week: actual points for weeks played, projections for weeks to come', () => {
    expect(tradeWeeks(model, 3)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    const a = g[0]!.sides[0]!, b = g[0]!.sides[1]!;
    // weeks 3 and 4: x scored 18 + 22, y 9 + 11 -> +20; weeks 5 to 10: 20 against 10 over 6 weeks -> +60
    expect(a.past).toBeCloseTo(20, 9);
    expect(a.ahead).toBeCloseTo(60, 9);
    expect(a.swing).toBeCloseTo(80, 9);
    expect(a.weeks).toBe(8);
    expect(a.perWeek).toBeCloseTo(10, 9);
    expect(b.swing).toBeCloseTo(-80, 9);
  });

  it('adds up the points the players actually scored since the trade', () => {
    const a = g[0]!.sides[0]!;
    expect(a.weeksSince).toBe(2);
    expect(a.ptsGot).toBe(40);
    expect(a.ptsSent).toBe(20);
    const b = g[0]!.sides[1]!;
    expect(b.ptsGot).toBe(20);
    expect(b.ptsSent).toBe(40);
  });

  it('grades each side: score = own per week minus 0.4 of the other side, and picks a letter', () => {
    const [a, b] = g[0]!.sides;
    expect(a!.score).toBeCloseTo(10 - 0.4 * -10, 9);
    expect(b!.score).toBeCloseTo(-10 - 0.4 * 10, 9);
    expect(a!.grade).toBe('A+');
    expect(b!.grade).toBe('F');
  });

  it('names the winner when the gap is decisive and calls an even deal even', () => {
    expect(g[0]!.winner).toBe(1);
    expect(g[0]!.margin).toBeCloseTo(160, 9);
    expect(g[0]!.decisive).toBe(true);
    expect(g[1]!.winner).toBeNull();
    expect(g[1]!.decisive).toBe(false);
    expect(g[1]!.sides.every((s) => Math.abs(s.swing) < 1e-9)).toBe(true);
    expect(g[1]!.sides.map((s) => s.grade)).toEqual(['C+', 'C+']);
    expect(g[1]!.marginPerWeek).toBeLessThan(DECISIVE_PER_WEEK);
  });

  it('labels the fleece of the week and the trade of the year, with the numbers', () => {
    expect(g[0]!.labels.map((l) => l.kind)).toEqual(['fleece of the week', 'trade of the year']);
    expect(g[0]!.labels[0]!.text).toBe('fleece of the week 3: Aces +80.0 lineup points to Bees −80.0');
    expect(g[0]!.labels[1]!.text).toContain('160.0 point gap');
    expect(g[1]!.labels).toEqual([]);
  });

  it('gives no fleece label to a lopsided trade where the loser still gained', () => {
    // both sides improve: Aces fill a weak starting wideout with a spare quarterback going the other way
    const P = (pid: string, pos: 'QB' | 'WR', mu: number, owner: number): HandPlayer => ({ pid, pos, mu, owner, name: pid });
    const m = handModel({
      slots: ['QB', 'WR', 'WR'], cur: 5, last: 8, teams: [{ rid: 1, name: 'Aces' }, { rid: 2, name: 'Bees' }],
      players: [P('q1', 'QB', 15, 1), P('wa', 'WR', 12, 1), P('wb', 'WR', 19, 1), P('q2', 'QB', 14, 2), P('wc', 'WR', 20, 2), P('wd', 'WR', 18, 2), P('we', 'WR', 5, 2)],
    });
    const t: RealTrade = { id: 'win-win', week: 5, at: 1, teams: [{ rid: 1, got: ['wb'], sent: ['q2'], picksGot: [], picksSent: [], faab: 0 }, { rid: 2, got: ['q2'], sent: ['wb'], picksGot: [], picksSent: [], faab: 0 }] };
    // (the model's rosters are after the deal: wb is with Aces, q2 with Bees)
    m.players.find((p) => p.pid === 'q2')!.ownerRid = 2;
    const gg = gradeTrades(m, [t]);
    expect(gg[0]!.sides.every((s) => s.swing > 0)).toBe(true);
    expect(gg[0]!.decisive).toBe(true);
    expect(gg[0]!.labels.find((l) => l.kind === 'fleece of the week')).toBeUndefined();
    expect(gg[0]!.labels.find((l) => l.kind === 'trade of the year')).toBeDefined();
  });

  it('a decisive but small gap is a win, not a fleece', () => {
    // y scores 22.33 a week from here: Aces' swing is +20 played and -14 to come = +6, Bees' -6: a 12 point gap over 8 weeks
    const m = season();
    const y = m.players.find((p) => p.pid === 'y')!;
    for (const w of Object.keys(y.mu)) y.mu[Number(w)] = 22 + 1 / 3;
    const [g] = gradeTrades(m, [big]);
    expect(g!.margin).toBeCloseTo(12, 6);
    expect(g!.margin).toBeLessThan(FLEECE_MIN_POINTS);
    expect(g!.decisive).toBe(true);
    expect(g!.labels.map((l) => l.kind)).toEqual(['trade of the year']);
  });

  it('puts the fleece on the biggest gap of each week only', () => {
    const second: RealTrade = { ...big, id: 'small', at: 3, teams: [{ ...big.teams[0]!, got: ['m'], sent: ['n'] }, { ...big.teams[1]!, rid: 4, got: ['n'], sent: ['m'] }] };
    const gg = gradeTrades(season(), [big, second]);
    const fleeces = gg.filter((x) => x.labels.some((l) => l.kind === 'fleece of the week'));
    expect(fleeces.map((x) => x.trade.id)).toEqual(['big']);
  });

  it('adds dynasty value in and out when values are given', () => {
    const gg = gradeTrades(model, [big], { values: { x: 5000, y: 2000 } });
    expect(gg[0]!.sides[0]!).toMatchObject({ valueGot: 5000, valueSent: 2000 });
    expect(g[0]!.sides[0]!.valueGot).toBeNull();
  });

  it('uses the lookup for a player the model does not carry, and counts him as unscored', () => {
    const t: RealTrade = { ...big, teams: [{ ...big.teams[0]!, got: ['ghost'] }, big.teams[1]!] };
    const gg = gradeTrades(model, [t], { lookup: (pid) => (pid === 'ghost' ? { name: 'Gone Guy', pos: 'WR', nfl: 'KC' } : null) });
    expect(gg[0]!.sides[0]!.got[0]).toEqual({ pid: 'ghost', name: 'Gone Guy', pos: 'WR', nfl: 'KC' });
    expect(gg[0]!.sides[0]!.unscored).toBe(1);
    expect(gradeTrades(model, [t])[0]!.sides[0]!.got[0]!.name).toBe('player ghost');
  });

  it('handles no trades', () => {
    expect(gradeTrades(model, [])).toEqual([]);
  });
});

describe('letterFor', () => {
  it('maps the score to the letter table', () => {
    expect(letterFor(2)).toBe('A+');
    expect(letterFor(1.99)).toBe('A');
    expect(letterFor(1)).toBe('A−');
    expect(letterFor(0.5)).toBe('B');
    expect(letterFor(0)).toBe('C+');
    expect(letterFor(-0.2)).toBe('C');
    expect(letterFor(-1.2)).toBe('D');
    expect(letterFor(-2.5)).toBe('F');
    for (let i = 1; i < GRADE_CUTS.length; i++) expect(GRADE_CUTS[i - 1]![0]).toBeGreaterThan(GRADE_CUTS[i]![0]);
  });
});

describe('tradeSimPair', () => {
  it('builds the season with the trade in place and with it undone, for the teams in it only', () => {
    const model = season();
    const pair = tradeSimPair(model, big);
    // week 6: Aces have QB 15 + x 20 with the trade, QB 15 + y 10 without it
    expect(pair.with.means[1]![6]).toBe(35);
    expect(pair.without.means[1]![6]).toBe(25);
    expect(pair.with.means[2]![6]).toBe(25);
    expect(pair.without.means[2]![6]).toBe(35);
    expect(pair.with.means[3]![6]).toBe(pair.without.means[3]![6]);
    expect(pair.with.runs).toBe(6000);
  });
});
