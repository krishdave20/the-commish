import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../data/types.ts';
import { buildView } from '../live/derive.ts';
import { ctx, games, row, snapshot } from '../live/test-helpers.ts';
import type { HingesResult, HingeRow } from '../hinges/index.ts';
import type { HistoryRow, Slot } from '../types.ts';
import {
  buildScoutReport, headToHead, howToBeat, MY_LABELS, pastWeeksOf, recentMoves, scoutLineup, scoutTeam, teamLabels, tendencies, windowName,
} from './index.ts';
import type { ScoutPlayer, ScoutTeam } from './index.ts';

const HOUR = 3_600_000;
// Sunday Oct 18, 2026 1:00 pm US Eastern (EDT, UTC-4); Monday Oct 19, 8:15 pm
const SUN_1PM = Date.UTC(2026, 9, 18, 17, 0);
const SUN_8PM = Date.UTC(2026, 9, 19, 0, 20);
const MON_8PM = Date.UTC(2026, 9, 20, 0, 15);

function P(pid: string, pos: string, mu: number, o: Partial<ScoutPlayer> = {}): ScoutPlayer {
  const state = o.state ?? 'pre';
  const actual = o.actual ?? 0;
  const projection = o.projection ?? (state === 'final' ? actual : state === 'live' ? actual + mu * 0.5 : mu);
  return { pid, name: pid, pos, nfl: 'AAA', state, actual, mu, projection, kickoff: SUN_1PM, injury: '', ceiling: null, bye: false, ...o };
}

function team(slots: Slot[], starters: Array<ScoutPlayer | null>, bench: ScoutPlayer[] = [], o: Partial<ScoutTeam> = {}): ScoutTeam {
  const actual = starters.reduce((s, p) => s + (p?.actual ?? 0), 0);
  return { rid: 2, name: 'killa k im gay', manager: 'Kay', isMe: false, slots, starters, bench, actual, ...o };
}

const SLOTS: Slot[] = ['QB', 'RB', 'WR', 'FLEX'];

