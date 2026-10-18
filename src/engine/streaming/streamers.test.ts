import { describe, expect, it } from 'vitest';
import { handModel, type HandOpts, type HandPlayer } from '../test-helpers.ts';
import { emptyScenario } from '../scenario.ts';
import type { Model, Slot } from '../types.ts';
import { cardSlots, streamers, streamWeeks, UPGRADE_MIN } from './streamers.ts';

const SLOTS: Slot[] = ['QB', 'RB', 'WR', 'FLEX', 'TE', 'K', 'DEF'];
const teams = [{ rid: 1, name: 'me' }, { rid: 2, name: 'them' }];

/** cur 5, so "next week" is 6. */
function league(players: HandPlayer[], o: Partial<HandOpts> = {}): Model {
  return handModel({ cur: 5, last: 9, slots: SLOTS, teams, players, meRid: 1, ...o });
}

const mine: HandPlayer[] = [
  { pid: 'myqb', pos: 'QB', mu: 15, owner: 1, name: 'My Quarterback' },
  { pid: 'myrb', pos: 'RB', mu: 14, owner: 1 },
  { pid: 'mywr', pos: 'WR', mu: 13, owner: 1 },
  { pid: 'myfx', pos: 'WR', mu: 9, owner: 1, name: 'My Flex' },
  { pid: 'mykk', pos: 'K', mu: 8, owner: 1, name: 'My Kicker' },
  { pid: 'mydf', pos: 'DEF', mu: 9, owner: 1, name: 'My Defense' },
  { pid: 'myte', pos: 'TE', mu: 10, owner: 1, name: 'My Tight End' },
];

describe('streamers: candidates', () => {
  const m = league([
    ...mine,
    { pid: 'fa-qb', pos: 'QB', mu: 18, owner: 0, name: 'Free Quarterback' },
    { pid: 'owned-qb', pos: 'QB', mu: 25, owner: 2 },
    { pid: 'bye-qb', pos: 'QB', mu: 20, owner: 0, bye: [6] },
    { pid: 'ir-qb', pos: 'QB', mu: 21, owner: 0, onIr: true },
    { pid: 'out-qb', pos: 'QB', mu: 22, owner: 0 },
    { pid: 'zero-qb', pos: 'QB', mu: 0, owner: 0 },
  ]);
  m.players.find((p) => p.pid === 'out-qb')!.injury = 'Out';

  it('lists free agents only, with a game, a projection, and not out', () => {
    const qb = streamers(m).cards.find((c) => c.key === 'QB')!;
    expect(qb.rows.map((r) => r.pid)).toEqual(['fa-qb']);
    expect(qb.candidates).toBe(1);
  });

  it('keeps a questionable player and drops one the what-if already added', () => {
    m.players.find((p) => p.pid === 'fa-qb')!.injury = 'Questionable';
    expect(streamers(m).cards[0]!.rows.map((r) => r.pid)).toEqual(['fa-qb']);
    const added = { ...emptyScenario(), adds: ['fa-qb'] };
    expect(streamers(m, { scenario: added }).cards.find((c) => c.key === 'QB')!.rows).toEqual([]);
    m.players.find((p) => p.pid === 'fa-qb')!.injury = '';
  });
});

describe('streamers: ranking and the top five', () => {
  const qbs: HandPlayer[] = [14, 19, 16, 22, 17, 18, 15].map((mu, i) => ({ pid: `q${i}`, pos: 'QB' as const, mu, owner: 0 }));
  const m = league([...mine, ...qbs, { pid: 'te1', pos: 'TE', mu: 12, owner: 0 }, { pid: 'te2', pos: 'TE', mu: 7, owner: 0 }]);

  it('ranks each position by projection and keeps five', () => {
    const b = streamers(m);
    const qb = b.cards.find((c) => c.key === 'QB')!;
    expect(qb.rows.map((r) => r.proj)).toEqual([22, 19, 18, 17, 16]);
    expect(qb.candidates).toBe(7);
    expect(b.cards.find((c) => c.key === 'TE')!.rows.map((r) => r.pid)).toEqual(['te1', 'te2']);
  });

  it('ranks by the projection alone: the matchup grade is context, not a second boost', () => {
    const soft = m.players.find((p) => p.pid === 'q0')!; // 14 proj
    soft.dvp[6] = 1.4;
    const tough = m.players.find((p) => p.pid === 'q3')!; // 22 proj
    tough.dvp[6] = 0.7;
    const qb = streamers(m).cards.find((c) => c.key === 'QB')!;
    expect(qb.rows[0]!.pid).toBe('q3');
    expect(qb.rows[0]).toMatchObject({ proj: 22, dvp: 0.7 });
    expect(qb.rows.map((r) => r.proj)).toEqual([22, 19, 18, 17, 16]);
  });

  it('shows floor and ceiling', () => {
    const r = streamers(m).cards.find((c) => c.key === 'QB')!.rows[0]!;
    expect(r.floor).toBeCloseTo(11);
    expect(r.ceil).toBeCloseTo(33);
  });

  it('puts positions in card order and skips positions the league does not start', () => {
    expect(streamers(m).cards.map((c) => c.key)).toEqual(['QB', 'TE', 'DEF', 'K', 'FLEX']);
    const noK = league([...mine.filter((p) => p.pid !== 'mykk')], { slots: ['QB', 'RB', 'WR', 'TE'] });
    expect(streamers(noK).cards.map((c) => c.key)).toEqual(['QB', 'TE']);
  });

  it('builds only the positions asked for', () => {
    expect(streamers(m, { positions: ['TE', 'QB', 'DL'] }).cards.map((c) => c.key)).toEqual(['QB', 'TE']);
  });
});

