/* NFL league leaders and a game's box-score leaders from Sleeper's weekly stat lines. Pure.

   Source: GET /v1/stats/nfl/regular/{season}/{week} (checked Oct 18, 2026): player id -> stat line, plus `TEAM_xxx` rows (team totals, which are
   not players and are ignored here) and one row per team defense (id "KC"). Keys read: pass_cmp, pass_att, pass_yd, pass_td, pass_int; rush_att,
   rush_yd, rush_td; rec_tgt, rec, rec_yd, rec_td; idp_tkl (tackles), idp_sack, idp_int, idp_ff (forced fumbles), idp_pass_def. A player played a week
   when his row has `gp` or `gms_active` above zero. Sleeper's defensive keys are `idp_*`, not `def_*`. */
import type { StatLine, WeekStats } from '../../data/types.ts';

/** The keys the leaders read; a week of stats can be reduced to these before it is kept. */
export const TRACKED_KEYS = [
  'pass_cmp', 'pass_att', 'pass_yd', 'pass_td', 'pass_int',
  'rush_att', 'rush_yd', 'rush_td',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td',
  'idp_tkl', 'idp_sack', 'idp_int', 'idp_ff', 'idp_pass_def',
  'gp', 'gms_active',
] as const;

/** A week of stats cut down to real players (team rows dropped) and the tracked keys. */
export function compactWeek(stats: WeekStats): WeekStats {
  const out: WeekStats = {};
  for (const [pid, line] of Object.entries(stats)) {
    if (pid.startsWith('TEAM_')) continue;
    const keep: StatLine = {};
    for (const k of TRACKED_KEYS) if (typeof line[k] === 'number') keep[k] = line[k]!;
    if (Object.keys(keep).length) out[pid] = keep;
  }
  return out;
}

export interface WeekOfStats { week: number; stats: WeekStats }

export interface Totals {
  games: number;
  /** summed stat keys */
  sum: Record<string, number>;
}

const played = (l: StatLine) => (l.gp ?? 0) > 0 || (l.gms_active ?? 0) > 0;

/** Sum the tracked stats over the given weeks. Games counts the weeks a player played. */
export function aggregateStats(weeks: readonly WeekOfStats[]): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const { stats } of weeks) {
    for (const [pid, line] of Object.entries(stats)) {
      if (pid.startsWith('TEAM_')) continue;
      let t = out.get(pid);
      if (!t) { t = { games: 0, sum: {} }; out.set(pid, t); }
      if (played(line)) t.games++;
      for (const k of TRACKED_KEYS) {
        const v = line[k];
        if (k !== 'gp' && k !== 'gms_active' && typeof v === 'number') t.sum[k] = (t.sum[k] ?? 0) + v;
      }
    }
  }
  return out;
}

/* ---------- categories ---------- */

export type CategoryId = 'passing' | 'rushing' | 'receiving' | 'defense';

export interface StatCol {
  key: string;
  /** the column header and the "rank by" button */
  label: string;
  /** a derived column (a rate): computed from the sums, null when it has no denominator */
  derive?: (t: Totals) => number | null;
  digits?: number;
}

const sumOf = (t: Totals, k: string) => t.sum[k] ?? 0;
const ratio = (a: string, b: string, scale = 1) => (t: Totals) => (sumOf(t, b) > 0 ? (sumOf(t, a) / sumOf(t, b)) * scale : null);

export interface Category {
  id: CategoryId;
  label: string;
  /** every column of the table; the ones in `rankBy` can also be what the table is ranked by */
  cols: StatCol[];
  rankBy: string[];
  /** only these positions (by the players file); empty means any */
  positions: readonly string[];
}

const col = (key: string, label: string, digits = 0, derive?: StatCol['derive']): StatCol => ({ key, label, digits, derive });