describe('their lineup: sub-optimal starters', () => {
  it('flags "starting X over Y" with the projection points it costs, and counts what is left on the bench', () => {
    const t = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flexwr', 'WR', 6)], [P('benchrb', 'RB', 11.5), P('benchte', 'TE', 3)]);
    const l = scoutLineup(t, { review: false });
    expect(l.isOptimal).toBe(false);
    expect(l.left).toBe(5.5);
    expect(l.optimal).toBe(53.5);
    expect(l.projection).toBe(48);
    expect(l.swaps).toHaveLength(1);
    expect(l.swaps[0]).toMatchObject({ slot: 'FLEX', gain: 5.5 });
    expect(l.swaps[0]!.out!.pid).toBe('flexwr');
    expect(l.swaps[0]!.in.pid).toBe('benchrb');
    expect(l.notes.map((n) => n.text)).toEqual(['they’re starting flexwr over benchrb (−5.5 proj)']);
    expect(l.notes[0]!.kind).toBe('swap');
    expect(l.notes[0]!.severity).toBe('high');
  });

  it('says nothing when the lineup is already the best one the roster allows', () => {
    const t = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flexwr', 'WR', 9)], [P('benchrb', 'RB', 8), P('benchte', 'TE', 3)]);
    const l = scoutLineup(t, { review: false });
    expect(l.isOptimal).toBe(true);
    expect(l.left).toBe(0);
    expect(l.swaps).toEqual([]);
    expect(l.notes).toEqual([]);
  });

  it('does not move a starter whose game has started, or use a bench player who has already played', () => {
    const t = team(
      SLOTS,
      [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flexwr', 'WR', 6, { state: 'final', actual: 4, kickoff: SUN_1PM - 6 * HOUR })],
      [P('benchrb', 'RB', 11.5), P('playedwr', 'WR', 15, { state: 'final', actual: 18, kickoff: SUN_1PM - 6 * HOUR })],
    );
    const l = scoutLineup(t, { review: false });
    // the final flex stays (4 points), the played wideout is not available; the bench rb cannot take a slot that is locked
    expect(l.swaps).toEqual([]);
    expect(l.isOptimal).toBe(true);
    // the played wideout is out of reach; the unplayed bench rb is only a threat to the rb slot (11.5 vs 12.0)
    expect(l.threats.map((x) => x.player.pid)).toEqual(['benchrb']);
  });

  it('in a review reads actual points: "they started X over Y"', () => {
    const t = team(
      SLOTS,
      [P('qb', 'QB', 20, { state: 'final', actual: 22 }), P('rb', 'RB', 12, { state: 'final', actual: 9 }), P('wr', 'WR', 10, { state: 'final', actual: 3 }), P('flexwr', 'WR', 9, { state: 'final', actual: 8 })],
      [P('benchwr', 'WR', 4, { state: 'final', actual: 17.2 })],
    );
    const l = scoutLineup(t, { review: true });
    expect(l.left).toBe(14.2);
    expect(l.notes[0]!.text).toBe('they started wr over benchwr (−14.2 pts)');
    expect(l.projection).toBe(42);
    expect(l.optimal).toBe(56.2);
  });
});

describe('their lineup: empty and injured starters', () => {
  it('flags an empty slot, with the bench player who could fill it', () => {
    const t = team(['QB', 'RB', 'TE'], [P('qb', 'QB', 20), P('rb', 'RB', 12), null], [P('te2', 'TE', 8.24)]);
    const l = scoutLineup(t, { review: false });
    expect(l.empties).toEqual(['TE']);
    expect(l.notes.map((n) => n.text)).toEqual(['their te slot is empty, with te2 (8.2 proj) on the bench']);
    expect(l.notes[0]).toMatchObject({ kind: 'empty', severity: 'high' });
    expect(l.left).toBe(8.2);
  });

  it('says only "their te slot is empty" when nobody on the bench plays the position', () => {
    const t = team(['QB', 'RB', 'TE'], [P('qb', 'QB', 20), P('rb', 'RB', 12), null], [P('wr2', 'WR', 8)]);
    const l = scoutLineup(t, { review: false });
    expect(l.notes.map((n) => n.text)).toEqual(['their te slot is empty']);
    expect(l.notes[0]!.player).toBeNull();
  });

  it('flags a questionable, doubtful or out starter, and a starter on a bye', () => {
    const t = team(
      ['QB', 'RB', 'WR', 'WR', 'TE'],
      [P('qb', 'QB', 20, { injury: 'Questionable' }), P('rb', 'RB', 12, { injury: 'Doubtful', projection: 3.6 }), P('wr1', 'WR', 10), P('wr2', 'WR', 9, { bye: true, state: 'idle', projection: 0 }), P('te', 'TE', 7)],
      [],
    );
    const l = scoutLineup(t, { review: false });
    const byKind = Object.fromEntries(l.notes.map((n) => [n.player?.pid, n]));
    expect(byKind.qb!.text).toBe('they’re starting a questionable qb: qb');
    expect(byKind.qb!.severity).toBe('low');
    expect(byKind.rb!.text).toBe('they’re starting a doubtful rb: rb');
    expect(byKind.rb!.severity).toBe('medium');
    expect(byKind.wr2!.text).toBe('they’re starting wr2, who is on a bye');
    expect(byKind.wr2!.severity).toBe('high');
    // worst first
    expect(l.notes.map((n) => n.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('puts the injury in the swap when the bench has the better play, instead of saying it twice', () => {
    const t = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12, { injury: 'Out', projection: 0 }), P('wr', 'WR', 10), P('flexwr', 'WR', 9)], [P('benchrb', 'RB', 7)]);
    const l = scoutLineup(t, { review: false });
    expect(l.notes).toHaveLength(1);
    expect(l.notes[0]!.text).toBe('they’re starting rb (out) over benchrb (−7.0 proj)');
    expect(l.notes[0]!.severity).toBe('high');
  });

  it('never flags injuries in a review (today’s injury report says nothing about that week)', () => {
    const t = team(['QB', 'RB'], [P('qb', 'QB', 20, { state: 'final', actual: 20, injury: 'Out' }), P('rb', 'RB', 12, { state: 'final', actual: 12 })]);
    expect(scoutLineup(t, { review: true }).notes).toEqual([]);
  });
});

describe('their bench threat', () => {
  const starters = [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10.5), P('flexwr', 'WR', 10)];

  it('lists healthy bench players within 3.0 of the starter they could replace, closest first, with the ceiling', () => {
    const t = team(SLOTS, starters, [
      P('closewr', 'WR', 8.5, { ceiling: 17 }), P('farwr', 'WR', 4), P('closerb', 'RB', 9.8), P('ir', 'RB', 11, { injury: 'Out', projection: 0 }), P('te', 'TE', 9.5),
    ]);
    const l = scoutLineup(t, { review: false });
    expect(l.isOptimal).toBe(true);
    expect(l.threats.map((x) => x.player.pid)).toEqual(['closerb', 'te', 'closewr']);
    const wr = l.threats.find((x) => x.player.pid === 'closewr')!;
    expect(wr.gap).toBe(-1.5);
    expect(wr.against.pid).toBe('flexwr');
    expect(wr.text).toBe('closewr is 1.5 behind flexwr at flex: 8.5 vs 10.0 proj, ceiling 17.0');
    // a bench rb is measured against the weakest starter he could replace: the flex wideout (10.0), not the rb (12.0)
    expect(l.threats.find((x) => x.player.pid === 'closerb')).toMatchObject({ slot: 'FLEX', gap: -0.2 });
  });

  it('keeps at most three, and drops the ones more than 3.0 behind', () => {
    const t = team(SLOTS, starters, [P('a', 'WR', 9), P('b', 'WR', 8), P('c', 'WR', 7.5), P('d', 'WR', 7.2), P('far', 'WR', 6.5)]);
    const l = scoutLineup(t, { review: false });
    expect(l.threats.map((x) => x.player.pid)).toEqual(['a', 'b', 'c']);
  });

  it('in a review lists the bench players who outscored a starter that were not the headline swap', () => {
    const t = team(
      ['QB', 'WR', 'WR'],
      [P('qb', 'QB', 20, { state: 'final', actual: 20 }), P('w1', 'WR', 10, { state: 'final', actual: 4 }), P('w2', 'WR', 10, { state: 'final', actual: 6 })],
      [P('b1', 'WR', 5, { state: 'final', actual: 15 }), P('b2', 'WR', 5, { state: 'final', actual: 8 }), P('b3', 'WR', 5, { state: 'final', actual: 2 })],
    );
    const l = scoutLineup(t, { review: true });
    // best lineup brings in b1 (15) and b2 (8); both are swaps, b3 beat nobody
    expect(l.swaps.map((s) => s.in.pid).sort()).toEqual(['b1', 'b2']);
    expect(l.threats).toEqual([]);
  });
});

describe('scoutTeam: from the game day feed', () => {
  it('lines the lineup up with the slots, marks the empty slot and the bye, and keeps IR off the bench', () => {
    const c = ctx({ slots: ['QB', 'RB', 'WR', 'WR'] as Slot[] });
    const snap = snapshot({ q2: 18 }, games('pre').filter((g) => g.home !== 'FFF' && g.away !== 'FFF'), {
      rows: [
        row(1, 1, {}, ['q1', 'r1', 'w1', '0'], ['b1']),
        { ...row(2, 1, { q2: 18 }, ['q2', 'r2', 'w2', '0'], ['b1', 'b3']) },
      ],
    });
    const t = scoutTeam(c, snap, 2, { injury: (pid) => (pid === 'r2' ? 'Questionable' : ''), onIr: (pid) => pid === 'b3' })!;
    expect(t.starters.map((p) => p?.pid ?? null)).toEqual(['q2', 'r2', 'w2', null]);
    expect(t.bench.map((p) => p.pid)).toEqual(['b1']);
    expect(t.starters[1]!.injury).toBe('Questionable');
    // FFF has no game in this slate: Reed Receiver is on a bye
    expect(t.starters[2]!.bye).toBe(true);
    expect(t.starters[2]!.state).toBe('idle');
    expect(t.starters[0]).toMatchObject({ name: 'Quinn Quarterback', mu: 19, actual: 18, state: 'pre', projection: 37 });
    expect(scoutTeam(c, snap, 99)).toBeNull();
  });
});

/* ---------- tendencies ---------- */

const H = (week: number, rid: number, opp: number, pts: number, oppPts: number, final = true): HistoryRow => ({ key: `${week}-${rid}`, week, rid, opp, pts, oppPts, final });
// a 4-team league, rid 2 is the team being scouted; league averages: w1 100, w2 100, w3 100, w4 100
function league(rows: Array<[number, number, number, number]>): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (const [week, pts, oppPts, other] of rows) {
    out.push(H(week, 2, 1, pts, oppPts), H(week, 1, 2, oppPts, pts));
    // the other two teams make the league average round
    const rest = 400 - pts - oppPts;
    out.push(H(week, 3, 4, rest / 2 + other, rest / 2 - other), H(week, 4, 3, rest / 2 - other, rest / 2 + other));
  }
  return out;
}