describe('streamers: versus your starter', () => {
  const m = league([
    ...mine,
    { pid: 'q-up', pos: 'QB', mu: 18.4, owner: 0, name: 'Big Upgrade' },
    { pid: 'q-edge', pos: 'QB', mu: 15.9, owner: 0, name: 'Just Short' },
    { pid: 'q-low', pos: 'QB', mu: 12, owner: 0, name: 'Lower' },
  ]);
  const qb = () => streamers(m).cards.find((c) => c.key === 'QB')!;

  it('is the difference from the starter the optimizer picks that week', () => {
    const r = qb().rows[0]!;
    expect(r.starter?.pid).toBe('myqb');
    expect(r.starterProj).toBe(15);
    expect(r.diff).toBeCloseTo(3.4);
    expect(r.upgrade).toBe(true);
  });

  it('flags an upgrade only above one point', () => {
    const rows = qb().rows;
    expect(rows.find((r) => r.pid === 'q-edge')).toMatchObject({ upgrade: false });
    expect(rows.find((r) => r.pid === 'q-edge')!.diff).toBeCloseTo(0.9);
    expect(rows.find((r) => r.pid === 'q-low')!.diff).toBeCloseTo(-3);
    expect(UPGRADE_MIN).toBe(1);
    // exactly one point is not an upgrade
    m.players.find((p) => p.pid === 'q-edge')!.mu[6] = 16;
    expect(qb().rows.find((r) => r.pid === 'q-edge')!.upgrade).toBe(false);
    m.players.find((p) => p.pid === 'q-edge')!.mu[6] = 15.9;
  });

  it('compares against your best bench option when the starter is on bye', () => {
    const withBackup = league([
      ...mine, { pid: 'bk', pos: 'QB', mu: 9, owner: 1, name: 'Backup' }, { pid: 'q-up', pos: 'QB', mu: 18, owner: 0 },
    ]);
    withBackup.players.find((p) => p.pid === 'myqb')!.opp[6] = 'BYE';
    withBackup.players.find((p) => p.pid === 'myqb')!.mu[6] = 0;
    const r = streamers(withBackup).cards[0]!.rows[0]!;
    expect(r.starter?.pid).toBe('bk');
    expect(r.diff).toBe(9);
  });

  it('treats an empty slot as zero', () => {
    const none = league(mine.filter((p) => p.pos !== 'QB').concat([{ pid: 'q-up', pos: 'QB', mu: 18, owner: 0 }]));
    const r = streamers(none).cards[0]!.rows[0]!;
    expect(r.starter).toBeNull();
    expect(r.diff).toBe(18);
  });

  it('treats a starter on bye with no backup as an open slot', () => {
    const bye = league([...mine, { pid: 'q-up', pos: 'QB', mu: 18, owner: 0 }]);
    bye.players.find((p) => p.pid === 'myqb')!.opp[6] = 'BYE';
    bye.players.find((p) => p.pid === 'myqb')!.mu[6] = 0;
    const r = streamers(bye).cards[0]!.rows[0]!;
    expect(r.starter).toBeNull();
    expect(r.diff).toBe(18);
  });

  it('follows the what-if: add a better quarterback and the bar rises', () => {
    const sc = { ...emptyScenario(), adds: ['q-up'] };
    const r = streamers(m, { scenario: sc }).cards.find((c) => c.key === 'QB')!.rows[0]!;
    expect(r.pid).toBe('q-edge');
    expect(r.starter?.pid).toBe('q-up');
    expect(r.diff).toBeCloseTo(15.9 - 18.4);
    expect(r.upgrade).toBe(false);
  });

  it('names the single best stream, and none when nobody beats your starters', () => {
    const b = streamers(m);
    expect(b.best?.row.pid).toBe('q-up');
    expect(b.best?.card.key).toBe('QB');
    const quiet = league([...mine, { pid: 'q-low', pos: 'QB', mu: 12, owner: 0 }]);
    expect(streamers(quiet).best).toBeNull();
  });
});

