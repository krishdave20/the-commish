/* Turns an Aggregate into the columnar files the browser reads, keyed by Sleeper player_id. */
import {
  COVERAGE_COLS, SEASON_COLS, TEAM_COLS, WEEKLY_COLS,
  type CoverageFile, type CoverageRow, type CoverageTeam, type CoverageTuple, type SeasonFile, type TeamsFile, type WeeklyCell, type WeeklyFile,
} from '../../src/data/nflverseTypes.ts';
import { targetsPerRouteRun, yardsPerRouteRun } from '../../src/stats/index.ts';
import {
  addCounts, addDen, countsOut, rate, ratesOf, sharesOf, zeroCounts, zeroDen, type Aggregate, type Counts, type Den, type TeamAcc,
} from './aggregate.ts';
import type { CoverageAgg } from './coverage.ts';

export interface TableOpts {
  season: number;
  generatedAt: string;
  /** entity key -> Sleeper player_id for every joined player */
  sleeperOf: Map<string, string>;
  hasModel: boolean;
}

const denOf = (t: TeamAcc | undefined): Den => (t ? t : zeroDen());
const cells = (cols: readonly string[], o: Record<string, unknown>): WeeklyCell[] => cols.map((c) => (o[c] as WeeklyCell | undefined) ?? null);

export function buildWeekly(agg: Aggregate, o: TableOpts): WeeklyFile {
  const teams = new Map(agg.teams.map((t) => [`${t.team}|${t.week}`, t]));
  const rows: Array<{ pid: string; week: number; cells: WeeklyCell[] }> = [];
  for (const a of agg.weeks) {
    const pid = o.sleeperOf.get(a.key);
    if (!pid) continue;
    const den = denOf(teams.get(`${a.team}|${a.week}`));
    const rec = { pid, week: a.week, team: a.team, opp: a.opp, ...countsOut(a.c, o.hasModel), ...sharesOf(a.c, den) };
    rows.push({ pid, week: a.week, cells: cells(WEEKLY_COLS, rec) });
  }
  rows.sort((x, y) => (x.pid < y.pid ? -1 : x.pid > y.pid ? 1 : x.week - y.week));
  return { schema: 1, season: o.season, generatedAt: o.generatedAt, cols: [...WEEKLY_COLS], rows: rows.map((r) => r.cells) };
}

/** Season to date. Counts are summed over the player's weeks; each share divides by the team totals of those same weeks. */
export function buildSeason(agg: Aggregate, o: TableOpts): SeasonFile {
  const teams = new Map(agg.teams.map((t) => [`${t.team}|${t.week}`, t]));
  const by = new Map<string, { pid: string; team: string; lastWeek: number; games: number; c: Counts; den: Den }>();
  for (const a of agg.weeks) {
    const pid = o.sleeperOf.get(a.key);
    if (!pid) continue;
    let s = by.get(pid);
    if (!s) { s = { pid, team: a.team, lastWeek: 0, games: 0, c: zeroCounts(), den: zeroDen() }; by.set(pid, s); }
    s.games++;
    addCounts(s.c, a.c);
    addDen(s.den, denOf(teams.get(`${a.team}|${a.week}`)));
    if (a.week >= s.lastWeek) { s.lastWeek = a.week; s.team = a.team; }
  }
  const rows = [...by.values()].sort((a, b) => (a.pid < b.pid ? -1 : 1)).map((s) => {
    const rec = { pid: s.pid, team: s.team, games: s.games, ...countsOut(s.c, o.hasModel), ...sharesOf(s.c, s.den), ...ratesOf(s.c, o.hasModel) };
    return cells(SEASON_COLS, rec);
  });
  return { schema: 1, season: o.season, generatedAt: o.generatedAt, throughWeek: agg.throughWeek, cols: [...SEASON_COLS], rows };
}