describe('tendencies', () => {
  const history = league([[1, 130, 100, 0], [2, 70, 95, 0], [3, 112, 108, 0], [4, 91, 93, 0]]);
  const past = [
    { week: 1, actual: 130, projection: 110, left: 4 },
    { week: 2, actual: 70, projection: 105, left: 12.5 },
    { week: 3, actual: 112, projection: 100, left: 0 },
    { week: 4, actual: 91, projection: 98, left: 0 },
  ];

  it('works out points left on the bench, how often the lineup was already the best one, and the average', () => {
    const t = tendencies({ rid: 2, week: 5, past, history });
    expect(t.sideline).toEqual({ weeks: 4, avgLeft: 4.1, optimalWeeks: 2 });
    expect(t.lines[0]).toBe('leaves 4.1 points on the bench a week, best lineup in 2 of 4 weeks');
  });

  it('calls a team an over or underperformer beyond ±2.0 points of projection a week', () => {
    // diffs: +20, −35, +12, −7 = −10 over 4 weeks
    const t = tendencies({ rid: 2, week: 5, past, history });
    expect(t.vsProjection).toEqual({ weeks: 4, avgDiff: -2.5, label: 'underperformer' });
    expect(t.lines[1]).toBe('underperformer: 2.5 points below projection a week over 4 weeks');
    const over = tendencies({ rid: 2, week: 5, past: past.map((p) => ({ ...p, projection: p.actual - 3 })), history });
    expect(over.vsProjection).toMatchObject({ avgDiff: 3, label: 'overperformer' });
    const near = tendencies({ rid: 2, week: 5, past: past.map((p) => ({ ...p, projection: p.actual - 1.5 })), history });
    expect(near.vsProjection).toMatchObject({ avgDiff: 1.5, label: 'on projection' });
    expect(near.lines[1]).toBe('scores about what the projection says (+1.5 a week over 4 weeks)');
  });

  it('has nothing to say about projections when the projections could not be read', () => {
    const t = tendencies({ rid: 2, week: 5, past: past.map((p) => ({ ...p, projection: null })), history });
    expect(t.vsProjection).toBeNull();
    expect(t.sideline).not.toBeNull();
  });

  it('counts boom and bust weeks against the league average and reads the spread', () => {
    // league average is 100 every week (the others fill the rest): 130 is a boom (≥120), 70 a bust (≤80), 112 and 91 neither
    const t = tendencies({ rid: 2, week: 5, past, history });
    expect(t.scoring).toMatchObject({ weeks: 4, avg: 100.8, high: { week: 1, pts: 130 }, low: { week: 2, pts: 70 }, booms: 1, busts: 1, style: 'boom or bust' });
    expect(t.lines[2]).toBe('averages 100.8, from 70.0 (week 2) to 130.0 (week 1): boom or bust, 1 boom and 1 bust weeks of 4');
  });

  it('calls a flat run of scores steady, and refuses to label a team on fewer than three weeks', () => {
    const flat = league([[1, 100, 98, 0], [2, 104, 99, 0], [3, 97, 101, 0]]);
    expect(tendencies({ rid: 2, week: 4, past: [], history: flat }).scoring!.style).toBe('steady');
    expect(tendencies({ rid: 2, week: 3, past: [], history: flat }).scoring!.style).toBe('in between');
  });

  it('records the result of games decided by 10 or fewer', () => {
    // margins: +30 (not close), −25 (not close), +4 (close win), −2 (close loss)
    const t = tendencies({ rid: 2, week: 5, past, history });
    expect(t.close).toEqual({ games: 2, wins: 1, losses: 1, ties: 0 });
    expect(t.lines[3]).toBe('1–1 in games decided by 10 or fewer');
  });

  it('only counts finished weeks before the week asked about', () => {
    const t = tendencies({ rid: 2, week: 3, past, history: [...history, H(5, 2, 1, 150, 10, false)] });
    expect(t.sideline!.weeks).toBe(2);
    expect(t.scoring!.weeks).toBe(2);
  });

  it('is empty before anyone has played', () => {
    const t = tendencies({ rid: 2, week: 1, past: [], history: [] });
    expect(t).toMatchObject({ weeks: 0, sideline: null, vsProjection: null, scoring: null, close: null, lines: [] });
  });
});

