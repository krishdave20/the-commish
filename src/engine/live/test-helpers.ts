/* Hand-built game day data for tests: a 4-team league, 3 slots (QB, RB, WR), one NFL game per roster pair. */
import type { Slot } from '../types.ts';
import type { LiveCtx, LiveRow, LiveSnapshot, NflGame, PlayerMeta } from './types.ts';

export function game(o: Partial<NflGame> & { home: string; away: string }): NflGame {
  const state = o.state ?? 'pre';
  return {
    id: `${o.away}@${o.home}`, kickoff: 1_000_000, state, quarter: state === 'final' ? 'F' : '', clock: '',
    homeScore: null, awayScore: null, elapsed: state === 'final' ? 1 : 0, ...o,
  };
}

export function row(rid: number, matchupId: number, pts: Record<string, number>, starters: string[], extra: string[] = []): LiveRow {
  const all = [...starters, ...extra];
  const pp: Record<string, number> = {};
  for (const p of all) pp[p] = pts[p] ?? 0;
  const startersPoints = starters.map((p) => pp[p]!);
  return { rid, matchupId, points: Math.round(startersPoints.reduce((s, x) => s + x, 0) * 100) / 100, starters, startersPoints, players: all, playersPoints: pp };
}

const P = (pid: string, name: string, pos: string, nfl: string): [string, PlayerMeta] => [pid, { pid, name, pos, nfl }];

export function ctx(over: Partial<LiveCtx> = {}): LiveCtx {
  return {
    week: 6, meRid: 1, sd: 20, slots: ['QB', 'RB', 'WR'] as Slot[],
    teams: { 1: { name: 'icemen', manager: 'Sam' }, 2: { name: 'killa k', manager: 'Kay' }, 3: { name: 'third and long', manager: 'Tay' }, 4: { name: 'hail mary', manager: 'Mo' } },
    mu: { q1: 20, r1: 15, w1: 12, q2: 19, r2: 14, w2: 13, q3: 17, r3: 13, w3: 10, q4: 15, r4: 10, w4: 8, b1: 6, b3: 9 },
    players: Object.fromEntries([
      P('q1', 'Alex Arm', 'QB', 'AAA'), P('r1', 'Rex Runner', 'RB', 'BBB'), P('w1', 'Walt Wideout', 'WR', 'CCC'),
      P('q2', 'Quinn Quarterback', 'QB', 'DDD'), P('r2', 'Ray Rusher', 'RB', 'EEE'), P('w2', 'Reed Receiver', 'WR', 'FFF'),
      P('q3', 'Tom Thrower', 'QB', 'GGG'), P('r3', 'Rob Rusher', 'RB', 'HHH'), P('w3', 'Will Winger', 'WR', 'III'),
      P('q4', 'Ted Tosser', 'QB', 'JJJ'), P('r4', 'Rick Runner', 'RB', 'KKK'), P('w4', 'Wade Wideout', 'WR', 'LLL'),
      P('b1', 'Backup Wideout', 'WR', 'CCC'), P('b3', 'Bench Burner', 'WR', 'III'),
    ]),
    ...over,
  };
}

/** AAA@BBB etc: every NFL team plays in one game with its neighbour. */
export function games(state: NflGame['state'], elapsed?: number): NflGame[] {
  const pairs: Array<[string, string]> = [['AAA', 'BBB'], ['CCC', 'DDD'], ['EEE', 'FFF'], ['GGG', 'HHH'], ['III', 'JJJ'], ['KKK', 'LLL']];
  return pairs.map(([home, away], i) => game({ home, away, state, kickoff: 1_000_000 + i * 1000, elapsed: state === 'live' ? elapsed ?? 0.5 : state === 'final' ? 1 : 0, quarter: state === 'live' ? '3' : state === 'final' ? 'F' : '', clock: state === 'live' ? '7:30' : '' }));
}

export function snapshot(pts: Record<string, number>, gs: NflGame[], over: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    week: 6, at: 5_000_000, clock: 5_000_000, kind: 'live', gamesKnown: true, games: gs,
    rows: [
      row(1, 1, pts, ['q1', 'r1', 'w1'], ['b1']),
      row(2, 1, pts, ['q2', 'r2', 'w2']),
      row(3, 2, pts, ['q3', 'r3', 'w3'], ['b3']),
      row(4, 2, pts, ['q4', 'r4', 'w4']),
    ],
    ...over,
  };
}