export function buildTeams(agg: Aggregate, o: { season: number; generatedAt: string; hasManZone: boolean }): TeamsFile {
  const rows = [...agg.teams]
    .sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : a.week - b.week))
    .map((t) => cells(TEAM_COLS, {
      team: t.team, week: t.week, opp: t.opp, off_snaps: t.off_snaps, pass_att: t.pass_att, rush_att: t.rush_att, air_yds: t.air_yds,
      rz_pass_att: t.rz_pass_att, i10_pass_att: t.i10_pass_att, rz_rush_att: t.rz_rush_att, i10_rush_att: t.i10_rush_att, dropbacks: t.dropbacks,
      def_db: t.def_db, def_blitz: t.def_blitz, def_blitz_rate: rate(t.def_blitz, t.def_db),
      def_box_car: t.def_box_car, def_light_car: t.def_light_car, def_light_rate: rate(t.def_light_car, t.def_box_car),
      def_stk_car: t.def_stk_car, def_stk_rate: rate(t.def_stk_car, t.def_box_car),
      def_mz_db: o.hasManZone ? t.def_mz_db : null, def_man: o.hasManZone ? t.def_man : null,
      def_man_rate: o.hasManZone ? rate(t.def_man, t.def_mz_db) : null,
    }));
  return { schema: 1, season: o.season, generatedAt: o.generatedAt, hasManZone: o.hasManZone, cols: [...TEAM_COLS], rows };
}

export function buildCoverage(cov: CoverageAgg, o: { season: number; generatedAt: string; isCurrent: boolean; routesDefinition: string; sleeperOf: Map<string, string> }): CoverageFile {
  const rows: Array<{ pid: string; cells: WeeklyCell[] }> = [];
  const shells: CoverageFile['shells'] = {};
  for (const [key, p] of cov.players) {
    const pid = o.sleeperOf.get(key);
    if (!pid || !p.total.routes) continue;
    const r: CoverageRow = {
      pid, team: p.team,
      routes: p.total.routes, tgt: p.total.tgt, rec: p.total.rec, yds: p.total.yds, td: p.total.td,
      man_routes: p.man.routes, man_tgt: p.man.tgt, man_rec: p.man.rec, man_yds: p.man.yds, man_td: p.man.td,
      zone_routes: p.zone.routes, zone_tgt: p.zone.tgt, zone_rec: p.zone.rec, zone_yds: p.zone.yds, zone_td: p.zone.td,
      yprr: yardsPerRouteRun(p.total.yds, p.total.routes), tprr: targetsPerRouteRun(p.total.tgt, p.total.routes),
      yprr_man: yardsPerRouteRun(p.man.yds, p.man.routes), tprr_man: targetsPerRouteRun(p.man.tgt, p.man.routes),
      yprr_zone: yardsPerRouteRun(p.zone.yds, p.zone.routes), tprr_zone: targetsPerRouteRun(p.zone.tgt, p.zone.routes),
    };
    rows.push({ pid, cells: cells(COVERAGE_COLS, r as unknown as Record<string, unknown>) });
    const sh: Record<string, CoverageTuple> = {};
    for (const [name, s] of p.shells) if (s.routes) sh[name] = [s.routes, s.tgt, s.rec, s.yds, s.td];
    if (Object.keys(sh).length) shells[pid] = sh;
  }
  rows.sort((a, b) => (a.pid < b.pid ? -1 : 1));
  const teams: Record<string, CoverageTeam> = {};
  for (const [t, v] of [...cov.teams].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    teams[t] = { dropbacks: v.man + v.zone, man: v.man, zone: v.zone, man_rate: rate(v.man, v.man + v.zone), shells: Object.fromEntries([...v.shells].sort()) };
  }
  return {
    schema: 1, season: o.season, generatedAt: o.generatedAt, isCurrent: o.isCurrent, routesDefinition: o.routesDefinition,
    cols: [...COVERAGE_COLS], rows: rows.map((r) => r.cells), shells, teams,
  };
}

