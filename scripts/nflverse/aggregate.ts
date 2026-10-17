/* Per-player-week and per-team-week aggregation of one season: pbp + FTN + snap counts. Pure: takes parsed
   rows, returns plain objects. Keyed by nflverse entity (gsis_id, or `pfr:<id>` for players only snap counts
   know); `tables.ts` re-keys to Sleeper ids once the ID join has run. The formulas themselves live in src/stats. */
import { snapKey } from '../../src/data/ids.ts';
import { COUNT_KEYS, type PlayerCounts, type PlayerRates, type PlayerShares } from '../../src/data/nflverseTypes.ts';
import {
  adot, airYardsShare, boxBucket, catchRate, contestedCatchRate, dropRate, isEndZoneTarget, isInside10, isRedZone, rushShare, share, snapShare,
  targetShare, targetsPerSnap, wopr, yardsPerCarry, yardsPerTarget, xtdProbability, tdGap, round, ratio, type XtdModel,
} from '../../src/stats/index.ts';
import { ftnKey, isDropback, isPassAttempt, isRun, isTarget, type Ftn, type Play, type SnapRow } from './rows.ts';

export type CountKey = (typeof COUNT_KEYS)[number];
/** All counts as plain numbers while accumulating (the xtd fields become null at output when there is no model). */
export type Counts = Record<CountKey, number>;
export const zeroCounts = (): Counts => Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])) as Counts;

export interface Entity {
  key: string;
  gsis: string | null;
  pfr: string | null;
  name: string | null;
  pos: string | null;
  /** team in the most recent week seen */
  team: string | null;
  lastWeek: number;
}

export interface PlayerWeekAcc { key: string; week: number; team: string; opp: string | null; c: Counts }

export interface TeamAcc {
  team: string;
  week: number;
  opp: string | null;
  off_snaps: number;
  pass_att: number;
  rush_att: number;
  air_yds: number;
  rz_pass_att: number;
  i10_pass_att: number;
  rz_rush_att: number;
  i10_rush_att: number;
  dropbacks: number;
  def_db: number;
  def_blitz: number;
  def_box_car: number;
  def_light_car: number;
  def_stk_car: number;
  def_mz_db: number;
  def_man: number;
}

export interface AggInput {
  plays: Play[];
  ftn: Map<string, Ftn>;
  snaps: SnapRow[];
  pfrToGsis: Map<string, string>;
  xtd: XtdModel | null;
  /** play key (gameId|playId) -> true when the defense was in man coverage. Only when participation exists for this season. */
  manZone?: Map<string, boolean> | null;
}

export interface Aggregate {
  entities: Map<string, Entity>;
  weeks: PlayerWeekAcc[];
  teams: TeamAcc[];
  throughWeek: number;
  /** pass dropbacks and runs that found their FTN row / all of them */
  ftnJoined: number;
  ftnExpected: number;
}

const newTeam = (team: string, week: number): TeamAcc => ({
  team, week, opp: null, off_snaps: 0, pass_att: 0, rush_att: 0, air_yds: 0, rz_pass_att: 0, i10_pass_att: 0, rz_rush_att: 0, i10_rush_att: 0, dropbacks: 0,
  def_db: 0, def_blitz: 0, def_box_car: 0, def_light_car: 0, def_stk_car: 0, def_mz_db: 0, def_man: 0,
});