describe('pastWeeksOf', () => {
  it('reads a team’s points, pre-game projection and points left on the bench off the week views', () => {
    const c = ctx();
    const snap = snapshot({ q1: 20, r1: 10, w1: 4, b1: 15, q2: 18, r2: 9, w2: 12 }, games('final'));
    const view = buildView(c, { ...snap, week: 4 });
    const w = pastWeeksOf(1, [{ view, projected: true }]);
    // icemen started w1 (4) while b1 (15) sat: left 11; projected 20 + 15 + 12 = 47
    expect(w).toEqual([{ week: 4, actual: 34, projection: 47, left: 11 }]);
    expect(pastWeeksOf(1, [{ view, projected: false }])[0]!.projection).toBeNull();
  });
});

/* ---------- recent moves ---------- */

const tx = (o: Partial<Transaction> & { transaction_id: string; type: string }): Transaction => ({ status: 'complete', leg: 6, created: 1, status_updated: 1, adds: null, drops: null, roster_ids: [2], ...o });
const lookup = {
  player: (pid: string) => ({ a1: { name: 'ray adds', pos: 'RB', nfl: 'KC', mu: 11.24 }, d1: { name: 'dan drops', pos: 'WR', nfl: 'KC', mu: 5 }, t1: { name: 'tom traded', pos: 'TE', nfl: 'SF', mu: 7 } } as Record<string, { name: string; pos: string; nfl: string; mu: number }>)[pid] ?? null,
  teamName: (rid: number) => (rid === 1 ? 'icemen' : `team ${rid}`),
};

