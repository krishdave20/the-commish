/* buildModel: turns a raw LeaguePull into the Model (port of load() in reference/sleeper_live.js).

   Pure: the same pull and user id always give the same Model. Steps, in the reference's order:
     scorer (league settings) → player info from projections → NFL opponents from the schedule →
     calibrated floor/ceiling ratios, residual SD and held-out band coverage on the last ≤4 completed weeks →
     team SD → matchup grades → expected points per player-week (injury multipliers, the IR four-week rule,
     actual points once a game kicked off) → the free-agent pool with position caps → teams with their
     expected lineup points → the 20,000-run season simulation → win-win 1-for-1 trade ideas → meta. */
import { bestTotal } from './lineup.ts';
import { ELIG, IDP_POS, OFFENSE_POS, startingSlots } from './lineup.ts';
import { SIM_RUNS, simulate } from './sim.ts';
import { applyBaseSim, baseSimInput } from './simInput.ts';
import { tradeIdeas } from './trades.ts';
import type { ProjectionRow, StatLine } from '../data/types.ts';
import type {
  ByWeek, HistoryRow, LeaguePull, Model, ModelGame, ModelMeta, ModelPlayer, ModelTeam, Pos,
} from './types.ts';

/** Fallback floor/ceiling ratios (actual ÷ projected, 20th and 80th percentile) when a position has under 25 samples. */
export const FALLBACK_Q: Record<string, [number, number]> = {
  QB: [0.69, 1.46], RB: [0.39, 1.42], WR: [0.38, 1.64], TE: [0.27, 1.58], K: [0.59, 1.69], DEF: [0.3, 1.8], DL: [0.4, 1.6], LB: [0.5, 1.5], DB: [0.4, 1.6],
};
/** Fallback residual SD per position. */
export const FALLBACK_SD: Record<string, number> = { QB: 7.9, RB: 6.2, WR: 6.6, TE: 6.4, K: 5.5, DEF: 6.5, DL: 5, LB: 5, DB: 5 };
/** Current-week multiplier by Sleeper injury status. */
export const INJ_MULT: Record<string, number> = { Out: 0, IR: 0, PUP: 0, Sus: 0, Suspended: 0, NA: 0, Doubtful: 0.3, Questionable: 0.85 };
/** Free-agent pool size per position. */
export const POOL_CAP: Record<string, number> = { QB: 14, RB: 40, WR: 50, TE: 22, K: 10, DEF: 12, DL: 12, LB: 12, DB: 12 };
export const MIN_CAL_SAMPLES = 25;

const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (a: readonly number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sdev = (a: readonly number[]) => {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
};
const quant = (arr: readonly number[], p: number) => {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo]! + (a[hi]! - a[lo]!) * (i - lo);
};

/** Scores a stat line with the league's settings: PPR/half/standard by `rec`, pass-TD points, TE/WR/RB catch bonuses. */
export function makeScorer(sc: Record<string, number>): (st: StatLine | null | undefined) => number {
  const rec = sc.rec == null ? 1 : sc.rec;
  const base = rec >= 0.75 ? 'pts_ppr' : rec >= 0.25 ? 'pts_half_ppr' : 'pts_std';
  const passTd = (sc.pass_td == null ? 4 : sc.pass_td) - 4;
  const bonus = (['bonus_rec_te', 'bonus_rec_wr', 'bonus_rec_rb'] as const).filter((k) => sc[k]).map((k): [string, number] => [k, sc[k]!]);
  return (st) => {
    if (!st) return 0;
    let v = st[base] != null ? st[base]! : (st.pts_ppr || 0);
    if (passTd && st.pass_td) v += passTd * st.pass_td;
    for (const [k, w] of bonus) if (st[k]) v += w * st[k]!;
    return v;
  };
}

interface Info { name: string; pos: string | null; team: string | null; inj: string | null; body: string | null }