export function aggregate(inp: AggInput): Aggregate {
  const { xtd } = inp;
  const entities = new Map<string, Entity>();
  const pw = new Map<string, PlayerWeekAcc>();
  const tw = new Map<string, TeamAcc>();
  let throughWeek = 0;
  let ftnJoined = 0;
  let ftnExpected = 0;

  const team = (t: string, week: number) => {
    const k = `${t}|${week}`;
    let a = tw.get(k);
    if (!a) { a = newTeam(t, week); tw.set(k, a); }
    return a;
  };
  const entity = (key: string, init: Partial<Entity>, week: number, t: string | null) => {
    let e = entities.get(key);
    if (!e) {
      e = { key, gsis: key.startsWith('pfr:') ? null : key, pfr: null, name: null, pos: null, team: null, lastWeek: 0 };
      entities.set(key, e);
    }
    if (init.pfr) e.pfr = init.pfr;
    if (init.name) e.name = init.name;
    if (init.pos) e.pos = init.pos;
    if (t && week >= e.lastWeek) { e.team = t; e.lastWeek = week; }
    return e;
  };
  const acc = (key: string, week: number, t: string, opp: string | null): PlayerWeekAcc => {
    const k = `${key}|${week}`;
    let a = pw.get(k);
    if (!a) { a = { key, week, team: t, opp, c: zeroCounts() }; pw.set(k, a); }
    return a;
  };

  for (const p of inp.plays) {
    throughWeek = Math.max(throughWeek, p.week);
    const off = team(p.team, p.week);
    if (p.opp) off.opp = p.opp;
    const def = p.opp ? team(p.opp, p.week) : null;
    if (def) def.opp = p.team;
    const f = inp.ftn.get(ftnKey(p.gameId, p.playId));
    const pass = isPassAttempt(p);
    const run = isRun(p);
    const db = isDropback(p);
    if (db || run) { ftnExpected++; if (f) ftnJoined++; }

    if (pass) {
      off.pass_att++;
      off.air_yds += p.air ?? 0;
      if (isRedZone(p.yl)) off.rz_pass_att++;
      if (isInside10(p.yl)) off.i10_pass_att++;
    }
    if (run) {
      off.rush_att++;
      if (isRedZone(p.yl)) off.rz_rush_att++;
      if (isInside10(p.yl)) off.i10_rush_att++;
    }
    if (db) {
      off.dropbacks++;
      if (def) {
        // blitz counts need the charted rusher count: FTN writes 0 for both when it did not chart the play
        if (f && f.rushers > 0) { def.def_db++; if (f.blitzers >= 1) def.def_blitz++; }
        const man = inp.manZone?.get(`${p.gameId}|${p.playId}`);
        if (man !== undefined) { def.def_mz_db++; if (man) def.def_man++; }
      }
    }
    if (run && def && f) {
      const b = boxBucket(f.box);
      if (b !== 'unknown') {
        def.def_box_car++;
        if (b === 'light') def.def_light_car++;
        if (b === 'stacked') def.def_stk_car++;
      }
    }

    if (isTarget(p)) {
      const e = entity(p.receiver!, {}, p.week, p.team);
      const c = acc(e.key, p.week, p.team, p.opp).c;
      c.tgt++;
      c.air_yds += p.air ?? 0;
      if (isRedZone(p.yl)) c.rz_tgt++;
      if (isInside10(p.yl)) c.i10_tgt++;
      if (isEndZoneTarget(p.yl, p.air)) c.ez_tgt++;
      if (p.complete) { c.rec++; c.rec_yds += p.recYds; }
      if (p.passTd && p.complete) c.rec_td++;
      if (xtd) c.xtd_rec += xtdProbability(xtd, 'pass', p.yl) ?? 0;
      if (f) {
        c.ftn_tgt++;
        if (f.catchable) { c.catchable_tgt++; if (p.complete) c.catchable_rec++; }
        if (f.drop) c.drops++;
        if (f.playAction) c.pa_tgt++;
        if (f.screen) c.scr_tgt++;
        if (f.contested) { c.cont_tgt++; if (p.complete) c.cont_rec++; }
        if (f.rushers > 0) {
          if (f.blitzers >= 1) { c.bl_tgt++; if (p.complete) { c.bl_rec++; c.bl_yds += p.recYds; } }
          else { c.nbl_tgt++; if (p.complete) { c.nbl_rec++; c.nbl_yds += p.recYds; } }
        }
      }
    }
    if (run && p.rusher) {
      const e = entity(p.rusher, {}, p.week, p.team);
      const c = acc(e.key, p.week, p.team, p.opp).c;
      c.car++;
      c.rush_yds += p.rushYds;
      if (p.rushTd) c.rush_td++;
      if (isRedZone(p.yl)) c.rz_car++;
      if (isInside10(p.yl)) c.i10_car++;
      if (xtd) c.xtd_rush += xtdProbability(xtd, 'rush', p.yl) ?? 0;
      if (f) {
        const b = boxBucket(f.box);
        if (b !== 'unknown') {
          c.box_car++;
          if (b === 'stacked') { c.stk_car++; c.stk_yds += p.rushYds; }
          if (b === 'light') { c.lgt_car++; c.lgt_yds += p.rushYds; }
        }
      }
    }
  }

  /* snaps. Team offensive snaps = the most snaps any player had that game. */
  for (const s of inp.snaps) {
    if (s.snaps <= 0) continue;
    const t = team(s.team, s.week);
    if (s.opp && !t.opp) t.opp = s.opp;
    t.off_snaps = Math.max(t.off_snaps, s.snaps);
    throughWeek = Math.max(throughWeek, s.week);
  }
  for (const s of inp.snaps) {
    if (s.snaps <= 0) continue;
    const key = snapKey(s.pfr, inp.pfrToGsis);
    entity(key, { pfr: s.pfr, name: s.name, pos: s.pos }, s.week, s.team);
    const a = acc(key, s.week, s.team, s.opp);
    a.team = s.team;
    a.c.off_snaps += s.snaps;
  }

  const weeks = [...pw.values()].filter((a) => a.c.off_snaps > 0 || a.c.tgt > 0 || a.c.car > 0);
  for (const a of weeks) a.c.tm_snaps = tw.get(`${a.team}|${a.week}`)?.off_snaps ?? 0;
  return { entities, weeks, teams: [...tw.values()], throughWeek, ftnJoined, ftnExpected };
}