describe('streamers: two weeks and the schedule ahead', () => {
  const m = league([
    ...mine,
    { pid: 'a', pos: 'QB', mu: (w) => (w === 6 ? 17 : w === 7 ? 19 : 10), owner: 0, name: 'Two Good Weeks' },
    { pid: 'b', pos: 'QB', mu: (w) => (w === 6 ? 18 : 8), owner: 0, name: 'One Good Week' },
    { pid: 'c', pos: 'QB', mu: (w) => (w === 6 ? 16 : w === 7 ? 30 : 5), owner: 0, bye: [7], name: 'Bye Next' },
  ]);
  const opps: Record<number, [string, number | null]> = { 6: ['ARI', 1.3], 7: ['SEA', 1.2], 8: ['SF', 0.8], 9: ['NYJ', 1] };
  for (const pid of ['a', 'b']) {
    const p = m.players.find((x) => x.pid === pid)!;
    for (const [w, [o, d]] of Object.entries(opps)) { p.opp[Number(w)] = o; p.dvp[Number(w)] = d; }
  }
  const qb = () => streamers(m).cards.find((c) => c.key === 'QB')!;

  it('sums this week and the next', () => {
    const rows = qb().rows;
    expect(rows.find((r) => r.pid === 'a')!.twoWeek).toBe(36);
    expect(rows.find((r) => r.pid === 'b')!.twoWeek).toBe(26);
    expect(rows.find((r) => r.pid === 'c')!.twoWeek).toBe(16); // bye in week 7
  });

  it('flags the best two-week hold among players with a game both weeks', () => {
    const rows = qb().rows;
    expect(rows.filter((r) => r.hold).map((r) => r.pid)).toEqual(['a']);
    // the top pick for the week is not the hold
    expect(rows[0]!.pid).toBe('b');
  });

  it('lists the next three opponents with grades', () => {
    const a = qb().rows.find((r) => r.pid === 'a')!;
    expect(a.ahead).toEqual([
      { week: 6, opp: 'ARI', dvp: 1.3 },
      { week: 7, opp: 'SEA', dvp: 1.2 },
      { week: 8, opp: 'SF', dvp: 0.8 },
    ]);
    expect(a.opp).toBe('ARI');
    expect(a.dvp).toBe(1.3);
    expect(qb().rows.find((r) => r.pid === 'c')!.ahead[1]).toMatchObject({ week: 7, opp: 'BYE' });
  });

  it('streams for the week after, with its own schedule and no hold past the season', () => {
    const w7 = streamers(m, { week: 7 }).cards.find((c) => c.key === 'QB')!;
    expect(w7.rows.map((r) => r.pid)).toEqual(['a', 'b']);
    expect(w7.rows[0]!.ahead.map((x) => x.week)).toEqual([7, 8, 9]);
    const last = streamers(m, { week: 11 }); // the model's final week
    expect(last.week).toBe(11);
    expect(last.cards.find((c) => c.key === 'QB')!.rows.every((r) => !r.hold)).toBe(true);
  });

  it('offers next week and the week after', () => {
    expect(streamWeeks(m)).toEqual([6, 7]);
    expect(streamers(m).weeks).toEqual([6, 7]);
    expect(streamers(m, { week: 2 }).week).toBe(6);
    expect(streamers(m, { week: 40 }).week).toBe(11); // the model's last week
    expect(streamers(league([...mine], { cur: 11, last: 9 }) ).cards).toEqual([]); // no week left
  });
});

