/* A small hand-built league for the trade finder tests. Slots QB, RB, WR, WR; weeks 6 to 8 left plus playoff weeks 9 and 10 (5 weeks scored).

   Team 1 (you): QB weak, three spare wideouts (w3 and w4 sit), RB 12.
   Team 2: a great QB and a backup QB, bad wideouts, one junk wideout (j2) as the cheapest bench player.
   Team 3: QB 20 with a 14 backup, RB 17 with a 16 on the bench (r3b), poor wideouts.
   Team 4: a middling team that only shows up as a middle man in rotations. */
import { handModel, type HandPlayer, type HandOpts } from '../test-helpers.ts';
import type { Model, Pos } from '../types.ts';
import type { RealTrade } from './history.ts';

const P = (pid: string, pos: Pos, mu: number, owner: number, extra: Partial<HandPlayer> = {}): HandPlayer => ({ pid, pos, mu, owner, name: pid, ...extra });

export function finderPlayers(): HandPlayer[] {
  return [
    P('q1', 'QB', 10, 1), P('r1', 'RB', 12, 1), P('w1', 'WR', 20, 1), P('w2', 'WR', 19, 1), P('w3', 'WR', 18, 1), P('w4', 'WR', 17, 1),
    P('q2', 'QB', 25, 2), P('q2b', 'QB', 22, 2), P('r2', 'RB', 15, 2), P('w5', 'WR', 8, 2), P('w6', 'WR', 7, 2), P('j2', 'WR', 1, 2),
    P('q3', 'QB', 20, 3), P('q3b', 'QB', 14, 3), P('r3', 'RB', 17, 3), P('r3b', 'RB', 16, 3), P('w9', 'WR', 9, 3), P('w8', 'WR', 8, 3),
    P('q4', 'QB', 18, 4), P('r4', 'RB', 14, 4), P('w10', 'WR', 14, 4), P('w11', 'WR', 13, 4),
  ];
}

export function finderModel(o: Partial<HandOpts> = {}): Model {
  return handModel({
    slots: ['QB', 'RB', 'WR', 'WR'], cur: 5, last: 8,
    teams: [{ rid: 1, name: 'Me' }, { rid: 2, name: 'Two' }, { rid: 3, name: 'Three' }, { rid: 4, name: 'Four' }],
    players: finderPlayers(), ...o,
  });
}

/* ---------- a hand-built season for grading: weeks 1 to 4 played, week 5 now, 8 the last regular week, playoffs 9 and 10 ---------- */

export function seasonModel(): Model {
  const P = (pid: string, pos: 'QB' | 'WR', mu: number, owner: number): HandPlayer => ({ pid, pos, mu, owner, name: pid.toUpperCase() });
  const players: HandPlayer[] = [
    P('q1', 'QB', 15, 1), P('x', 'WR', 20, 1), P('q2', 'QB', 15, 2), P('y', 'WR', 10, 2),
    P('q3', 'QB', 15, 3), P('m', 'WR', 12, 3), P('q4', 'QB', 15, 4), P('n', 'WR', 12, 4),
  ];
  const m = handModel({ slots: ['QB', 'WR'], cur: 5, last: 8, teams: [{ rid: 1, name: 'Aces' }, { rid: 2, name: 'Bees' }, { rid: 3, name: 'Cats' }, { rid: 4, name: 'Dogs' }], players });
  const pts = (pid: string, by: Record<number, number | null>) => { m.players.find((p) => p.pid === pid)!.pts = by; };
  pts('x', { 1: 5, 2: 6, 3: 18, 4: 22 }); pts('y', { 1: 4, 2: 5, 3: 9, 4: 11 });
  pts('m', { 3: 12, 4: 12 }); pts('n', { 3: 12, 4: 12 });
  for (const q of ['q1', 'q2', 'q3', 'q4']) pts(q, { 1: 15, 2: 15, 3: 15, 4: 15 });
  return m;
}

export const bigTrade: RealTrade = { id: 'big', week: 3, at: 1, teams: [{ rid: 1, got: ['x'], sent: ['y'], picksGot: [], picksSent: [], faab: 0 }, { rid: 2, got: ['y'], sent: ['x'], picksGot: [], picksSent: [], faab: 0 }] };
export const evenTrade: RealTrade = { id: 'even', week: 4, at: 2, teams: [{ rid: 3, got: ['m'], sent: ['n'], picksGot: [], picksSent: [], faab: 0 }, { rid: 4, got: ['n'], sent: ['m'], picksGot: [], picksSent: [], faab: 0 }] };