/* ---------- derived columns ---------- */

/** Team denominators of the shares, for one week or summed over several. */
export type Den = Pick<TeamAcc, 'pass_att' | 'rush_att' | 'air_yds' | 'rz_pass_att' | 'i10_pass_att' | 'rz_rush_att' | 'i10_rush_att'>;
export const zeroDen = (): Den => ({ pass_att: 0, rush_att: 0, air_yds: 0, rz_pass_att: 0, i10_pass_att: 0, rz_rush_att: 0, i10_rush_att: 0 });
export function addDen(into: Den, t: Den): Den {
  for (const k of Object.keys(into) as Array<keyof Den>) into[k] += t[k];
  return into;
}

export function sharesOf(c: Counts, d: Den): PlayerShares {
  return {
    snap_pct: snapShare(c.off_snaps, c.tm_snaps),
    tgt_share: targetShare(c.tgt, d.pass_att),
    ay_share: airYardsShare(c.air_yds, d.air_yds),
    // from unrounded shares, so WOPR does not inherit two roundings
    wopr: wopr(ratio(c.tgt, d.pass_att, 6), ratio(c.air_yds, d.air_yds, 6)),
    rush_share: rushShare(c.car, d.rush_att),
    rz_tgt_share: share(c.rz_tgt, d.rz_pass_att),
    i10_tgt_share: share(c.i10_tgt, d.i10_pass_att),
    rz_car_share: share(c.rz_car, d.rz_rush_att),
    i10_car_share: share(c.i10_car, d.i10_rush_att),
  };
}

export function ratesOf(c: Counts, hasModel: boolean): PlayerRates {
  return {
    adot: adot(c.air_yds, c.tgt),
    ypt: yardsPerTarget(c.rec_yds, c.tgt),
    catch_rate: catchRate(c.catchable_rec, c.catchable_tgt),
    drop_rate: dropRate(c.drops, c.catchable_tgt),
    ypc: yardsPerCarry(c.rush_yds, c.car),
    ypc_stk: yardsPerCarry(c.stk_yds, c.stk_car),
    ypc_lgt: yardsPerCarry(c.lgt_yds, c.lgt_car),
    tgt_per_snap: targetsPerSnap(c.tgt, c.off_snaps),
    ypt_bl: yardsPerTarget(c.bl_yds, c.bl_tgt),
    ypt_nbl: yardsPerTarget(c.nbl_yds, c.nbl_tgt),
    pa_share: share(c.pa_tgt, c.ftn_tgt),
    scr_share: share(c.scr_tgt, c.ftn_tgt),
    cont_rate: contestedCatchRate(c.cont_rec, c.cont_tgt),
    td_gap: hasModel ? tdGap(c.rec_td + c.rush_td, c.xtd_rec + c.xtd_rush) : null,
  };
}

/** Counts as written to JSON: xTD rounded, or null when there is no model. */
export function countsOut(c: Counts, hasModel: boolean): PlayerCounts {
  return { ...c, xtd_rec: hasModel ? round(c.xtd_rec, 2) : null, xtd_rush: hasModel ? round(c.xtd_rush, 2) : null };
}

export function addCounts(into: Counts, c: Counts): Counts {
  for (const k of COUNT_KEYS) into[k] += c[k];
  return into;
}

/** Rate helpers the team table uses. */
export const rate = (n: number, d: number) => ratio(n, d);

/** Re-keys weeks of aliased entities (see nvPlayers) onto their canonical entity, summing weeks that now collide. */
export function applyAliases(agg: Aggregate, aliases: Map<string, string>): Aggregate {
  if (!aliases.size) return agg;
  const merged = new Map<string, PlayerWeekAcc>();
  for (const w of agg.weeks) {
    const key = aliases.get(w.key) ?? w.key;
    const k = `${key}|${w.week}`;
    const prev = merged.get(k);
    if (!prev) { merged.set(k, { ...w, key, c: { ...w.c } }); continue; }
    const tm = Math.max(prev.c.tm_snaps, w.c.tm_snaps);
    addCounts(prev.c, w.c);
    prev.c.tm_snaps = tm;
    if (w.c.off_snaps > 0) prev.team = w.team;
  }
  const entities = new Map(agg.entities);
  for (const [from, to] of aliases) {
    const f = entities.get(from);
    const t = entities.get(to);
    if (f && t) entities.set(to, { ...t, pfr: f.pfr ?? t.pfr, name: t.name ?? f.name, pos: f.pos ?? t.pos, team: f.team ?? t.team });
    entities.delete(from);
  }
  return { ...agg, weeks: [...merged.values()], entities };
}
