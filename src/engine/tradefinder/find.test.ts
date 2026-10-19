import { describe, expect, it } from 'vitest';
import { rateTeams } from '../draft/ratings.ts';
import { emptyScenario, withOverride } from '../scenario.ts';
import { evaluateTrade } from '../trades.ts';
import { handModel } from '../test-helpers.ts';
import {
  FINDER_LOPSIDED_GAP, FINDER_MIN_MY_GAIN, FINDER_MIN_OTHER_GAIN, FINDER_PER_KIND, findTradeIdeas, flexPositions, needPositions, prefillFor,
} from './find.ts';
import { finderModel, finderPlayers } from './test-helpers.ts';
import type { FinderIdea } from './types.ts';

const pids = (xs: ReadonlyArray<{ pid: string }>) => xs.map((p) => p.pid).sort();
const byKind = (ideas: FinderIdea[], kind: FinderIdea['kind']) => ideas.filter((i) => i.kind === kind);

describe('need and surplus drive the search', () => {
  const model = finderModel();
  const res = findTradeIdeas(model, { rosterSize: 6 });

  it('reads your biggest need and surplus from the ratings', () => {
    const mine = rateTeams({ model }).teams.find((t) => t.isMe)!;
    expect(mine.need).toBe('QB');
    expect(mine.surplus).toBe('WR');
    expect(res.need).toBe('QB');
    expect(res.surplus).toBe('WR');
    expect(res.usedBench).toBe(false);
  });

  it('sends only surplus-position players and brings back the need position (2-for-1)', () => {
    const two = byKind(res.ideas, 'two-for-one');
    expect(two.length).toBeGreaterThan(0);
    for (const i of two) {
      const me = i.sides[0]!;
      expect(me.send).toHaveLength(2);
      expect(me.get).toHaveLength(1);
      expect(me.send.every((p) => p.pos === 'WR')).toBe(true);
      expect(me.get[0]!.pos).toBe('QB');
    }
  });

  it('finds the exact best 2-for-1: two spare wideouts for the great QB, both lineups gain', () => {
    const top = byKind(res.ideas, 'two-for-one')[0]!;
    expect(pids(top.sides[0]!.send)).toEqual(['w3', 'w4']);
    expect(pids(top.sides[0]!.get)).toEqual(['q2']);
    // you: QB 10 -> 25 for 3 regular weeks and 2 playoff weeks; the wideouts you send never start
    expect(top.sides[0]!.gain).toBeCloseTo(75, 6);
    expect(top.sides[0]!.reg).toBeCloseTo(45, 6);
    expect(top.sides[0]!.po).toBeCloseTo(30, 6);
    // they: wideouts 8 and 7 -> 18 and 17 (+20 a week), QB 25 -> 22 (-3 a week)
    expect(top.sides[1]!.gain).toBeCloseTo(85, 6);
    expect(top.minGain).toBeCloseTo(75, 6);
    expect(top.weeks).toBe(5);
    expect(top.startsForMe).toBe(3);
  });

  it('agrees with evaluateTrade on your lineup (regular season and playoff weeks)', () => {
    for (const i of res.ideas.filter((x) => x.kind !== 'three-team' && !x.sides[0]!.drop)) {
      const ev = evaluateTrade(model, emptyScenario(), { partnerRid: i.sides[1]!.rid, send: i.sides[0]!.send.map((p) => p.pid), get: i.sides[0]!.get.map((p) => p.pid) });
      expect(i.sides[0]!.reg).toBeCloseTo(ev.myReg, 6);
      expect(i.sides[0]!.po).toBeCloseTo(ev.myPo, 6);
    }
    const top = byKind(res.ideas, 'two-for-one')[0]!;
    const ev = evaluateTrade(model, emptyScenario(), { partnerRid: 2, send: ['w3', 'w4'], get: ['q2'] });
    expect(top.sides[0]!.reg).toBeCloseTo(ev.myReg, 6);
    expect(top.sides[1]!.reg).toBeCloseTo(ev.theirReg, 6);
  });

  it('never proposes a deal where a partner loses lineup points, or you gain less than the minimum', () => {
    for (const i of res.ideas) {
      expect(i.sides[0]!.gain).toBeGreaterThanOrEqual(FINDER_MIN_MY_GAIN);
      for (const s of i.sides.slice(1)) expect(s.gain).toBeGreaterThanOrEqual(0);
    }
  });

  it('ranks each kind by the smallest gain among the sides, one idea per incoming set', () => {
    for (const kind of ['two-for-one', 'one-for-two', 'three-team'] as const) {
      const list = byKind(res.ideas, kind);
      for (let k = 1; k < list.length; k++) expect(list[k - 1]!.minGain).toBeGreaterThanOrEqual(list[k]!.minGain);
      for (const i of list) expect(i.minGain).toBeCloseTo(Math.min(...i.sides.map((s) => s.gain)), 9);
      expect(list.length).toBeLessThanOrEqual(FINDER_PER_KIND);
      const incoming = list.map((i) => pids(i.sides[0]!.get).join('+'));
      expect(new Set(incoming).size).toBe(incoming.length);
    }
  });

  it('finds a 1-for-2: one spare wideout for a QB plus a player the partner benches', () => {
    const one = byKind(res.ideas, 'one-for-two');
    expect(one.length).toBeGreaterThan(0);
    const i = one.find((x) => pids(x.sides[0]!.get).join() === 'q3b,r3b')!;
    expect(i).toBeTruthy();
    expect(i.sides[0]!.send.map((p) => p.pid)).toEqual(['w3']);
    // the second player, r3b (RB 16 against your 12), has to be worth something on top
    expect(i.text).toMatch(/r3b comes along and adds \+4\.0 a week/);
    expect(i.sides[1]!.send).toHaveLength(2);
  });
});

