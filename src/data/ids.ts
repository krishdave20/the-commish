/* Joins nflverse players to Sleeper players. Pure (no DOM, no network) so the nightly pipeline and the tests
   share it. Only ~19% of active Sleeper skill players carry a gsis_id, so the join walks four tiers and
   records which one matched. A tier only accepts a match when it is unambiguous on BOTH sides: a wrong join
   would put someone else's targets on a player, which is worse than showing no data.

   Tiers: gsis (Sleeper gsis_id = nflverse gsis_id), espn (Sleeper espn_id = players.csv espn_id, which also
   gives the gsis_id and pfr_id), name_team_pos, name_pos (team differs, birth dates confirm). Snap counts
   join through players.csv: pfr_player_id -> pfr_id -> gsis_id (see pfrToGsis). */
import type { MatchMethod, UnmatchedReason } from './nflverseTypes.ts';

export type PosGroup = 'QB' | 'RB' | 'WR' | 'TE';

/** An nflverse-side player: one row of players.csv, or one seen in this season's data with no players.csv row. */
export interface NvPlayer {
  /** gsis_id, or `pfr:<id>` for a player known only from snap counts */
  key: string;
  gsis: string | null;
  pfr: string | null;
  espn: string | null;
  name: string;
  team: string | null;
  pos: string | null;
  /** YYYY-MM-DD */
  birth: string | null;
}

/** The slice of a Sleeper /v1/players/nfl record the join reads. */
export interface SleeperCand {
  id: string;
  gsis: string | null;
  espn: string | null;
  name: string;
  team: string | null;
  /** position plus fantasy_positions */
  positions: string[];
  birth: string | null;
  active: boolean;
  /** lower = better known; breaks ties between duplicate Sleeper records of one person */
  rank?: number;
}

export interface IdMatch { sleeperId: string; nvKey: string; method: MatchMethod }
export interface IdUnmatched { nvKey: string; reason: UnmatchedReason; candidates: string[] }
export interface IdResolution {
  /** gsis/espn id matches refused because the two records have different last names (Sleeper's ids are sometimes swapped between players) */
  conflicts: Array<{ nvKey: string; sleeperId: string; method: 'gsis' | 'espn' }>;
  byNv: Map<string, IdMatch>;
  bySleeper: Map<string, IdMatch>;
  unmatched: Map<string, IdUnmatched>;
}

/* ---------- normalization ---------- */