describe('recent moves', () => {
  it('parses a waiver claim with its bid, a free-agent swap, a drop and a trade, newest first', () => {
    const moves = recentMoves({
      rid: 2, week: 6, lookup,
      transactions: [
        tx({ transaction_id: 'w', type: 'waiver', adds: { a1: 2 }, settings: { waiver_bid: 25 }, status_updated: 1000 }),
        tx({ transaction_id: 'fa', type: 'free_agent', adds: { a1: 2 }, drops: { d1: 2 }, status_updated: 3000 }),
        tx({ transaction_id: 'dr', type: 'free_agent', drops: { d1: 2 }, status_updated: 2000, leg: 5 }),
        tx({ transaction_id: 'tr', type: 'trade', roster_ids: [2, 1], adds: { t1: 2 }, drops: { a1: 2 }, draft_picks: [{ season: '2027', round: 3, roster_id: 1, previous_owner_id: 1, owner_id: 2 }], status_updated: 4000 }),
      ],
    });
    expect(moves.map((m) => m.id)).toEqual(['tr', 'fa', 'dr', 'w']);
    expect(moves.map((m) => m.kind)).toEqual(['trade', 'swap', 'drop', 'add']);
    expect(moves[3]!.text).toBe('added ray adds (rb, 11.2 proj) for $25');
    expect(moves[3]!.bid).toBe(25);
    expect(moves[1]!.text).toBe('added ray adds (rb, 11.2 proj), dropped dan drops');
    expect(moves[2]!.text).toBe('dropped dan drops');
    expect(moves[0]!.text).toBe('traded with icemen: got tom traded (te, 7.0 proj), 2027 round 3 pick, gave ray adds');
    expect(moves[0]!.partner).toBe(1);
  });

  it('keeps the last two weeks only, completed transactions only, and only this roster’s side of a trade', () => {
    const moves = recentMoves({
      rid: 2, week: 6, lookup,
      transactions: [
        tx({ transaction_id: 'old', type: 'waiver', leg: 4, adds: { a1: 2 } }),
        tx({ transaction_id: 'failed', type: 'waiver', status: 'failed', adds: { a1: 2 } }),
        tx({ transaction_id: 'other', type: 'free_agent', roster_ids: [9], adds: { a1: 9 } }),
        tx({ transaction_id: 'future', type: 'free_agent', leg: 7, adds: { a1: 2 } }),
        tx({ transaction_id: 'edge', type: 'free_agent', leg: 5, adds: { a1: 2 } }),
      ],
    });
    expect(moves.map((m) => m.id)).toEqual(['edge']);
  });

  it('names a player the lookup does not know by his id, and has no moves with no transactions', () => {
    const m = recentMoves({ rid: 2, week: 6, lookup, transactions: [tx({ transaction_id: 'x', type: 'free_agent', adds: { zz: 2 } })] });
    expect(m[0]!.text).toBe('added player zz');
    expect(recentMoves({ rid: 2, week: 6, lookup, transactions: [] })).toEqual([]);
  });
});

/* ---------- head to head ---------- */

