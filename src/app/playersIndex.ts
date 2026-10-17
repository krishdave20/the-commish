import type { PlayerRecord, PlayersMap } from '../data';

/* One light record per Sleeper player, built once from the ~12,000-entry players file so search stays instant. */

export interface PlayerEntry {
  pid: string;
  name: string;
  pos: string;
  team: string | null;
  /** on an NFL roster right now */
  active: boolean;
  /** Sleeper's status ('Active', 'Inactive', 'Injured Reserve', …) */
  status: string;
  /** injury designation ('' when healthy) */
  injury: string;
  age: number | null;
  /** lower-case "name team position" for matching */
  key: string;
  last: string;
}

/** Positions a fantasy league can start (the engine models these). */
export const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'] as const;
const FANTASY = new Set<string>(FANTASY_POSITIONS);

export function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** Age in whole years from a "YYYY-MM-DD" birth date, else Sleeper's own `age`. */
export function ageOf(rec: { age?: number | null; birth_date?: unknown }, now: number = Date.now()): number | null {
  const bd = str(rec.birth_date);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(bd);
  if (m) {
    const born = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const years = Math.floor((now - born) / (365.2425 * 86_400_000));
    if (years > 15 && years < 60) return years;
  }
  return typeof rec.age === 'number' ? rec.age : null;
}

export function displayName(rec: PlayerRecord): string {
  const full = str(rec.full_name);
  if (full) return full;
  const n = `${str(rec.first_name)} ${str(rec.last_name)}`.trim();
  return n || (rec.position === 'DEF' && rec.team ? `${rec.team} defense` : rec.player_id);
}

export function buildPlayerIndex(map: PlayersMap | undefined, now: number = Date.now()): PlayerEntry[] {
  if (!map) return [];
  const out: PlayerEntry[] = [];
  for (const [pid, rec] of Object.entries(map)) {
    const pos = rec.position ?? '';
    if (!FANTASY.has(pos)) continue;
    const name = displayName({ ...rec, player_id: pid });
    const team = rec.team ?? null;
    const status = rec.status ?? '';
    out.push({
      pid, name, pos, team,
      active: team !== null && status !== 'Inactive' && status !== 'Retired',
      status,
      injury: rec.injury_status ?? '',
      age: ageOf(rec, now),
      key: `${name} ${team ?? ''} ${pos}`.toLowerCase(),
      last: str(rec.last_name).toLowerCase(),
    });
  }
  return out;
}

export interface SearchOpts {
  query?: string;
  pos?: string;
  /** restrict to these pids (a roster, the watchlist, free agents …) */
  only?: ReadonlySet<string> | null;
  /** predicate applied after the others, e.g. "not rostered" */
  filter?: (e: PlayerEntry) => boolean;
  limit?: number;
}

/** Name, team or position matches, best first: names that start with the query, then last names, then active players. */
export function searchPlayers(index: readonly PlayerEntry[], o: SearchOpts = {}): PlayerEntry[] {
  const tokens = (o.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? '';
  const hits: Array<[number, PlayerEntry]> = [];
  for (const e of index) {
    if (o.pos && o.pos !== 'all' && e.pos !== o.pos) continue;
    if (o.only && !o.only.has(e.pid)) continue;
    if (tokens.length && !tokens.every((t) => e.key.includes(t))) continue;
    if (o.filter && !o.filter(e)) continue;
    const rank = !first ? 2 : e.key.startsWith(first) ? 0 : e.last.startsWith(first) ? 1 : 2;
    hits.push([rank * 2 + (e.active ? 0 : 1), e]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return hits.slice(0, o.limit ?? 50).map(([, e]) => e);
}