describe('roster size: the receiving team drops its cheapest bench player', () => {
  it('shows the partner dropping the junk wideout on a 2-for-1 at the roster limit', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6 });
    const top = byKind(res.ideas, 'two-for-one')[0]!;
    expect(top.sides[1]!.team).toBe('Two');
    expect(top.sides[1]!.drop?.pid).toBe('j2');
    expect(top.sides[0]!.drop).toBeNull();
  });

  it('shows you dropping your cheapest bench player when a 1-for-2 takes you over the limit', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6 });
    const i = byKind(res.ideas, 'one-for-two').find((x) => pids(x.sides[0]!.get).join() === 'q3b,r3b')!;
    // after the deal q1 (QB 10) is a third quarterback who never starts: lowest points among the players who cost nothing
    expect(i.sides[0]!.drop?.pid).toBe('q1');
    expect(i.sides[1]!.drop).toBeNull();
  });

  it('needs no drop when the roster limit leaves room', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 20 });
    for (const i of res.ideas) for (const s of i.sides) expect(s.drop).toBeNull();
  });

  it('counts the drop: dropping a starter would not be chosen, and the gain is taken after the drop', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6 });
    for (const i of res.ideas) for (const s of i.sides) if (s.drop) expect(['j2', 'w8', 'q1', 'w4', 'w3', 'w5', 'w6', 'r1'].includes(s.drop.pid) || s.drop.ros <= 60).toBe(true);
    const top = byKind(res.ideas, 'two-for-one')[0]!;
    const noDrop = findTradeIdeas(finderModel(), { rosterSize: 20 });
    // the cheapest drop costs nothing, so the numbers match the no-drop search
    expect(top.sides[1]!.gain).toBeCloseTo(byKind(noDrop.ideas, 'two-for-one').find((x) => x.id === top.id)!.sides[1]!.gain, 6);
  });
});