describe('streamers: bye-week fill', () => {
  const players: HandPlayer[] = [
    ...mine.filter((p) => p.pid !== 'myqb' && p.pid !== 'mykk'),
    { pid: 'myqb', pos: 'QB', mu: 15, owner: 1, name: 'Bo Nix', bye: [6] },
    { pid: 'mykk', pos: 'K', mu: 8, owner: 1, name: 'My Kicker', onIr: false },
    { pid: 'fa-qb', pos: 'QB', mu: 16, owner: 0, name: 'Fill Quarterback' },
    { pid: 'fa-k', pos: 'K', mu: 9, owner: 0, name: 'Free Kicker' },
    { pid: 'fa-te', pos: 'TE', mu: 11, owner: 0 },
  ];

  it('puts a position whose starter is on bye first and says who it fills for', () => {
    const b = streamers(league(players));
    expect(b.cards.map((c) => c.key)).toEqual(['QB', 'TE', 'DEF', 'K', 'FLEX']);
    const m2 = league(players);
    m2.players.find((p) => p.pid === 'mykk')!.opp[6] = 'BYE';
    m2.players.find((p) => p.pid === 'mykk')!.mu[6] = 0;
    const b2 = streamers(m2);
    expect(b2.cards.map((c) => c.key)).toEqual(['QB', 'K', 'TE', 'DEF', 'FLEX']);
    expect(b2.fills.map((c) => c.key)).toEqual(['QB', 'K']);
    expect(b2.cards[0]!.fill).toMatchObject({ reason: 'bye' });
    expect(b2.cards[0]!.fill!.for.name).toBe('Bo Nix');
    expect(b2.cards.find((c) => c.key === 'TE')!.fill).toBeNull();
  });

  it('counts an out starter too', () => {
    const m = league(players);
    m.players.find((p) => p.pid === 'myte')!.injury = 'Out';
    const b = streamers(m, { week: 7 }); // week 6 is Bo Nix's bye
    expect(b.cards[0]!.key).toBe('TE');
    expect(b.cards[0]!.fill).toMatchObject({ reason: 'out' });
  });

  it('names a fill position as the headline pick even when a bigger upgrade sits elsewhere', () => {
    const m = league([...players, { pid: 'fa-te2', pos: 'TE', mu: 25, owner: 0, name: 'Monster Tight End' }]);
    const b = streamers(m);
    expect(b.cards[0]!.key).toBe('QB');
    expect(b.best?.card.key).toBe('QB');
    expect(b.best?.row.pid).toBe('fa-qb');
  });

  it('leaves a bye in another week alone', () => {
    expect(streamers(league(players), { week: 7 }).fills).toEqual([]);
    expect(streamers(league(players), { week: 6 }).fills.map((c) => c.key)).toEqual(['QB']);
  });

  it('does not call a bench player\'s bye a fill', () => {
    const m = league([...mine, { pid: 'bn', pos: 'QB', mu: 4, owner: 1, bye: [6] }]);
    expect(streamers(m).fills).toEqual([]);
  });
});

describe('streamers: flex fliers', () => {
  const fas: HandPlayer[] = [
    { pid: 'rb-fa', pos: 'RB', mu: 12, owner: 0, name: 'Flier Back' },
    { pid: 'wr-fa', pos: 'WR', mu: 11, owner: 0, name: 'Flier Wideout' },
    { pid: 'te-fa', pos: 'TE', mu: 13, owner: 0, name: 'Flier Tight End' },
  ];

  it('appears only when the league has a flex slot an RB or WR can fill', () => {
    const b = streamers(league([...mine, ...fas]));
    const flex = b.cards.find((c) => c.key === 'FLEX')!;
    expect(flex.rows.map((r) => r.pid)).toEqual(['rb-fa', 'wr-fa']); // the tight end has his own card
    expect(flex.rows[0]!.starter?.pid).toBe('myfx');
    expect(flex.rows[0]!.diff).toBe(3);
    expect(flex.rows[0]!.upgrade).toBe(true);
    expect(flex.fill).toBeNull();

    const none = league([...mine, ...fas], { slots: ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] });
    expect(streamers(none).cards.map((c) => c.key)).not.toContain('FLEX');
    expect(streamers(none, { positions: ['FLEX', 'QB'] }).cards.map((c) => c.key)).toEqual(['QB']);
  });

  it('does not count a superflex, which is a quarterback spot', () => {
    const sf = league([...mine, ...fas], { slots: ['QB', 'RB', 'WR', 'SUPER_FLEX'] });
    expect(cardSlots(sf, 'FLEX')).toEqual([]);
    const rec = league([...mine, ...fas], { slots: ['QB', 'RB', 'WR', 'REC_FLEX'] });
    expect(cardSlots(rec, 'FLEX')).toEqual(['REC_FLEX']);
    // a W/T slot is open to the wideout and not the back
    const flex = streamers(rec).cards.find((c) => c.key === 'FLEX')!;
    expect(flex.rows.map((r) => r.pid)).toEqual(['rb-fa', 'wr-fa']);
    expect(flex.rows[0]!.starter?.pid).not.toBe('rb-fa');
  });
});

describe('streamers: idp', () => {
  it('skips idp unless the league starts it', () => {
    const idp: HandPlayer = { pid: 'lb1', pos: 'LB', mu: 8, owner: 0 };
    expect(streamers(league([...mine, idp])).cards.map((c) => c.key)).not.toContain('LB');
    const m = league([...mine, idp, { pid: 'mylb', pos: 'LB', mu: 6, owner: 1 }], { slots: [...SLOTS, 'LB'] });
    const lb = streamers(m).cards.find((c) => c.key === 'LB')!;
    expect(lb.rows[0]).toMatchObject({ pid: 'lb1', diff: 2 });
  });
});