const GROUPS: Record<string, PosGroup> = { QB: 'QB', RB: 'RB', HB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE' };
export const posGroup = (pos: string | null | undefined): PosGroup | null => (pos ? GROUPS[pos.toUpperCase()] ?? null : null);

/** nflverse and older feeds spell some teams differently; everything is stored with Sleeper's spelling. */
const TEAMS: Record<string, string> = { LA: 'LAR', STL: 'LAR', JAC: 'JAX', WSH: 'WAS', OAK: 'LV', SD: 'LAC', SDG: 'LAC', ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU' };
export function normalizeTeam(team: string | null | undefined): string | null {
  const t = (team ?? '').trim().toUpperCase();
  if (!t || t === 'FA' || t === 'UNK') return null;
  return TEAMS[t] ?? t;
}

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
/** first-name variants that mean the same person on different sites. Applied to the first word only. */
const NICKNAMES: Record<string, string> = {
  mike: 'michael', mikey: 'michael', matt: 'matthew', chris: 'christopher', nick: 'nicholas', nicky: 'nicholas',
  josh: 'joshua', zach: 'zachary', zack: 'zachary', zac: 'zachary', will: 'william', bill: 'william', billy: 'william',
  dan: 'daniel', danny: 'daniel', ben: 'benjamin', benny: 'benjamin', tony: 'anthony', tom: 'thomas', tommy: 'thomas',
  jim: 'james', jimmy: 'james', joe: 'joseph', joey: 'joseph', dave: 'david', rob: 'robert', bob: 'robert', bobby: 'robert',
  jeff: 'jeffrey', greg: 'gregory', andy: 'andrew', tim: 'timothy', sam: 'samuel', cam: 'cameron', alex: 'alexander',
  ken: 'kenneth', kenny: 'kenneth', ted: 'theodore', teddy: 'theodore', steve: 'steven', stephen: 'steven', gabe: 'gabriel',
  nate: 'nathan', pat: 'patrick', rich: 'richard', ricky: 'richard', charlie: 'charles', chuck: 'charles', eddie: 'edward',
  isiah: 'isaiah', ray: 'raymond', len: 'leonard', zeke: 'ezekiel', mitch: 'mitchell', drew: 'andrew',
};

/** Case, accents, periods, apostrophes, hyphens and spaces folded away; Jr./Sr./II/III/IV/V dropped; first-name nicknames
    mapped. "D.J. Moore" and "DJ Moore" give the same key, so do "Marvin Harrison Jr." and "Marvin Harrison". */
export function normalizeName(name: string | null | undefined): string {
  let s = (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  s = s.replace(/[.'’`]/g, '').replace(/[-–]/g, ' ').replace(/[^a-z0-9 ]/g, ' ');
  const words = s.split(/\s+/).filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && NICKNAMES[words[0]]) words[0] = NICKNAMES[words[0]];
  return words.join('');
}

/** Last word of the normalized name (suffix dropped, hyphenated names split): "Amon-Ra St. Brown" gives "brown". */
export function lastName(name: string | null | undefined): string {
  let s = (name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  s = s.replace(/[.'’`]/g, '').replace(/[^a-z0-9]+/g, ' ');
  const words = s.split(' ').filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words[words.length - 1] ?? '';
}

/* ---------- snap counts ---------- */

/** pfr_id -> gsis_id from players.csv rows. A pfr_id that maps to two different gsis_ids is dropped (ambiguous). */
export function pfrToGsis(rows: Array<{ pfr: string | null; gsis: string | null }>): Map<string, string> {
  const out = new Map<string, string>();
  const bad = new Set<string>();
  for (const r of rows) {
    if (!r.pfr || !r.gsis) continue;
    const prev = out.get(r.pfr);
    if (prev && prev !== r.gsis) bad.add(r.pfr);
    else out.set(r.pfr, r.gsis);
  }
  for (const b of bad) out.delete(b);
  return out;
}

/** nflverse key of a snap-count row: the gsis_id when players.csv knows the pfr id, else `pfr:<id>`. */
export const snapKey = (pfrId: string, map: Map<string, string>) => map.get(pfrId) ?? `pfr:${pfrId}`;

/* ---------- the join ---------- */

const same = (a: string | null, b: string | null) => a !== null && b !== null && a === b;
const label = (c: SleeperCand) => `${c.name} (${c.id}${c.team ? `, ${c.team}` : ''})`;
/** duplicate Sleeper records of one person: prefer active, with a team, best search rank */
const better = (a: SleeperCand, b: SleeperCand) =>
  (Number(b.active) - Number(a.active)) || (Number(!!b.team) - Number(!!a.team)) || ((a.rank ?? 1e9) - (b.rank ?? 1e9)) || a.id.localeCompare(b.id);
const pickBest = (cs: SleeperCand[]) => [...cs].sort(better)[0];

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!k) continue;
    const l = m.get(k);
    if (l) l.push(x); else m.set(k, [x]);
  }
  return m;
}

/** Joins nflverse players (`nv`: those that matter this season, skill positions) to Sleeper players. */
export function resolveIds(nv: NvPlayer[], sleeper: SleeperCand[]): IdResolution {
  const byNv = new Map<string, IdMatch>();
  const bySleeper = new Map<string, IdMatch>();
  const unmatched = new Map<string, IdUnmatched>();
  const conflicts: IdResolution['conflicts'] = [];
  const claim = (n: NvPlayer, s: SleeperCand, method: MatchMethod) => {
    const m: IdMatch = { sleeperId: s.id, nvKey: n.key, method };
    byNv.set(n.key, m);
    bySleeper.set(s.id, m);
    unmatched.delete(n.key);
  };
  const free = (s: SleeperCand) => !bySleeper.has(s.id);
  const left = () => nv.filter((n) => !byNv.has(n.key));
  const mark = (n: NvPlayer, reason: UnmatchedReason, candidates: SleeperCand[] = []) => {
    if (byNv.has(n.key)) return;
    unmatched.set(n.key, { nvKey: n.key, reason, candidates: candidates.map(label) });
  };

  const pool = sleeper.filter((s) => s.positions.some((p) => posGroup(p)));

  /* An id match is only trusted when the last names agree. Sleeper has records whose gsis_id/espn_id belong to someone
     else (Tyler Conklin carries Ryan Izzo's, and Izzo carries Conklin's); taking those would put one player's stats on another. */
  const trusted = (n: NvPlayer, cs: SleeperCand[], method: 'gsis' | 'espn') => {
    const ok = cs.filter((s) => lastName(s.name) === lastName(n.name));
    for (const s of cs) if (!ok.includes(s) && !conflicts.some((c) => c.nvKey === n.key && c.sleeperId === s.id)) conflicts.push({ nvKey: n.key, sleeperId: s.id, method });
    return ok;
  };

  /* tier 1: gsis */
  const sByGsis = groupBy(pool, (s) => s.gsis ?? '');
  for (const n of nv) {
    if (!n.gsis) continue;
    const cs = trusted(n, (sByGsis.get(n.gsis) ?? []).filter(free), 'gsis');
    if (cs.length) claim(n, pickBest(cs), 'gsis');
  }

  /* tier 2: espn */
  const sByEspn = groupBy(pool, (s) => (s.espn ? String(s.espn) : ''));
  for (const n of left()) {
    if (!n.espn) continue;
    const all = (sByEspn.get(String(n.espn)) ?? []).filter((s) => lastName(s.name) === lastName(n.name));
    const cs = all.filter(free);
    if (cs.length) claim(n, pickBest(cs), 'espn');
    else if (all.length) mark(n, 'duplicate', all);
    else if ((sByEspn.get(String(n.espn)) ?? []).length) trusted(n, sByEspn.get(String(n.espn))!, 'espn');
  }

  /* tiers 3 and 4: names. Only players no earlier tier claimed take part, on both sides. */
  const sByName = groupBy(pool.filter(free), (s) => normalizeName(s.name));
  const nByName = groupBy(left().filter((n) => posGroup(n.pos)), (n) => normalizeName(n.name));
  const fits = (s: SleeperCand, g: PosGroup) => s.positions.some((p) => posGroup(p) === g);

  /* tier 3: name + team + position group */
  for (const [key, ns] of nByName) {
    const ss = sByName.get(key) ?? [];
    for (const n of ns) {
      if (byNv.has(n.key)) continue;
      const g = posGroup(n.pos)!;
      const nTeam = normalizeTeam(n.team);
      const cs = ss.filter((s) => free(s) && fits(s, g) && same(normalizeTeam(s.team), nTeam));
      if (!cs.length) continue;
      const rivals = ns.filter((m) => !byNv.has(m.key) && posGroup(m.pos) === g && same(normalizeTeam(m.team), nTeam));
      if (cs.length === 1 && rivals.length === 1) { claim(n, cs[0], 'name_team_pos'); continue; }
      // several on a side: birth date can still pick exactly one
      const byBirth = n.birth ? cs.filter((s) => same(s.birth, n.birth)) : [];
      const rivalsSameBirth = rivals.filter((m) => same(m.birth, n.birth));
      if (byBirth.length === 1 && rivalsSameBirth.length === 1) claim(n, byBirth[0], 'name_team_pos');
      else mark(n, 'ambiguous', cs);
    }
  }

  /* tier 4: name + position, team differs, birth dates agree */
  for (const [key, ns] of nByName) {
    const ss = sByName.get(key) ?? [];
    for (const n of ns) {
      if (byNv.has(n.key)) continue;
      const g = posGroup(n.pos)!;
      const cs = ss.filter((s) => free(s) && fits(s, g));
      if (!cs.length) continue;
      const sameBirth = n.birth ? cs.filter((s) => same(s.birth, n.birth)) : [];
      const rivals = ns.filter((m) => !byNv.has(m.key) && posGroup(m.pos) === g && same(m.birth, n.birth));
      if (sameBirth.length === 1 && rivals.length === 1) claim(n, sameBirth[0], 'name_pos');
      else if (unmatched.get(n.key)?.reason !== 'ambiguous') mark(n, cs.length > 1 && !n.birth ? 'ambiguous' : 'team_mismatch', cs);
    }
  }

  for (const n of left()) if (!unmatched.has(n.key)) mark(n, 'no_candidate');
  return { conflicts, byNv, bySleeper, unmatched };
}

/** Counts of matches by method, for the manifest. */
export function methodCounts(res: IdResolution): Record<MatchMethod, number> {
  const out: Record<MatchMethod, number> = { gsis: 0, espn: 0, name_team_pos: 0, name_pos: 0 };
  for (const m of res.bySleeper.values()) out[m.method]++;
  return out;
}