describe('three-team rotations', () => {
  const res = findTradeIdeas(finderModel(), { rosterSize: 6, kinds: ['three-team'] });

  it('are valid: you -> B -> C -> you, one player each, and every lineup gains', () => {
    expect(res.ideas.length).toBeGreaterThan(0);
    for (const i of res.ideas) {
      expect(i.kind).toBe('three-team');
      expect(i.sides).toHaveLength(3);
      const [a, b, c] = i.sides as [typeof i.sides[0], typeof i.sides[0], typeof i.sides[0]];
      expect(new Set([a.rid, b.rid, c.rid]).size).toBe(3);
      expect(a.isMe).toBe(true);
      for (const s of i.sides) { expect(s.send).toHaveLength(1); expect(s.get).toHaveLength(1); }
      // what A sends B gets, what B sends C gets, what C sends A gets
      expect(a.send[0]!.pid).toBe(b.get[0]!.pid);
      expect(b.send[0]!.pid).toBe(c.get[0]!.pid);
      expect(c.send[0]!.pid).toBe(a.get[0]!.pid);
      expect(a.gain).toBeGreaterThanOrEqual(FINDER_MIN_MY_GAIN);
      expect(b.gain).toBeGreaterThanOrEqual(FINDER_MIN_OTHER_GAIN);
      expect(c.gain).toBeGreaterThanOrEqual(FINDER_MIN_OTHER_GAIN);
      expect(a.get[0]!.pos).toBe('QB');
      expect(a.drop === null && b.drop === null && c.drop === null).toBe(true);
    }
  });

  it('are ranked by the smallest of the three gains', () => {
    for (let k = 1; k < res.ideas.length; k++) expect(res.ideas[k - 1]!.minGain).toBeGreaterThanOrEqual(res.ideas[k]!.minGain);
    expect(res.ideas[0]!.minGain).toBeCloseTo(6 * 5, 6);
    const top = res.ideas[0]!;
    expect(top.minGain).toBeCloseTo(Math.min(...top.sides.map((s) => s.gain)), 9);
  });

  it('the best rotation here sends w2 to Four, Four sends w11 to Two, Two sends q2b to you', () => {
    const top = res.ideas[0]!;
    expect(top.sides.map((s) => [s.send[0]!.pid, s.get[0]!.pid])).toEqual([['w2', 'q2b'], ['w11', 'w2'], ['q2b', 'w11']]);
    expect(top.sides.map((s) => s.team)).toEqual(['Me', 'Four', 'Two']);
  });

  it('is not made of pairs that already work: a rotation needs all three legs to gain', () => {
    // make team 4 gain nothing from a wideout: it already has the best wideouts
    const players = finderPlayers().map((p) => (p.pid === 'w10' ? { ...p, mu: 30 } : p.pid === 'w11' ? { ...p, mu: 29 } : p));
    const none = findTradeIdeas(finderModel({ players }), { rosterSize: 6, kinds: ['three-team'] });
    for (const i of none.ideas) for (const s of i.sides) expect(s.gain).toBeGreaterThan(0);
    expect(none.ideas.find((i) => i.sides[1]!.team === 'Four' && i.sides[1]!.get[0]!.pid === 'w3')).toBeUndefined();
  });
});

