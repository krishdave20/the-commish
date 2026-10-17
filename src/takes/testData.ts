/* Hand-built inputs for the takes tests. Not shipped code: only *.test.ts files import it.
   World: one team 'AAA' (the player's), one opponent 'BBB'. NFL weeks 1..5 are finished (team rows exist for both),
   the current week is 6, and every player's schedule from week 6 is BBB unless a test says otherwise. */
import type { CoverageRow, CoverageTeam, NflverseManifest, PlayerSeason, PlayerWeek, TeamWeek } from '../data/nflverseTypes.ts';
import type { FcEntry } from '../engine/draft/fantasycalc.ts';
import { handModel, type HandPlayer, type HandTeam } from '../engine/test-helpers.ts';
import type { Pos, Slot } from '../engine/types.ts';
import type { TakeInputs } from './types.ts';

export function weekRow(pid: string, week: number, o: Partial<PlayerWeek> = {}): PlayerWeek {
  const off = o.off_snaps ?? 30, tm = o.tm_snaps ?? 60;
  return {
    pid, week, team: 'AAA', opp: 'BBB', off_snaps: off, tm_snaps: tm,
    tgt: 0, rec: 0, rec_yds: 0, rec_td: 0, air_yds: 0, catchable_tgt: 0, catchable_rec: 0, drops: 0, ftn_tgt: 0, rz_tgt: 0, i10_tgt: 0, ez_tgt: 0,
    car: 0, rush_yds: 0, rush_td: 0, rz_car: 0, i10_car: 0, box_car: 0, stk_car: 0, stk_yds: 0, lgt_car: 0, lgt_yds: 0,
    bl_tgt: 0, bl_rec: 0, bl_yds: 0, nbl_tgt: 0, nbl_rec: 0, nbl_yds: 0, pa_tgt: 0, scr_tgt: 0, cont_tgt: 0, cont_rec: 0, xtd_rec: 0, xtd_rush: 0,
    snap_pct: off / tm, tgt_share: null, ay_share: null, wopr: null, rush_share: null, rz_tgt_share: null, i10_tgt_share: null, rz_car_share: null, i10_car_share: null,
    ...o,
  };
}

export function teamRow(team: string, week: number, o: Partial<TeamWeek> = {}): TeamWeek {
  return {
    team, week, opp: team === 'AAA' ? 'BBB' : 'AAA', off_snaps: 60, pass_att: 40, rush_att: 25, air_yds: 300, rz_pass_att: 6, i10_pass_att: 3, rz_rush_att: 5, i10_rush_att: 3, dropbacks: 44,
    def_db: 40, def_blitz: 10, def_blitz_rate: 0.25, def_box_car: 20, def_light_car: 5, def_light_rate: 0.25, def_stk_car: 4, def_stk_rate: 0.2,
    def_mz_db: null, def_man: null, def_man_rate: null, ...o,
  };
}

export function seasonRow(pid: string, o: Partial<PlayerSeason> = {}): PlayerSeason {
  const w = weekRow(pid, 0);
  const { week: _week, opp: _opp, ...counts } = w;
  return {
    ...counts, team: 'AAA', games: 5,
    adot: null, ypt: null, catch_rate: null, drop_rate: null, ypc: null, ypc_stk: null, ypc_lgt: null, tgt_per_snap: null, ypt_bl: null, ypt_nbl: null,
    pa_share: null, scr_share: null, cont_rate: null, td_gap: null, ...o,
  };
}

export function fcEntry(id: string, o: Partial<FcEntry> = {}): FcEntry {
  return { sleeperId: id, name: `Player ${id}`, position: 'WR', value: 3000, overallRank: 10, positionRank: 5, trend30Day: 0, ...o };
}

const MANIFEST = { schema: 1, generatedAt: '2026-10-17T00:00:00Z', season: 2026, throughWeek: 5, participationSeason: 2025, participationIsCurrent: false } as unknown as NflverseManifest;

export interface WorldPlayer extends Omit<HandPlayer, 'mu' | 'owner'> {
  mu?: number;
  owner?: number;
  /** NFL opponent by week from the current week on (default BBB every week to 17) */
  opp?: Record<number, string>;
  dvp?: Record<number, number | null>;
  pts?: Record<number, number | null>;
}

export interface World {
  players: WorldPlayer[];
  weekly?: PlayerWeek[];
  season?: PlayerSeason[];
  /** replaces the default AAA/BBB rows for the same team + week; others are added */
  teams?: TeamWeek[];
  coverage?: { rows: CoverageRow[]; teams: Record<string, CoverageTeam>; isCurrent: boolean; season: string } | null;
  nflverse?: boolean;
  trending?: Array<{ player_id: string; count: number }>;
  fc?: Record<string, FcEntry> | null;
  isDynasty?: boolean;
  watchlist?: string[];
  tradeTargets?: string[];
  waiverGains?: Record<string, number>;
  slots?: Slot[];
  handTeams?: HandTeam[];
  week?: number;
}

export function makeInputs(w: World): TakeInputs {
  const week = w.week ?? 6;
  const slots: Slot[] = w.slots ?? ['QB', 'RB', 'WR', 'FLEX'];
  const model = handModel({
    cur: week, last: 14, slots, meRid: 1,
    teams: w.handTeams ?? [{ rid: 1, name: 'Mine FC', starters: [] }, { rid: 2, name: 'Rival FC' }],
    players: w.players.map((p) => ({ pid: p.pid, pos: p.pos as Pos, mu: p.mu ?? 12, owner: p.owner ?? 2, name: p.name ?? `Player ${p.pid}`, played: p.played })),
  });
  for (const wp of w.players) {
    const mp = model.players.find((x) => x.pid === wp.pid)!;
    mp.nfl = 'AAA';
    for (let k = week; k <= model.meta.maxWeek; k++) { mp.opp[k] = wp.opp?.[k] ?? 'BBB'; mp.dvp[k] = wp.dvp?.[k] ?? null; }
    if (wp.opp) Object.assign(mp.opp, wp.opp);
    if (wp.pts) mp.pts = { ...wp.pts };
  }
  const teams = new Map<string, TeamWeek>();
  for (let k = 1; k <= week - 1; k++) for (const t of ['AAA', 'BBB']) teams.set(`${t}|${k}`, teamRow(t, k));
  for (const t of w.teams ?? []) teams.set(`${t.team}|${t.week}`, t);
  const has = w.nflverse !== false;
  return {
    season: '2026', week, model,
    nflverse: has ? { manifest: { ...MANIFEST, throughWeek: week - 1 }, weekly: w.weekly ?? [], season: w.season ?? [], teams: [...teams.values()], coverage: w.coverage ?? null } : null,
    trendingAdds: w.trending ?? [], fantasyCalc: w.fc ?? null, isDynasty: !!w.isDynasty, watchlist: w.watchlist ?? [], tradeTargets: w.tradeTargets ?? [],
    ...(w.waiverGains ? { waiverGains: w.waiverGains } : {}),
  };
}

/** Rows for weeks 1..5 for one player, with a per-week override function. */
export function games(pid: string, f: (week: number) => Partial<PlayerWeek> = () => ({}), weeks: number[] = [1, 2, 3, 4, 5]): PlayerWeek[] {
  return weeks.map((k) => weekRow(pid, k, f(k)));
}
