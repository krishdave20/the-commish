/* NFL standings and the "if the season ended today" playoff picture, from final scores. Pure.

   SIMPLIFIED TIEBREAKERS (the page says so behind a "?": the official NFL procedure has more steps, such as common games, conference
   record and strength of victory). Teams are ordered by:
     1. win percentage (a tie counts half a win)
     2. head-to-head: win percentage in the games the tied teams played against each other (skipped when they did not play)
     3. division record: win percentage in division games (only when every tied team is in the same division)
     4. point differential (points for minus points against)
   then alphabetical by city, so the order never flips between renders. When a step splits a group of three or more tied teams, each smaller
   group starts again from step 1. Nothing is estimated: every figure is a sum over final games. */
import { CONFERENCES, DIVISION_ORDER, NFL_TEAMS, cityOf, teamOf } from './teams.ts';
import type { Conference, DivisionName } from './teams.ts';

/** The parts of a game the standings read. */
export interface ResultGame {
  week: number;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** only final games count */
  state: 'pre' | 'live' | 'final';
}

export type Result = 'W' | 'L' | 'T';

export interface TeamGame { week: number; opp: string; result: Result; pf: number; pa: number }

export interface TeamRecord {
  abbr: string;
  w: number; l: number; t: number;
  pf: number; pa: number;
  /** wins plus half the ties, over games played; 0 before any game */
  pct: number;
  diff: number;
  div: { w: number; l: number; t: number };
  conf: { w: number; l: number; t: number };
  /** "W3", "L1", "T1"; "" before a game */
  streak: string;
  /** the last five results, oldest first */
  last5: Result[];
  /** every final game, oldest first */
  games: TeamGame[];
}

const emptyWlt = () => ({ w: 0, l: 0, t: 0 });
const pctOf = (x: { w: number; l: number; t: number }) => {
  const n = x.w + x.l + x.t;
  return n === 0 ? 0 : (x.w + x.t / 2) / n;
};
export const recordPct = pctOf;

/** "11-6" or "10-6-1". */
export const formatWlt = (x: { w: number; l: number; t: number }) => (x.t ? `${x.w}-${x.l}-${x.t}` : `${x.w}-${x.l}`);

/** ".647"; "—" before a game. */
export function formatPct(p: number, played: boolean): string {
  if (!played) return '—';
  return p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, '');
}

function streakOf(games: readonly TeamGame[]): string {
  const last = games[games.length - 1];
  if (!last) return '';
  let n = 0;
  for (let i = games.length - 1; i >= 0 && games[i]!.result === last.result; i--) n++;
  return `${last.result}${n}`;
}

/** Every team's record from the final games (unknown team codes are ignored). */
export function buildRecords(games: readonly ResultGame[]): Map<string, TeamRecord> {
  const out = new Map<string, TeamRecord>();
  for (const t of NFL_TEAMS) {
    out.set(t.abbr, { abbr: t.abbr, w: 0, l: 0, t: 0, pf: 0, pa: 0, pct: 0, diff: 0, div: emptyWlt(), conf: emptyWlt(), streak: '', last5: [], games: [] });
  }
  const final = games.filter((g) => g.state === 'final' && g.homeScore !== null && g.awayScore !== null)
    .sort((a, b) => a.week - b.week);
  for (const g of final) {
    const h = out.get(g.home), a = out.get(g.away);
    const ht = teamOf(g.home), at = teamOf(g.away);
    if (!h || !a || !ht || !at) continue;
    const hs = g.homeScore!, as = g.awayScore!;
    const sameDiv = ht.conf === at.conf && ht.division === at.division;
    const sameConf = ht.conf === at.conf;
    const apply = (r: TeamRecord, opp: string, pf: number, pa: number) => {
      const res: Result = pf > pa ? 'W' : pf < pa ? 'L' : 'T';
      const k = res === 'W' ? 'w' : res === 'L' ? 'l' : 't';
      r[k]++; r.pf += pf; r.pa += pa;
      if (sameDiv) r.div[k]++;
      if (sameConf) r.conf[k]++;
      r.games.push({ week: g.week, opp, result: res, pf, pa });
    };
    apply(h, g.away, hs, as);
    apply(a, g.home, as, hs);
  }
  for (const r of out.values()) {
    r.pct = pctOf(r);
    r.diff = r.pf - r.pa;
    r.streak = streakOf(r.games);
    r.last5 = r.games.slice(-5).map((g) => g.result);
  }
  return out;
}

/* ---------- ordering ---------- */

type Key = (group: readonly string[], rec: Map<string, TeamRecord>) => Map<string, number> | null;

const byPct: Key = (group, rec) => new Map(group.map((a) => [a, rec.get(a)!.pct]));