describe('pruning', () => {
  const model = finderModel();
  const res = findTradeIdeas(model, { rosterSize: 6 });

  it('only scores candidates from the surplus and need pools', () => {
    for (const i of res.ideas) {
      for (const s of i.sides) for (const p of [...s.send, ...s.get]) expect(['QB', 'RB', 'WR', 'TE']).toContain(p.pos);
      expect(i.sides[0]!.send.every((p) => p.pos === 'WR')).toBe(true);
    }
    // 7 spare wideouts at most x 4 quarterbacks x ... is a few hundred scored deals, not every combination of the 22 players
    expect(res.evaluated).toBeLessThan(400);
    expect(res.evaluated).toBeGreaterThan(0);
  });

  it('never sends or receives kickers, defenses or injured-reserve players', () => {
    const players = [
      ...finderPlayers(),
      { pid: 'k1', pos: 'K' as const, mu: 9, owner: 1, name: 'k1' },
      { pid: 'd2', pos: 'DEF' as const, mu: 9, owner: 2, name: 'd2' },
      { pid: 'irq', pos: 'QB' as const, mu: 40, owner: 2, name: 'irq', onIr: true },
    ];
    const r = findTradeIdeas(finderModel({ players, slots: ['QB', 'RB', 'WR', 'WR', 'K', 'DEF'] }), { rosterSize: 99 });
    for (const i of r.ideas) for (const s of i.sides) for (const p of [...s.send, ...s.get]) { expect(p.pos).not.toBe('K'); expect(p.pos).not.toBe('DEF'); expect(p.pid).not.toBe('irq'); }
  });

  it('counts deals from next week: a player who already played this week is still tradable and this week is not scored', () => {
    const players = finderPlayers().map((p) => (p.pid === 'q2' ? { ...p, played: true } : p));
    const r = findTradeIdeas(finderModel({ players }), { rosterSize: 6 });
    const top = byKind(r.ideas, 'two-for-one').find((i) => i.sides[0]!.get[0]!.pid === 'q2')!;
    expect(top).toBeTruthy();
    expect(top.weeks).toBe(5);
  });

  it('a deal that helps you by less than the minimum is dropped', () => {
    // a QB barely better than yours
    const players = finderPlayers().map((p) => (['q2', 'q2b', 'q3', 'q3b', 'q4'].includes(p.pid) ? { ...p, mu: 10.2 } : p));
    const r = findTradeIdeas(finderModel({ players }), { rosterSize: 6 });
    expect(r.ideas.filter((i) => i.sides[0]!.get.some((p) => p.pos === 'QB'))).toHaveLength(0);
  });
});

describe('explanations carry numbers', () => {
  const res = findTradeIdeas(finderModel(), { rosterSize: 6 });

  it('names your need, the weekly gain, what you send, their gain and their tier change', () => {
    const top = byKind(res.ideas, 'two-for-one')[0]!;
    expect(top.text).toContain('fills your qb need (+15.0 a week)');
    expect(top.text).toContain('wr depth you never start');
    expect(top.text).toContain('they gain +17.0 a week');
    expect(top.text).toContain('their wr tier goes from thin to strong');
    expect(top.sides[1]!.tier).toEqual({ before: 'thin', after: 'strong' });
    expect(top.sides[1]!.fillsNeed).toBe(true);
  });

  it('says how often a starter you send starts', () => {
    const i = byKind(res.ideas, 'one-for-two').find((x) => x.sides[0]!.send[0]!.pid === 'w1')!;
    expect(i.text).toContain('a wr you start in 3 of 3 weeks');
  });

  it('says "stays level" instead of "+0.0" when the partner loses and gains nothing', () => {
    // team 2 has a third quarterback and wideouts so good that your spares would sit: giving him up costs them nothing
    const players = [...finderPlayers().map((p) => (p.pid === 'w5' ? { ...p, mu: 30 } : p.pid === 'w6' ? { ...p, mu: 29 } : p)), { pid: 'q2c', pos: 'QB' as const, mu: 21, owner: 2, name: 'q2c' }];
    const r = findTradeIdeas(finderModel({ players }), { rosterSize: 99 });
    const level = byKind(r.ideas, 'two-for-one').find((i) => i.sides[0]!.get[0]!.pid === 'q2c')!;
    expect(level.sides[1]!.gain).toBeCloseTo(0, 9);
    expect(level.text).toContain('their lineup stays level (no points lost)');
    expect(level.text).not.toContain('+0.0');
  });

  it('every idea has a number in its text', () => {
    for (const i of res.ideas) expect(i.text).toMatch(/\+\d+\.\d a week/);
    const rot = byKind(res.ideas, 'three-team')[0]!;
    expect(rot.text).toMatch(/every lineup gains, and the smallest gain is \+\d+\.\d a week/);
  });
});

