import { describe, expect, it } from 'vitest';
import { winProb } from '../league.ts';
import { historyOf } from '../power/test-helpers.ts';
import { handModel } from '../test-helpers.ts';
import type { Means } from '../scenario.ts';
import type { HistoryRow, Model } from '../types.ts';
import { benchLeft, projectWeek, restOfSeason, scheduleLeft, standingsRank, streakLabel, streakOf } from './table.ts';

/** Four teams, week 5 of 6, one QB each worth 10·rid a week. Weeks 5 and 6: 1–2, 3–4 then 1–3, 2–4. */
function four(o: { wins?: number[]; pf?: number[]; games?: Array<[number, number, number]> } = {}): Model {
  const wins = o.wins ?? [3, 2, 2, 1], pf = o.pf ?? [400, 420, 380, 350];
  return handModel({
    cur: 5, last: 6, slots: ['QB'], sd: 20,
    teams: [1, 2, 3, 4].map((rid, i) => ({ rid, wins: wins[i], losses: 4 - wins[i]!, pf: pf[i] })),
    players: [1, 2, 3, 4].map((rid) => ({ pid: `q${rid}`, pos: 'QB' as const, mu: 10 * rid, owner: rid })),
    games: o.games ?? [[5, 1, 2], [5, 3, 4], [6, 1, 3], [6, 2, 4]],
  });
}
const meansOf = (m: Model): Means => Object.fromEntries(m.teams.map((t) => [t.rid, t.exp]));
const wp = (a: number, b: number) => winProb(a, b, 20);

describe('standingsRank', () => {
  it('orders by wins (a tie counts half), then points for, then roster id', () => {
    expect(standingsRank([
      { rid: 1, wins: 2, losses: 2, ties: 0, pf: 300 }, { rid: 2, wins: 2, losses: 2, ties: 0, pf: 320 },
      { rid: 3, wins: 1, losses: 1, ties: 2, pf: 500 }, { rid: 4, wins: 3, losses: 1, ties: 0, pf: 100 },
    ])).toEqual({ 4: 1, 3: 2, 2: 3, 1: 4 });
  });
});

describe('streakOf', () => {
  const rows = (results: Array<'W' | 'L' | 'T'>, final = true): HistoryRow[] => results.map((r, i) => ({
    key: `w${i + 1}`, week: i + 1, rid: 1, opp: 2, pts: r === 'W' ? 100 : r === 'L' ? 80 : 90, oppPts: 90, final,
  }));
  it('counts the latest run of the same result', () => {
    expect(streakOf(rows(['L', 'W', 'W', 'W']), 1)).toEqual({ kind: 'W', n: 3 });
    expect(streakOf(rows(['W', 'W', 'L']), 1)).toEqual({ kind: 'L', n: 1 });
    expect(streakOf(rows(['W', 'T', 'T']), 1)).toEqual({ kind: 'T', n: 2 });
  });
  it('skips unfinished weeks and playoff weeks, and is null with no games', () => {
    const r = [...rows(['W', 'L']), { key: 'w3', week: 3, rid: 1, opp: 2, pts: 0, oppPts: 50, final: false }];
    expect(streakOf(r, 1)).toEqual({ kind: 'L', n: 1 });
    expect(streakOf(rows(['W', 'L', 'L']), 1, 1)).toEqual({ kind: 'W', n: 1 });
    expect(streakOf([], 1)).toBeNull();
    expect(streakLabel(null)).toBe('—');
    expect(streakLabel({ kind: 'W', n: 4 })).toBe('W4');
  });
  it('reads the shared power-ranking history the same way', () => {
    // odd weeks pair 1–2 and 3–4, even weeks 1–3: team 1 wins weeks 1–2 and loses 3–4; team 3 loses week 2 to team 1, then wins 3–4
    const h = historyOf([[100, 90, 80, 70, 60, 50], [100, 90, 80, 70, 60, 50], [60, 70, 100, 90, 50, 80], [50, 60, 120, 100, 70, 90]]);
    expect(streakOf(h, 1)).toEqual({ kind: 'L', n: 2 });
    expect(streakOf(h, 3)).toEqual({ kind: 'W', n: 2 });
  });
});