describe('head to head', () => {
  const hist = [H(2, 1, 2, 112.3, 98), H(2, 2, 1, 98, 112.3), H(4, 1, 3, 90, 80), H(6, 1, 2, 0, 0, false)];
  it('lists the finished meetings before this week from the asker’s side', () => {
    const h = headToHead({ you: 1, them: 2, week: 6, history: hist });
    expect(h.meetings).toEqual([{ week: 2, you: 112.3, them: 98, result: 'W' }]);
    expect(h).toMatchObject({ wins: 1, losses: 0, ties: 0, summary: '1–0 so far this season' });
  });

  it('says so when they have not met, and does not count this week or a team’s other opponents', () => {
    expect(headToHead({ you: 1, them: 3, week: 4, history: hist }).summary).toBe('no meeting yet this season');
    expect(headToHead({ you: 1, them: 2, week: 2, history: hist }).meetings).toEqual([]);
  });

  it('counts losses and ties', () => {
    const h = headToHead({ you: 1, them: 2, week: 9, history: [H(1, 1, 2, 80, 90), H(3, 1, 2, 90, 90), H(5, 1, 2, 100, 70)] });
    expect(h).toMatchObject({ wins: 1, losses: 1, ties: 1, summary: '1–1–1 so far this season' });
  });
});

/* ---------- how to beat them ---------- */

const hingeRow = (o: Partial<HingeRow> & { pid: string; atStake: number }): HingeRow => ({
  slot: 'QB', name: o.pid, pos: 'QB', nfl: 'AAA', state: 'pre', actual: 0, mu: 20, remaining: 1, opp: 'BBB', home: true, statusText: '', kickoff: SUN_1PM,
  perGame: null, snapPct: null, replacement: 10, projection: 20, swing: 10, winWithout: 0.4, ...o,
});
const hinges = (rows: HingeRow[]): HingesResult => ({ rid: 2, name: 'them', isMe: false, winNow: 0.6, projection: 100, otherProjection: 98, rows, started: false });