export const CATEGORIES: Record<CategoryId, Category> = {
  passing: {
    id: 'passing', label: 'passing', positions: [],
    cols: [col('pass_yd', 'yds'), col('pass_td', 'td'), col('pass_int', 'int'), col('pass_cmp', 'cmp'), col('pass_att', 'att'), col('cmp_pct', 'cmp %', 1, ratio('pass_cmp', 'pass_att', 100)), col('ypg', 'yds/g', 1, (t) => (t.games > 0 ? sumOf(t, 'pass_yd') / t.games : null))],
    rankBy: ['pass_yd', 'pass_td'],
  },
  rushing: {
    id: 'rushing', label: 'rushing', positions: [],
    cols: [col('rush_yd', 'yds'), col('rush_td', 'td'), col('rush_att', 'att'), col('ypc', 'yds/att', 1, ratio('rush_yd', 'rush_att')), col('ypg', 'yds/g', 1, (t) => (t.games > 0 ? sumOf(t, 'rush_yd') / t.games : null))],
    rankBy: ['rush_yd', 'rush_td'],
  },
  receiving: {
    id: 'receiving', label: 'receiving', positions: [],
    cols: [col('rec_yd', 'yds'), col('rec', 'rec'), col('rec_td', 'td'), col('rec_tgt', 'tgt'), col('ypr', 'yds/rec', 1, ratio('rec_yd', 'rec')), col('ypg', 'yds/g', 1, (t) => (t.games > 0 ? sumOf(t, 'rec_yd') / t.games : null))],
    rankBy: ['rec_yd', 'rec', 'rec_td'],
  },
  defense: {
    id: 'defense', label: 'defense', positions: ['DL', 'DE', 'DT', 'LB', 'OLB', 'ILB', 'MLB', 'DB', 'CB', 'S', 'FS', 'SS'],
    cols: [col('idp_tkl', 'tackles'), col('idp_sack', 'sacks', 1), col('idp_int', 'int'), col('idp_ff', 'ff'), col('idp_pass_def', 'pass def')],
    rankBy: ['idp_tkl', 'idp_sack', 'idp_int'],
  },
};
export const CATEGORY_ORDER: CategoryId[] = ['passing', 'rushing', 'receiving', 'defense'];

export function colValue(c: StatCol, t: Totals): number | null {
  return c.derive ? c.derive(t) : sumOf(t, c.key);
}

export interface PlayerInfo { pid: string; name: string; pos: string; team: string }

export interface LeaderRow {
  /** competition ranking: players level on the ranked stat share a rank (1, 2, 2, 4) */
  rank: number;
  tied: boolean;
  pid: string;
  name: string;
  pos: string;
  team: string;
  games: number;
  values: Record<string, number | null>;
}

export const LEADER_COUNT = 10;

/** The top `n` players in a category by one stat. Players level on that stat share a rank; the order among them is the category's first column,
    then name, so it never flips. Every player tied at the cut stays in, so the list can run past `n` (and never splits a tie). A player with
    zero of the ranked stat is not a leader. */
export function leaders(
  totals: ReadonlyMap<string, Totals>, info: ReadonlyMap<string, PlayerInfo>, category: CategoryId, by: string, n = LEADER_COUNT,
): LeaderRow[] {
  const cat = CATEGORIES[category];
  const byCol = cat.cols.find((c) => c.key === by) ?? cat.cols[0]!;
  const first = cat.cols[0]!;
  const pool: Array<{ p: PlayerInfo; t: Totals; v: number }> = [];
  for (const [pid, t] of totals) {
    const p = info.get(pid);
    if (!p) continue;
    if (cat.positions.length && !cat.positions.includes(p.pos)) continue;
    const v = colValue(byCol, t);
    if (v !== null && v > 0) pool.push({ p, t, v });
  }
  pool.sort((a, b) => b.v - a.v || (colValue(first, b.t) ?? 0) - (colValue(first, a.t) ?? 0) || a.p.name.localeCompare(b.p.name));
  const out: LeaderRow[] = [];
  let rank = 0;
  pool.forEach((r, i) => {
    if (i === 0 || r.v !== pool[i - 1]!.v) rank = i + 1;
    if (rank > n) return;
    out.push({
      rank, tied: false, pid: r.p.pid, name: r.p.name, pos: r.p.pos, team: r.p.team, games: r.t.games,
      values: Object.fromEntries(cat.cols.map((c) => [c.key, colValue(c, r.t)])),
    });
  });
  for (const r of out) r.tied = out.filter((x) => x.rank === r.rank).length > 1;
  return out;
}