const byHeadToHead: Key = (group, rec) => {
  const set = new Set(group);
  const keys = new Map<string, number>();
  let any = false;
  for (const a of group) {
    const x = emptyWlt();
    for (const g of rec.get(a)!.games) {
      if (!set.has(g.opp)) continue;
      any = true;
      x[g.result === 'W' ? 'w' : g.result === 'L' ? 'l' : 't']++;
    }
    keys.set(a, x.w + x.l + x.t === 0 ? 0.5 : pctOf(x));
  }
  return any ? keys : null;
};

const byDivisionRecord: Key = (group, rec) => {
  const first = teamOf(group[0]);
  if (!first || !group.every((a) => { const t = teamOf(a); return t && t.conf === first.conf && t.division === first.division; })) return null;
  return new Map(group.map((a) => [a, pctOf(rec.get(a)!.div)]));
};

const byDiff: Key = (group, rec) => new Map(group.map((a) => [a, rec.get(a)!.diff]));

const STEPS: readonly Key[] = [byPct, byHeadToHead, byDivisionRecord, byDiff];

/** Order a group of teams best first with the simplified tiebreakers above. */
export function orderTeams(group: readonly string[], rec: Map<string, TeamRecord>): string[] {
  if (group.length <= 1) return [...group];
  for (const step of STEPS) {
    const keys = step(group, rec);
    if (!keys) continue;
    const values = [...new Set(keys.values())].sort((x, y) => y - x);
    if (values.length === 1) continue;
    return values.flatMap((v) => orderTeams(group.filter((a) => keys.get(a) === v), rec));
  }
  return [...group].sort((a, b) => cityOf(a).localeCompare(cityOf(b)) || a.localeCompare(b));
}

/* ---------- tables ---------- */

export interface StandingRow extends TeamRecord {
  conference: Conference;
  division: DivisionName;
  /** 1-based place in its division */
  rank: number;
}

export interface DivisionTable { conference: Conference; division: DivisionName; teams: StandingRow[] }

export interface Standings {
  /** AFC East, AFC North, AFC South, AFC West, NFC East, ... */
  divisions: DivisionTable[];
  /** played at least one final game */
  started: boolean;
  records: Map<string, TeamRecord>;
}

export function buildStandings(games: readonly ResultGame[]): Standings {
  const records = buildRecords(games);
  const divisions: DivisionTable[] = [];
  for (const conference of CONFERENCES) {
    for (const division of DIVISION_ORDER) {
      const abbrs = NFL_TEAMS.filter((t) => t.conf === conference && t.division === division).map((t) => t.abbr);
      const teams = orderTeams(abbrs, records).map((a, i): StandingRow => ({ ...records.get(a)!, conference, division, rank: i + 1 }));
      divisions.push({ conference, division, teams });
    }
  }
  return { divisions, started: [...records.values()].some((r) => r.games.length > 0), records };
}

/* ---------- playoff picture ---------- */

export interface Seed {
  seed: number;
  team: StandingRow;
  kind: 'division' | 'wild card';
}

export interface PlayoffPicture {
  conference: Conference;
  /** seeds 1 to 7 */
  seeds: Seed[];
  /** the next teams by the same order (the first three out), with games behind the 7th seed */
  hunt: Array<{ team: StandingRow; behind: number }>;
}

export const PLAYOFF_SEEDS = 7;
export const DIVISION_LEADER_SEEDS = 4;
export const HUNT_SIZE = 3;

/** "If the season ended today": the four division leaders seeded 1 to 4 by the tiebreakers (a division winner outranks a better-record
    wild card), then the next three best records as wild cards seeded 5 to 7. */
export function playoffPicture(standings: Standings, conference: Conference): PlayoffPicture {
  const rows = standings.divisions.filter((d) => d.conference === conference).flatMap((d) => d.teams);
  const byAbbr = new Map(rows.map((r) => [r.abbr, r]));
  const leaders = rows.filter((r) => r.rank === 1).map((r) => r.abbr);
  const order = (abbrs: string[]) => orderTeams(abbrs, standings.records).map((a) => byAbbr.get(a)!);
  const seededLeaders = order(leaders);
  const others = order(rows.filter((r) => r.rank !== 1).map((r) => r.abbr));
  const seeds: Seed[] = [
    ...seededLeaders.map((team, i): Seed => ({ seed: i + 1, team, kind: 'division' })),
    ...others.slice(0, PLAYOFF_SEEDS - DIVISION_LEADER_SEEDS).map((team, i): Seed => ({ seed: DIVISION_LEADER_SEEDS + i + 1, team, kind: 'wild card' })),
  ];
  const last = seeds[seeds.length - 1]!.team;
  const hunt = others.slice(PLAYOFF_SEEDS - DIVISION_LEADER_SEEDS, PLAYOFF_SEEDS - DIVISION_LEADER_SEEDS + HUNT_SIZE)
    .map((team) => ({ team, behind: ((last.w - team.w) + (team.l - last.l)) / 2 }));
  return { conference, seeds, hunt };
}