describe('projectWeek', () => {
  it('resolves this week with the engine win probability and re-ranks on expected wins', () => {
    const m = four();
    const rows = Object.fromEntries(projectWeek(m, meansOf(m), wp).map((r) => [r.rid, r]));
    const p21 = wp(20, 10), p43 = wp(40, 30);
    expect(rows[1]!.opp).toBe(2);
    expect(rows[2]!.winP).toBeCloseTo(p21, 10);
    expect(rows[1]!.winP! + rows[2]!.winP!).toBeCloseTo(1, 10);
    expect(rows[1]!.expWins).toBeCloseTo(3 + (1 - p21), 10);
    expect(rows[4]!.expLosses).toBeCloseTo(3 + (1 - p43), 10);
    expect(rows[4]!.likely).toEqual({ w: 2, l: 3, t: 0 });
    expect(rows[3]!.likely).toEqual({ w: 2, l: 3, t: 0 });
    expect(rows[2]!.projPf).toBe(440);
    // now: 1 (3 wins), 2 (2, 420 pf), 3 (2, 380), 4 (1). After: 1 keeps the top; 2 is favoured over 1 and passes nobody else
    expect([1, 2, 3, 4].map((r) => rows[r]!.rank)).toEqual([1, 2, 3, 4]);
    expect(rows[1]!.projRank).toBe(1);
    expect(rows[2]!.projRank).toBe(2);
  });

  it('moves a favourite past a team it is level with', () => {
    // 3 has fewer points than 2 now, but 3 is a big favourite while 2 is an underdog
    const m = four({ wins: [3, 2, 2, 1], pf: [400, 420, 380, 350], games: [[5, 2, 4], [5, 1, 3]] });
    const rows = Object.fromEntries(projectWeek(m, meansOf(m), (a, b) => (a > b ? 0.9 : 0.1)).map((r) => [r.rid, r]));
    expect(rows[3]!.rank).toBe(3);
    expect(rows[3]!.projRank).toBe(2);
    expect(rows[3]!.move).toBe(1);
    expect(rows[2]!.move).toBe(-1);
  });

  it('takes the live win chance and projection for a game under way', () => {
    const m = four();
    const rows = Object.fromEntries(projectWeek(m, meansOf(m), wp, { 1: { winP: 0.97, points: 131 }, 2: { winP: 0.03, points: 88 } }).map((r) => [r.rid, r]));
    expect(rows[1]).toMatchObject({ winP: 0.97, mean: 131, projPf: 531, likely: { w: 4, l: 1, t: 0 } });
    expect(rows[1]!.expWins).toBeCloseTo(3.97, 10);
    expect(rows[2]).toMatchObject({ winP: 0.03, mean: 88, projPf: 508 });
    // the game not yet started keeps the pre-game numbers
    expect(rows[3]!.winP).toBeCloseTo(wp(30, 40), 10);
  });

  it('leaves a team on a bye where it is, and adds nothing once the regular season is over', () => {
    const m = four({ games: [[5, 1, 2]] });
    const bye = projectWeek(m, meansOf(m), wp).find((r) => r.rid === 3)!;
    expect(bye).toMatchObject({ opp: null, winP: null, expWins: 2, expLosses: 2, projPf: 380, likely: { w: 2, l: 2, t: 0 } });
    const after = four();
    after.meta.currentWeek = 7;
    expect(projectWeek(after, meansOf(after), wp).every((r) => r.opp === null && r.move === 0)).toBe(true);
  });
});

describe('scheduleLeft', () => {
  it('averages the remaining opponents’ expected points and ranks the hardest first', () => {
    const m = four();
    const rows = Object.fromEntries(scheduleLeft(m, meansOf(m)).map((r) => [r.rid, r]));
    // team 1 meets 2 then 3; team 4 meets 3 then 2. League average is 25 both weeks
    expect(rows[1]).toEqual({ rid: 1, games: 2, oppAvg: 25, vsLeague: 0, rank: 1 }); // all level: roster id breaks the tie
    expect(rows[4]!.oppAvg).toBe(25);
    expect(rows[2]!.oppAvg).toBe(25); // 1 then 4
    expect(rows[3]!.oppAvg).toBe(25); // 4 then 1
    const uneven = four({ games: [[5, 1, 4], [5, 2, 3], [6, 1, 4], [6, 2, 3]] });
    const u = Object.fromEntries(scheduleLeft(uneven, meansOf(uneven)).map((r) => [r.rid, r]));
    expect(u[1]).toMatchObject({ oppAvg: 40, vsLeague: 15, rank: 1 });
    expect(u[4]).toMatchObject({ oppAvg: 10, vsLeague: -15, rank: 4 });
  });

  it('has nothing to say about a team with no games left', () => {
    const m = four({ games: [[5, 1, 2]] });
    expect(scheduleLeft(m, meansOf(m)).find((r) => r.rid === 3)).toEqual({ rid: 3, games: 0, oppAvg: null, vsLeague: null, rank: null });
  });
});

describe('restOfSeason', () => {
  it('sums expected lineup points from this week through the last regular week', () => {
    const m = four();
    expect(restOfSeason(m, meansOf(m))[3]).toEqual({ total: 60, perWeek: 30, weeks: 2 });
  });
});

describe('benchLeft', () => {
  it('adds each week’s bench points per team', () => {
    const out = benchLeft([
      { bench: [{ rid: 1, left: 10 }, { rid: 2, left: 0 }] },
      { bench: [{ rid: 1, left: 4.5 }, { rid: 2, left: 3 }] },
      { bench: [{ rid: 2, left: 6 }] },
    ]);
    expect(out[1]).toEqual({ total: 14.5, weeks: 2, perWeek: 7.25 });
    expect(out[2]).toEqual({ total: 9, weeks: 3, perWeek: 3 });
    expect(benchLeft([])).toEqual({});
  });
});