describe('dynasty values', () => {
  // you send w3 + w4 (18 + 17) for q2: value out 9,000 against 5,000 in
  const base = { w3: 5000, w4: 4000, q2: 5000, q2b: 9000, q3: 9500, q3b: 3000, w1: 6000, w2: 6000 };

  it('flags a lopsided offer (more than 15% apart) and leaves a balanced one alone', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6, values: base });
    const lop = byKind(res.ideas, 'two-for-one').find((i) => pids(i.sides[0]!.get).join() === 'q2')!;
    expect(lop.sides[0]!.value).toMatchObject({ out: 9000, in: 5000, lopsided: true, leans: 'against' });
    expect(lop.sides[0]!.value!.gap).toBeCloseTo(4000 / 9000, 9);
    expect(lop.lopsided).toBe(true);
    expect(lop.text).toContain('dynasty value: you send 9,000 and get 5,000');
    expect(lop.text).toContain('lopsided');
    const fair = byKind(res.ideas, 'two-for-one').find((i) => pids(i.sides[0]!.get).join() === 'q2b')!;
    expect(fair.sides[0]!.value).toMatchObject({ out: 9000, in: 9000, lopsided: false, leans: 'even' });
    expect(fair.lopsided).toBe(false);
  });

  it('the threshold is 15% of the bigger side', () => {
    expect(FINDER_LOPSIDED_GAP).toBe(0.15);
    // 8,500 in against 10,000 out is exactly 15%: not flagged; 8,400 is
    const edge = (inn: number) => findTradeIdeas(finderModel(), { rosterSize: 6, values: { ...base, w3: 5000, w4: 5000, q2: inn } });
    const get = (r: ReturnType<typeof findTradeIdeas>) => byKind(r.ideas, 'two-for-one').find((i) => pids(i.sides[0]!.get).join() === 'q2')!;
    expect(get(edge(8500)).sides[0]!.value!.lopsided).toBe(false);
    expect(get(edge(8400)).sides[0]!.value!.lopsided).toBe(true);
  });

  it('lists assets with no value on file, counted as zero', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6, values: { w3: 5000, q2: 5000 } });
    const i = byKind(res.ideas, 'two-for-one').find((x) => pids(x.sides[0]!.get).join() === 'q2')!;
    expect(i.sides[0]!.value!.missing).toEqual(['w4']);
    expect(i.sides[0]!.value!.out).toBe(5000);
  });

  it('adds nothing to a redraft league', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6 });
    for (const i of res.ideas) { expect(i.lopsided).toBe(false); for (const s of i.sides) expect(s.value).toBeNull(); expect(i.text).not.toContain('dynasty'); }
  });

  it('checks every leg of a rotation', () => {
    const res = findTradeIdeas(finderModel(), { rosterSize: 6, kinds: ['three-team'], values: { ...base, w10: 100, w11: 100 } });
    const i = res.ideas.find((x) => x.sides[1]!.send[0]!.pid === 'w11')!;
    expect(i.sides[1]!.value).toMatchObject({ out: 100, lopsided: true });
    expect(i.lopsided).toBe(true);
  });
});

describe('load in analyzer: the prefill', () => {
  const res = findTradeIdeas(finderModel(), { rosterSize: 6 });

  it('a two-team idea loads both sides', () => {
    const top = byKind(res.ideas, 'two-for-one')[0]!;
    expect(prefillFor(top)).toEqual({ partnerRid: 2, send: ['w3', 'w4'], get: ['q2'], partial: false });
  });

  it('a 1-for-2 loads the two incoming players', () => {
    const i = byKind(res.ideas, 'one-for-two').find((x) => pids(x.sides[0]!.get).join() === 'q3b,r3b')!;
    expect(prefillFor(i)).toEqual({ partnerRid: 3, send: ['w3'], get: ['q3b', 'r3b'], partial: false });
  });

  it('a rotation loads only your leg, against the team that sends you your player', () => {
    const rot = findTradeIdeas(finderModel(), { rosterSize: 6, kinds: ['three-team'] }).ideas[0]!;
    expect(prefillFor(rot)).toEqual({ partnerRid: 2, send: ['w2'], get: ['q2b'], partial: true });
  });
});