export interface BuildOpts {
  userId: string;
  /** Reproduce the reference engine's quirk exactly: a stat line counts as played only when `gms_active` is set.
      Sleeper gives team-defense rows `gp` but no `gms_active`, so with this on a defense never has actual points.
      Default false: a DEF row also counts as played when `gp` > 0. */
  referenceCompat?: boolean;
  /** Run the initial 20,000-run season simulation inside buildModel (default true). With false the teams' odds fields
      are 0 / empty and `model.oddsPending` is true; run `simulate(baseSimInput(model))` (or runSimInWorker) and pass the
      summary to `applyBaseSim(model, summary)`. */
  simulate?: boolean;
}

export function buildModel(pull: LeaguePull, who: BuildOpts): Model {
  const { league, plan, rosters, users, schedule, trending } = pull;
  const S = league.settings ?? {}, sc = league.scoring_settings ?? {};
  const cur = plan.cur, lastReg = plan.lastReg, maxWeek = plan.maxWeek, poWeeks = plan.playoffWeeks;
  const P = S.playoff_teams || 6;
  const slots = startingSlots(league.roster_positions);
  const usesIDP = slots.some((s) => ['DL', 'LB', 'DB', 'IDP_FLEX'].includes(s));
  const POS: Pos[] = usesIDP ? [...OFFENSE_POS, ...IDP_POS] : [...OFFENSE_POS];
  const calWeeks = plan.calWeeks, projWeeks = plan.projWeeks, matchWeeks = plan.matchWeeks;
  const stats = pull.stats;
  const pts = makeScorer(sc);

  /* projections by week: player_id -> row (a plain object, so key order matches the reference) */
  const proj: ByWeek<Record<string, ProjectionRow>> = {};
  for (const w of [...calWeeks, ...projWeeks]) {
    const m: Record<string, ProjectionRow> = {};
    for (const r of pull.projections[w] ?? []) m[r.player_id] = r;
    proj[w] = m;
  }

  /* player info from projections (the latest week that has the player wins) */
  const info: Record<string, Info> = {};
  Object.keys(proj).map(Number).sort((a, b) => b - a).forEach((w) => {
    for (const r of Object.values(proj[w]!)) {
      if (info[r.player_id] || !r.player) continue;
      const pl = r.player, pos = pl.position ?? null;
      info[r.player_id] = {
        name: pos === 'DEF' ? r.player_id + ' D/ST' : ((pl.first_name || '') + ' ' + (pl.last_name || '')).trim() || r.player_id,
        pos, team: pl.team || r.team || null,
        inj: (pl.injury_status as string | null | undefined) || null,
        body: (pl.injury_body_part as string | null | undefined) || null,
      };
    }
  });
  const nameOf = (pid: string): Info => {
    if (info[pid]) return info[pid]!;
    const isDef = /^[A-Z]{2,3}$/.test(pid);
    return { name: isDef ? pid + ' D/ST' : 'Player ' + pid, pos: isDef ? 'DEF' : null, team: isDef ? pid : null, inj: null, body: null };
  };

  /* NFL opponents per week from the schedule */
  const oppOf: Record<number, Record<string, string>> = {};
  for (const g of schedule ?? []) {
    (oppOf[g.week] = oppOf[g.week] || {})[g.home] = g.away;
    oppOf[g.week]![g.away] = g.home;
  }
  const opp = (team: string | null, w: number): string | null => (team && oppOf[w] ? oppOf[w]![team] || null : null);
  /* A stat line counts as played when `gms_active` is set; unless referenceCompat, a team defense (which Sleeper
     reports with `gp` but without `gms_active`) also counts when `gp` > 0. */
  const played = (pid: string, s: StatLine | undefined): boolean =>
    !!s && (!!s.gms_active || (!who.referenceCompat && nameOf(pid).pos === 'DEF' && (s.gp ?? 0) > 0));
  const actual = (w: number, pid: string): number | null => {
    const s = stats[w]?.[pid];
    return s && played(pid, s) ? pts(s) : null;
  };
  const projPts = (w: number, pid: string): number | null => {
    const r = proj[w]?.[pid];
    return r ? pts(r.stats) : null;
  };

  /* calibrate floors/ceilings, residual spread and projection error on completed weeks */
  const ratios: Record<string, Array<{ w: number; r: number }>> = {};
  const resid: Record<string, number[]> = {};
  const misses: number[] = [];
  for (const w of calWeeks) {
    for (const pid of Object.keys(proj[w]!)) {
      const pos = nameOf(pid).pos, pr = projPts(w, pid), y = actual(w, pid);
      if (!pos || pr == null || y == null) continue;
      if (pr > 0.5) { (resid[pos] = resid[pos] || []).push(y - pr); misses.push(Math.abs(y - pr)); }
      if (pr > 3) (ratios[pos] = ratios[pos] || []).push({ w, r: y / pr });
    }
  }
  const RQ: Record<string, [number, number]> = {};
  const fitQ = (arr: number[]): [number, number] => [quant(arr, 0.2), quant(arr, 0.8)];
  const ratioSamples: Record<string, number> = {};
  for (const pos of POS) {
    const a = (ratios[pos] || []).map((x) => x.r);
    ratioSamples[pos] = a.length;
    RQ[pos] = a.length >= MIN_CAL_SAMPLES ? fitQ(a) : FALLBACK_Q[pos]!;
  }
  let coverage: number | null = null;
  if (calWeeks.length >= 2) {
    const lastW = calWeeks[calWeeks.length - 1]!;
    let hit = 0, n = 0;
    for (const pos of POS) {
      const tr = (ratios[pos] || []).filter((x) => x.w !== lastW).map((x) => x.r);
      const te = (ratios[pos] || []).filter((x) => x.w === lastW).map((x) => x.r);
      if (tr.length < MIN_CAL_SAMPLES) continue;
      const [lo, hi] = fitQ(tr);
      for (const r of te) { n++; if (r >= lo && r <= hi) hit++; }
    }
    coverage = n ? hit / n : null;
  }
  const SDP: Record<string, number> = {};
  for (const pos of POS) {
    const s = sdev(resid[pos] || []);
    SDP[pos] = isFinite(s) && (resid[pos] || []).length >= MIN_CAL_SAMPLES ? s : FALLBACK_SD[pos]!;
  }
  const teamSd = Math.sqrt(slots.reduce((s, sl) => {
    const ps = ELIG[sl]!;
    const v = ps.length === 1 ? SDP[ps[0]!]! : SDP.WR || 6.6;
    return s + v * v;
  }, 0)) || 20;

  /* matchup grades: points each defense allows by position, vs league average */
  const allowed: Record<string, number[]> = {};
  for (let w = 1; w < cur; w++) {
    const by: Record<string, number> = {};
    for (const pid of Object.keys(stats[w] || {})) {
      const ni = nameOf(pid), y = actual(w, pid), o = opp(ni.team, w);
      if (y == null || !ni.pos || !o) continue;
      const k = o + '|' + ni.pos;
      by[k] = (by[k] || 0) + y;
    }
    for (const [k, v] of Object.entries(by)) (allowed[k] = allowed[k] || []).push(v);
  }
  const posAvg: Record<string, number> = {};
  for (const pos of POS) {
    const vals = Object.entries(allowed).filter(([k]) => k.endsWith('|' + pos)).map(([, v]) => mean(v));
    posAvg[pos] = mean(vals);
  }
  const dvp = (def: string, pos: string): number | null => {
    const a = allowed[def + '|' + pos];
    return a && posAvg[pos] ? r2(mean(a) / posAvg[pos]!) : null;
  };

  /* who's who */
  const userBy: Record<string, (typeof users)[number]> = {};
  for (const u of users ?? []) userBy[u.user_id] = u;
  const rosterOf: Record<string, { rid: number; ir: boolean }> = {};
  for (const r of rosters ?? []) for (const p of r.players ?? []) rosterOf[p] = { rid: r.roster_id, ir: (r.reserve ?? []).includes(p) };
  const myR = (rosters ?? []).find((r) => r.owner_id === who.userId || (r.co_owners ?? []).includes(who.userId));
  const statsCur = stats[cur] ?? {};
  const playedNow = new Set(Object.keys(statsCur).filter((pid) => played(pid, statsCur[pid])));
  const weeksAll: number[] = [];
  for (let w = cur; w <= maxWeek; w++) weeksAll.push(w);

  /* expected points per player-week (same rules as the offline model) */
  const mu = (pid: string, w: number): number => {
    if (w === cur && playedNow.has(pid)) return actual(cur, pid) || 0;
    const pr = projPts(w, pid);
    if (pr == null) return 0;
    const ni = nameOf(pid), onIR = rosterOf[pid] && rosterOf[pid]!.ir;
    if (w === cur) return Math.max(0, pr * (ni.inj != null && INJ_MULT[ni.inj] != null ? INJ_MULT[ni.inj]! : 1));
    if ((ni.inj === 'IR' || onIR) && w < cur + 4) return 0;
    return Math.max(0, pr);
  };
  const rostered = Object.keys(rosterOf);
  const nextW = Math.min(cur + 1, maxWeek);
  const ros = (pid: string) => weeksAll.reduce((s, w) => s + mu(pid, w), 0);
  const cnt: Record<string, number> = {};
  const pool = Object.keys(proj[nextW] || proj[cur] || {})
    .filter((pid) => !rosterOf[pid] && nameOf(pid).team && POS.includes(nameOf(pid).pos as Pos))
    .map((pid): [string, number] => [pid, ros(pid)])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .filter(([pid]) => { const pos = nameOf(pid).pos!; cnt[pos] = (cnt[pos] || 0) + 1; return cnt[pos]! <= (POOL_CAP[pos] || 10); })
    .map(([pid]) => pid);
  const trendBy: Record<string, number> = {};
  for (const t of trending ?? []) trendBy[t.player_id] = t.count;

  const players: ModelPlayer[] = rostered.concat(pool).map((pid) => {
    const ni = nameOf(pid), ro = rosterOf[pid] || { rid: 0, ir: false };
    const past: Array<number | null> = [];
    for (let w = 1; w <= cur; w++) past.push(actual(w, pid));
    const played = past.slice(0, cur - 1).filter((x): x is number => x != null);
    const playedThisWeek = playedNow.has(pid);
    const row: ModelPlayer = {
      pid, name: ni.name, pos: (ni.pos || 'NA') as Pos, nfl: ni.team, ownerRid: ro.rid, onIr: ro.ir, injury: ni.inj || '', body: ni.body || '',
      seasonAvg: played.length ? r2(mean(played)) : null, adds72h: trendBy[pid] || 0, playedThisWeek,
      pts: {}, mu: {}, lo: {}, hi: {}, opp: {}, dvp: {},
    };
    past.forEach((v, i) => { row.pts[i + 1] = v == null ? null : r2(v); });
    const rq = RQ[ni.pos ?? ''] || [0.5, 1.5];
    for (const w of weeksAll) {
      const m = mu(pid, w), o = opp(ni.team, w);
      row.mu[w] = r2(m);
      row.lo[w] = w === cur && playedThisWeek ? r2(m) : r2(m * rq[0]);
      row.hi[w] = w === cur && playedThisWeek ? r2(m) : r2(m * rq[1]);
      row.opp[w] = o || 'BYE';
      row.dvp[w] = o ? dvp(o, ni.pos ?? '') : null;
    }
    return row;
  }).filter((p) => (p.pos as string) !== 'NA');
  const PB: Record<string, ModelPlayer> = {};
  for (const p of players) PB[p.pid] = p;
  const val = (p: ModelPlayer, w: number) => p.mu[w] || 0;
  const avail = (rid: number, w: number) => players.filter((p) => p.ownerRid === rid && (!p.onIr || w >= cur + 4));

  /* league schedule and results */
  const games: ModelGame[] = [];
  const history: HistoryRow[] = [];
  for (const w of matchWeeks) {
    const by: Record<string, Array<(typeof pull.matchups)[number][number]>> = {};
    for (const m of pull.matchups[w] ?? []) if (m.matchup_id != null) (by[m.matchup_id] = by[m.matchup_id] || []).push(m);
    for (const g of Object.values(by)) {
      if (g.length !== 2) continue;
      const [a, b] = g as [typeof g[number], typeof g[number]];
      if (w >= cur && w <= lastReg) games.push({ id: 'w' + w + '-' + a.roster_id + '-' + b.roster_id, week: w, teamA: a.roster_id, teamB: b.roster_id });
      if (w <= cur) {
        for (const [x, y] of [[a, b], [b, a]] as const) {
          history.push({ key: 'w' + w + '-' + x.roster_id, week: w, rid: x.roster_id, opp: y.roster_id, pts: x.points || 0, oppPts: y.points || 0, final: w < cur });
        }
      }
    }
  }

  /* teams */
  const divNames = league.metadata ?? {};
  const nDiv = S.divisions || 0;
  const curMup: Record<number, (typeof pull.matchups)[number][number]> = {};
  for (const m of pull.matchups[cur] ?? []) curMup[m.roster_id] = m;
  const teams: ModelTeam[] = (rosters ?? []).map((r) => {
    const u = userBy[r.owner_id ?? ''] ?? null, st = r.settings ?? {};
    /* deliberate deviation from the reference (which prefixed "Team "): the manager's name is the team name when no team name is set */
    const name = (u && u.metadata && u.metadata.team_name) || (u && u.display_name) || ('roster ' + r.roster_id);
    const starters = (curMup[r.roster_id] && curMup[r.roster_id]!.starters) || r.starters || [];
    const exp: ByWeek<number> = {};
    for (const w of weeksAll) {
      exp[w] = r2(w === cur ? starters.reduce((s, pid) => s + (PB[pid] ? val(PB[pid]!, cur) : 0), 0) : bestTotal(avail(r.roster_id, w), slots, (p) => val(p, w)));
    }
    return {
      rid: r.roster_id, team: name, manager: (u && u.display_name) || ('roster ' + r.roster_id), ownerId: r.owner_id ?? null,
      division: nDiv ? (divNames['division_' + st.division] || ('Division ' + st.division)) : 'League',
      divId: nDiv ? (st.division || 1) : r.roster_id,
      wins: st.wins || 0, losses: st.losses || 0, ties: st.ties || 0,
      pf: r2((st.fpts || 0) + (st.fpts_decimal || 0) / 100), pa: r2((st.fpts_against || 0) + (st.fpts_against_decimal || 0) / 100),
      faabLeft: (S.waiver_budget || 0) - (st.waiver_budget_used || 0),
      isMe: !!(myR && myR.roster_id === r.roster_id),
      starters: [...starters], livePts: (curMup[r.roster_id] && curMup[r.roster_id]!.points) || 0, exp,
      playoffPct: 0, divWinPct: 0, expWins: 0, winsP10: 0, winsP90: 0, seedPct: [], status: 'Alive',
    };
  });
  if (!teams.some((t) => t.isMe) && teams.length) teams[0]!.isMe = true;
  const meTeam = teams.find((t) => t.isMe);
  const meRid = meTeam ? meTeam.rid : 0;

  const nP = Math.min(P, teams.length);

  const leagueUser = userBy[who.userId];
  const meta: ModelMeta = {
    method: 'projection', leagueId: league.league_id, leagueName: league.name, season: plan.season,
    username: leagueUser?.display_name ?? who.userId, userId: who.userId,
    maeProjection: misses.length ? r2(mean(misses)) : null, bandCoverage: coverage == null ? null : r2(coverage),
    teamWeeklySd: teamSd, simRuns: SIM_RUNS, currentWeek: cur, lastRegularWeek: lastReg, maxWeek,
    playoffWeeks: poWeeks, playoffTeams: nP, divisions: nDiv, waiverBudget: S.waiver_budget || 0, slots,
    scoring: (sc.rec == null ? 1 : sc.rec) + ' per catch', calibrationWeeks: calWeeks,
    floorCeil: RQ, ratioSamples, residualSd: SDP, positions: POS, asOf: pull.asOf, stale: pull.stale,
  };
  const model: Model = { meta, meRid, teams, players, games, history, ideas: [], oddsPending: true };
  model.ideas = tradeIdeas(model, meRid);
  // the initial 20,000-run simulation: run here by default, or later (e.g. in a worker) via baseSimInput + applyBaseSim
  return who.simulate === false ? model : applyBaseSim(model, simulate(baseSimInput(model)));
}