describe('how to beat them', () => {
  const quiet = { vsProjection: null, sideline: null } as never;
  const you = team(SLOTS, [P('yqb', 'QB', 20), P('yrb', 'RB', 12), P('ywr', 'WR', 10), P('yflex', 'WR', 8)], [], { rid: 1, name: 'icemen', isMe: true });
  const them = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flex', 'WR', 12.2)], [P('b', 'WR', 5)]);
  const base = { you, target: them, labels: MY_LABELS, lineup: scoutLineup(them, { review: false }), hinges: null, tendencies: quiet };

  it('names the swing slot with the size of the gap and who it favours', () => {
    const keys = howToBeat(base);
    expect(keys[0]).toMatchObject({ kind: 'swing', number: 4.2 });
    expect(keys[0]!.text).toBe('your flex vs their flex is the swing slot: projected +4.2 for them');
    // the other way round
    const keys2 = howToBeat({ ...base, you: team(SLOTS, [P('yqb', 'QB', 20), P('yrb', 'RB', 12), P('ywr', 'WR', 10), P('yflex', 'WR', 17)], [], { rid: 1 }) });
    expect(keys2[0]!.text).toBe('your flex vs their flex is the swing slot: projected +4.8 for you');
  });

  it('uses team names when the matchup is not yours', () => {
    const keys = howToBeat({ ...base, labels: teamLabels('icemen', 'killa k') });
    expect(keys[0]!.text).toBe('icemen’s flex vs killa k’s flex is the swing slot: projected +4.2 for killa k');
  });

  it('skips a gap under 1.5 and a slot where both players are done', () => {
    const even = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12.5), P('wr', 'WR', 10), P('flex', 'WR', 8.4)]);
    expect(howToBeat({ ...base, target: even, lineup: scoutLineup(even, { review: false }) }).filter((k) => k.kind === 'swing')).toEqual([]);
    const done = (p: string, pos: string, a: number) => P(p, pos, a, { state: 'final', actual: a });
    const y2 = team(SLOTS, [done('a', 'QB', 30), P('yrb', 'RB', 12), P('ywr', 'WR', 10), P('yflex', 'WR', 8)], [], { rid: 1 });
    const t2 = team(SLOTS, [done('b', 'QB', 10), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flex', 'WR', 8)]);
    expect(howToBeat({ ...base, you: y2, target: t2, lineup: scoutLineup(t2, { review: false }) }).filter((k) => k.kind === 'swing')).toEqual([]);
  });

  it('says who knows what they need when one side plays later (monday night vs sunday)', () => {
    const theirMonday = team(SLOTS, [P('qb', 'QB', 20, { kickoff: MON_8PM, name: 'jordan love' }), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flex', 'WR', 9)]);
    const yourSunday = team(SLOTS, [P('yqb', 'QB', 20, { kickoff: SUN_8PM }), P('yrb', 'RB', 12), P('ywr', 'WR', 10), P('yflex', 'WR', 9)], [], { rid: 1 });
    const k = howToBeat({ ...base, you: yourSunday, target: theirMonday, lineup: scoutLineup(theirMonday, { review: false }) }).find((x) => x.kind === 'timing')!;
    expect(k.text).toBe('their qb jordan love plays monday night, after your last starter: they will know what they need');
    // swapped: you play monday night
    const yourMonday = team(SLOTS, [P('yqb', 'QB', 20, { kickoff: MON_8PM, name: 'justin herbert' }), P('yrb', 'RB', 12), P('ywr', 'WR', 10), P('yflex', 'WR', 9)], [], { rid: 1 });
    const theirSunday = team(SLOTS, [P('qb', 'QB', 20, { kickoff: SUN_8PM }), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flex', 'WR', 9)]);
    const k2 = howToBeat({ ...base, you: yourMonday, target: theirSunday, lineup: scoutLineup(theirSunday, { review: false }) }).find((x) => x.kind === 'timing')!;
    expect(k2.text).toBe('your qb justin herbert plays monday night, after all of their starters: you will know what you need');
    // the same rule with team names (a matchup that is not mine)
    const named = howToBeat({ ...base, labels: teamLabels('icemen', 'killa k'), you: yourSunday, target: theirMonday, lineup: scoutLineup(theirMonday, { review: false }) }).find((x) => x.kind === 'timing')!;
    expect(named.text).toBe('killa k’s qb jordan love plays monday night, after icemen’s last starter: killa k will know what it needs');
    // within three hours of each other: no edge
    const sameWindow = team(SLOTS, [P('qb', 'QB', 20, { kickoff: SUN_1PM + HOUR }), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flex', 'WR', 9)]);
    expect(howToBeat({ ...base, target: sameWindow, lineup: scoutLineup(sameWindow, { review: false }) }).find((x) => x.kind === 'timing')).toBeUndefined();
  });

  it('names the starter their win chance rides on, with the points of win chance', () => {
    const k = howToBeat({ ...base, hinges: hinges([hingeRow({ pid: 'qb', name: 'jordan love', atStake: 14.4, projection: 21.34 }), hingeRow({ pid: 'rb', atStake: 3 })]) }).find((x) => x.kind === 'star')!;
    expect(k.text).toBe('jordan love carries their week: 14 points of win chance ride on him (21.3 proj)');
    expect(howToBeat({ ...base, hinges: hinges([hingeRow({ pid: 'qb', atStake: 4.9 })]) }).find((x) => x.kind === 'star')).toBeUndefined();
  });

  it('points at a lineup that is 2.0 or more short of optimal, an empty slot, and an injured starter with and without cover', () => {
    const sloppy = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flexwr', 'WR', 4)], [P('brb', 'RB', 9.4)]);
    const keys = howToBeat({ ...base, target: sloppy, lineup: scoutLineup(sloppy, { review: false }) });
    expect(keys.find((x) => x.kind === 'lineup')!.text).toBe('their lineup is 5.4 short of optimal: if it stays that way, that is your edge');

    const hole = team(['QB', 'RB', 'TE'], [P('qb', 'QB', 20), P('rb', 'RB', 12), null]);
    const k2 = howToBeat({ ...base, you: team(['QB', 'RB', 'TE'], [P('a', 'QB', 20), P('b', 'RB', 12), P('c', 'TE', 7)], [], { rid: 1 }), target: hole, lineup: scoutLineup(hole, { review: false }) });
    expect(k2.find((x) => x.kind === 'empty')!.text).toBe('their te slot is empty: it scores nothing unless they fill it');

    const hurt = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12, { injury: 'Questionable', projection: 10.2, name: 'james cook' }), P('wr', 'WR', 10), P('flex', 'WR', 9)], [P('brb', 'RB', 6.1)]);
    const k3 = howToBeat({ ...base, target: hurt, lineup: scoutLineup(hurt, { review: false }) }).find((x) => x.kind === 'cover')!;
    expect(k3.text).toBe('james cook is questionable (10.2 proj): if he sits, brb steps in at 6.1');
    const bare = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12, { injury: 'Doubtful', projection: 3.6, name: 'james cook' }), P('wr', 'WR', 10), P('flex', 'WR', 9)]);
    const k4 = howToBeat({ ...base, target: bare, lineup: scoutLineup(bare, { review: false }) }).find((x) => x.kind === 'cover')!;
    expect(k4.text).toBe('james cook is doubtful (3.6 proj): their bench has no healthy rb to cover him');
  });

  it('quotes their season habit: above or below projection by 2.0 a week, or 5.0 on the bench', () => {
    const t = (vs: number | null, left: number) => tendencies({
      rid: 2, week: 5, history: [], past: [1, 2, 3].map((w) => ({ week: w, actual: 100 + (vs ?? 0), projection: vs === null ? null : 100, left })),
    });
    const over = howToBeat({ ...base, tendencies: t(4.1, 0) }).find((x) => x.kind === 'habit')!;
    expect(over.text).toBe('they run 4.1 above projection a week (3 weeks): do not trust the projection to hold them down');
    const under = howToBeat({ ...base, tendencies: t(-3, 0) }).find((x) => x.kind === 'habit')!;
    expect(under.text).toBe('they run 3.0 below projection a week (3 weeks): their projection is likely too kind');
    const loose = howToBeat({ ...base, tendencies: t(null, 6.2) }).find((x) => x.kind === 'habit')!;
    expect(loose.text).toBe('they leave 6.2 points on the bench a week: expect another loose lineup');
    expect(howToBeat({ ...base, tendencies: t(1, 1) }).find((x) => x.kind === 'habit')).toBeUndefined();
  });

  it('keeps the three heaviest keys, the swing slot first', () => {
    const t = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flexwr', 'WR', 4, { injury: 'Questionable' })], [P('brb', 'RB', 9.4)]);
    const keys = howToBeat({ ...base, target: t, lineup: scoutLineup(t, { review: false }), hinges: hinges([hingeRow({ pid: 'qb', atStake: 12 })]) });
    expect(keys).toHaveLength(3);
    expect(keys.map((k) => k.kind)).toEqual(['swing', 'star', 'lineup']);
    expect(keys[0]!.weight).toBeGreaterThan(keys[1]!.weight);
  });
});

