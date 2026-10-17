/* Which weeks and positions a full league pull covers. Mirrors load() in reference/sleeper_live.js
   exactly (same week ranges), so the fixture capture and the reference-engine regression test line up. */
import type { NflState, SleeperLeague } from './contract.ts';
import { positionsFor } from './urls.ts';

export interface PullPlan {
  season: string;
  /** the week the model treats as "now" (1..18) */
  cur: number;
  lastReg: number;
  playoffWeeks: number[];
  maxWeek: number;
  positions: string[];
  /** up to 4 completed weeks before cur, used to calibrate floors/ceilings */
  calWeeks: number[];
  /** cur .. last playoff week */
  projWeeks: number[];
  matchWeeks: number[];
  statWeeks: number[];
  /** weeks whose transactions are final */
  completedWeeks: number[];
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

export function planPull(state: NflState, league: SleeperLeague): PullPlan {
  const S = league.settings ?? {};
  const season = state.league_season || state.season;
  const poStart = S.playoff_week_start || 15;
  const curRaw = state.season_type === 'regular' ? state.week : state.season_type === 'pre' ? 1 : poStart;
  const lastReg = poStart - 1;
  const cur = Math.max(1, Math.min(Number(curRaw), 18));
  const P = S.playoff_teams || 6;
  const rounds = Math.ceil(Math.log2(Math.max(2, P)));
  const playoffWeeks = range(lastReg + 1, Math.min(18, lastReg + rounds));
  const maxWeek = Math.max(cur, playoffWeeks.length ? playoffWeeks[playoffWeeks.length - 1] : 17);
  const completedWeeks = state.season_type === 'regular' ? range(1, cur - 1) : state.season_type === 'pre' ? [] : range(1, lastReg);
  return {
    season, cur, lastReg, playoffWeeks, maxWeek,
    positions: positionsFor(league.roster_positions),
    calWeeks: range(Math.max(1, cur - 4), cur - 1),
    projWeeks: range(cur, maxWeek),
    matchWeeks: range(1, Math.max(lastReg, cur)),
    statWeeks: range(1, cur),
    completedWeeks,
  };
}