/* ---------- a game's box score leaders ---------- */

export interface GameLeader { pid: string; name: string; pos: string; line: string; value: number }

export interface TeamLeaders {
  team: string;
  passing: GameLeader | null;
  rushing: GameLeader | null;
  receiving: GameLeader | null;
}

const n = (l: StatLine, k: string) => l[k] ?? 0;
const plural = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

/** The best passer, rusher and receiver of each team in one game, from that week's stat lines. A player counts for the team the players file
    gives him. "24/35, 312 yds, 2 td, 1 int". Null when nobody on the team had the stat. */
export function gameLeaders(stats: WeekStats | null, info: ReadonlyMap<string, PlayerInfo>, teams: readonly [string, string]): TeamLeaders[] {
  return teams.map((team): TeamLeaders => {
    const best = (key: string, line: (l: StatLine) => string): GameLeader | null => {
      let hit: GameLeader | null = null;
      for (const [pid, l] of Object.entries(stats ?? {})) {
        const p = info.get(pid);
        if (!p || p.team !== team || !played(l)) continue;
        const v = n(l, key);
        if (v <= 0) continue;
        if (!hit || v > hit.value || (v === hit.value && p.name.localeCompare(hit.name) < 0)) hit = { pid, name: p.name, pos: p.pos, line: line(l), value: v };
      }
      return hit;
    };
    const tds = (l: StatLine, k: string) => (n(l, k) > 0 ? `, ${plural(n(l, k), 'td')}` : '');
    return {
      team,
      passing: best('pass_yd', (l) => `${n(l, 'pass_cmp')}/${n(l, 'pass_att')}, ${n(l, 'pass_yd')} yds${tds(l, 'pass_td')}${n(l, 'pass_int') > 0 ? `, ${plural(n(l, 'pass_int'), 'int')}` : ''}`),
      rushing: best('rush_yd', (l) => `${plural(n(l, 'rush_att'), 'att', 'att')}, ${n(l, 'rush_yd')} yds${tds(l, 'rush_td')}`),
      receiving: best('rec_yd', (l) => `${n(l, 'rec')}${n(l, 'rec_tgt') ? `/${n(l, 'rec_tgt')}` : ''} rec, ${n(l, 'rec_yd')} yds${tds(l, 'rec_td')}`),
    };
  });
}

/* ---------- team scoring ---------- */

export interface TeamScoring {
  abbr: string;
  games: number;
  pf: number;
  pa: number;
  ppg: number | null;
  papg: number | null;
  /** points for minus points against, and per game */
  diff: number;
  diffPg: number | null;
}

/** Points for and against per team from the final games (the standings' records). */
export function teamScoring(records: ReadonlyMap<string, { abbr: string; pf: number; pa: number; games: readonly unknown[] }>): TeamScoring[] {
  return [...records.values()].map((r) => {
    const g = r.games.length;
    return { abbr: r.abbr, games: g, pf: r.pf, pa: r.pa, ppg: g ? r.pf / g : null, papg: g ? r.pa / g : null, diff: r.pf - r.pa, diffPg: g ? (r.pf - r.pa) / g : null };
  });
}

/** Players by id from Sleeper's players file: name, the real position (CB, DT, ...) and current team. Team defenses (id "KC") and players without a
    team are left out. */
export function playerInfo(file: Record<string, { player_id: string; first_name?: string; last_name?: string; position?: string | null; team?: string | null }> | null | undefined): Map<string, PlayerInfo> {
  const out = new Map<string, PlayerInfo>();
  if (!file) return out;
  for (const p of Object.values(file)) {
    if (!p.team || !p.position || p.position === 'DEF') continue;
    out.set(p.player_id, { pid: p.player_id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.player_id, pos: p.position, team: p.team });
  }
  return out;
}