describe('windowName', () => {
  it('reads the NFL window in US Eastern time', () => {
    expect(windowName(SUN_1PM)).toBe('sunday afternoon');
    expect(windowName(SUN_8PM)).toBe('sunday night');
    expect(windowName(MON_8PM)).toBe('monday night');
    expect(windowName(Date.UTC(2026, 9, 18, 13, 30))).toBe('sunday morning');
  });
});

/* ---------- the whole report ---------- */

describe('buildScoutReport', () => {
  const you = team(SLOTS, [P('yqb', 'QB', 20), P('yrb', 'RB', 12), P('ywr', 'WR', 10), P('yflex', 'WR', 8)], [], { rid: 1, name: 'icemen', isMe: true });
  const them = team(SLOTS, [P('qb', 'QB', 20), P('rb', 'RB', 12), P('wr', 'WR', 10), P('flexwr', 'WR', 6)], [P('benchrb', 'RB', 11.5)]);
  const input = {
    week: 6, review: false, target: them, you, labels: MY_LABELS, history: [] as HistoryRow[], past: [], transactions: [] as Transaction[], moves: lookup,
    hinges: hinges([hingeRow({ pid: 'qb', name: 'qb', atStake: 11, projection: 20 })]),
  };

  it('puts the answer first: their projection, their lineup grade and their biggest threat', () => {
    const r = buildScoutReport(input);
    expect(r.headline).toMatchObject({ projection: 48, otherProjection: 50, lineup: { isOptimal: false, left: 5.5 } });
    expect(r.headline.threat!.player.pid).toBe('qb');
    expect(r.headline.threat!.detail).toBe('20.0 proj · 11 points of win chance');
    expect(r.keys.length).toBeGreaterThan(0);
    expect(r.hinges).not.toBeNull();
  });

  it('falls back to their best open starter when there are no hinges', () => {
    const r = buildScoutReport({ ...input, hinges: null });
    expect(r.headline.threat).toMatchObject({ detail: '20.0 proj', atStake: null });
  });

  it('is a review for a finished week: points, top scorer, no keys, no hinges', () => {
    const done = (p: string, pos: string, a: number) => P(p, pos, a, { state: 'final', actual: a });
    const past = team(SLOTS, [done('qb', 'QB', 31.2), done('rb', 'RB', 9), done('wr', 'WR', 11), done('flexwr', 'WR', 2)], [done('benchrb', 'RB', 12)]);
    const r = buildScoutReport({ ...input, review: true, target: past, you: team(SLOTS, [done('a', 'QB', 10), done('b', 'RB', 10), done('c', 'WR', 10), done('d', 'WR', 10)], [], { rid: 1 }) });
    expect(r.keys).toEqual([]);
    expect(r.hinges).toBeNull();
    expect(r.headline.projection).toBe(53.2);
    expect(r.headline.lineup).toEqual({ isOptimal: false, left: 10 });
    expect(r.headline.threat).toMatchObject({ detail: '31.2 pts' });
  });
});
