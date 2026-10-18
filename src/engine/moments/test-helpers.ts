/* Fixtures for the moments tests: a league week in October 2026 in Central time, and a context builder with sensible defaults. */
import { zonedToMs } from './time.ts';
import type { Kickoff, MomentCtx, MomentModel, StarterInfo } from './types.ts';

export const TZ = 'America/Chicago';

/** '2026-10-20T20:00' in the test zone (Central daylight time) → epoch ms. */
export function at(s: string, tz = TZ): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s)!;
  return zonedToMs(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), tz);
}

const game = (id: string, home: string, away: string, when: string, state: Kickoff['state'] = 'pre'): Kickoff => ({ id, home, away, kickoff: at(when), state });

/** Week 7: Thursday night, a Sunday slate (noon and 3:25 pm Central) and Monday night. */
export function week7(state: Partial<Record<string, Kickoff['state']>> = {}): Kickoff[] {
  const s = (id: string): Kickoff['state'] => state[id] ?? 'pre';
  return [
    game('tnf', 'BUF', 'NYJ', '2026-10-22T19:15', s('tnf')),
    game('s1', 'KC', 'DEN', '2026-10-25T12:00', s('s1')),
    game('s2', 'SF', 'LAR', '2026-10-25T12:00', s('s2')),
    game('s3', 'DAL', 'PHI', '2026-10-25T15:25', s('s3')),
    game('mnf', 'CIN', 'PIT', '2026-10-26T19:15', s('mnf')),
  ];
}

export function week8(): Kickoff[] {
  return [game('n1', 'BUF', 'MIA', '2026-10-29T19:15')];
}

export const starters = (): StarterInfo[] => [
  { pid: 'qb', name: 'josh allen', pos: 'QB', nfl: 'BUF', injury: '', played: false },
  { pid: 'rb', name: 'derrick henry', pos: 'RB', nfl: 'BAL', injury: '', played: false },
  { pid: 'wr1', name: 'ceedee lamb', pos: 'WR', nfl: 'DAL', injury: '', played: false },
  { pid: 'wr2', name: 'jaxon smith-njigba', pos: 'WR', nfl: 'SEA', injury: '', played: false },
  { pid: 'te', name: 'travis kelce', pos: 'TE', nfl: 'KC', injury: '', played: false },
  { pid: 'def', name: 'bills d/st', pos: 'DEF', nfl: 'BUF', injury: '', played: false },
];

export function model(o: Partial<MomentModel> = {}): MomentModel {
  return {
    week: 7, lastRegularWeek: 14, teamName: 'icemen', record: { w: 4, l: 2, t: 0 },
    matchup: { oppName: 'killa k im gay', mine: 112.4, theirs: 118.9, p: 0.36 },
    starters: starters(), lineup: { best: 112.4, swaps: [] }, injuries: [],
    waiver: { top: { pid: 'km', name: 'kyler murray', pos: 'QB', gain: 19, bid: 76, dropName: 'bench qb' }, faab: true },
    playoffPct: 0.74, magic: { spot: 3, open: 7, winOut: false, clinched: false, eliminated: false }, titlePct: 0.09, losers: null,
    lastResult: null, trade: null,
    ...o,
  };
}

/** A context at `when` (in the test zone). Everything not given is the in-season default: week 7 on the calendar, the model above. */
export function ctx(when: string, o: Partial<MomentCtx> = {}): MomentCtx {
  return {
    now: new Date(at(when)), tz: TZ, phase: 'in_season',
    nflState: { week: 7, season: '2026', season_type: 'regular' },
    settings: { waiverDayOfWeek: 2, waiverType: 2, dailyWaivers: 0, waiverClearDays: 2, tradeDeadline: 11, playoffWeekStart: 15 },
    schedule: { games: week7(), nextGames: week8() },
    draft: null, model: model(), takes: [], live: null, offseason: null, previous: null, prep: null, lastSeason: null,
    ...o,
  };
}