describe('scenario, empty states and options', () => {
  it('uses the what-if: a quarterback you say will score 30 leaves nothing to fix', () => {
    const scen = withOverride(emptyScenario(), 'q1', { ppg: 30 });
    const r = findTradeIdeas(finderModel(), { rosterSize: 6, scenario: scen });
    expect(r.ideas.filter((i) => i.kind !== 'three-team')).toHaveLength(0);
  });

  it('says why when you have no surplus and no bench to trade from', () => {
    const players = finderPlayers().filter((p) => !['w3', 'w4', 'q1'].includes(p.pid)).concat([{ pid: 'q1', pos: 'QB', mu: 10, owner: 1, name: 'q1' }]);
    const r = findTradeIdeas(finderModel({ players }), { rosterSize: 6 });
    // every one of your skill players starts: nothing to spare
    expect(r.ideas).toHaveLength(0);
    expect(r.reason).toMatch(/surplus|no deal/);
  });

  it('falls back to bench players when the ratings find no surplus', () => {
    // every team has the same bench: nobody has depth above the league, so there is no surplus position
    const teamPlayers = (rid: number, qb: number) => [
      { pid: `q${rid}`, pos: 'QB' as const, mu: qb, owner: rid, name: `q${rid}` }, { pid: `a${rid}`, pos: 'WR' as const, mu: 15, owner: rid, name: `a${rid}` },
      { pid: `b${rid}`, pos: 'WR' as const, mu: 10, owner: rid, name: `b${rid}` }, { pid: `c${rid}`, pos: 'WR' as const, mu: 9, owner: rid, name: `c${rid}` },
    ];
    const m = handModel({ slots: ['QB', 'WR'], teams: [{ rid: 1 }, { rid: 2 }, { rid: 3 }], players: [...teamPlayers(1, 8), ...teamPlayers(2, 20), ...teamPlayers(3, 20)] });
    const r = findTradeIdeas(m, { rosterSize: 10 });
    expect(r.need).toBe('QB');
    expect(r.surplus).toBeNull();
    expect(r.usedBench).toBe(true);
    // the pool was the bench; nobody gains from two spare wideouts when every team already has them
    for (const i of r.ideas) expect(i.sides[0]!.send.every((p) => ['b1', 'c1'].includes(p.pid))).toBe(true);
    expect(r.reason).toMatch(/no deal found|surplus/);
  });

  it('reports a one-team league', () => {
    const m = handModel({ slots: ['QB'], teams: [{ rid: 1 }], players: [{ pid: 'a', pos: 'QB', mu: 1, owner: 1 }] });
    const r = findTradeIdeas(m);
    expect(r.ideas).toEqual([]);
    expect(r.reason).toMatch(/two teams/);
  });

  it('defaults the roster limit to the biggest roster in the league', () => {
    expect(findTradeIdeas(finderModel()).rosterSize).toBe(6);
  });

  it('finds ideas for another team when asked', () => {
    const r = findTradeIdeas(finderModel(), { rosterSize: 6, rid: 2 });
    expect(r.need).toBe('WR');
    for (const i of r.ideas) expect(i.sides[0]!.rid).toBe(2);
  });

  it('flex need means any flex-eligible position', () => {
    expect(flexPositions(['QB', 'RB', 'WR', 'FLEX'])).toEqual(['RB', 'WR', 'TE']);
    expect(flexPositions(['QB', 'SUPER_FLEX'])).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect(needPositions('FLEX', ['QB', 'RB', 'WR', 'TE', 'FLEX'])).toEqual(['RB', 'WR', 'TE']);
    expect(needPositions('QB', ['QB'])).toEqual(['QB']);
    expect(needPositions(null, ['QB'])).toEqual([]);
  });
});
