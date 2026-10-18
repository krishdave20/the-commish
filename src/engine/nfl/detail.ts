/* The fantasy side of one NFL game: who plays in it, what they scored, what they were projected, and who owns them in your league.
   Pure. The inputs come from four places and every number says which:
   - candidates: Sleeper's players file (team + active + a fantasy position), plus any player the league has rostered on those teams
   - points:     the league's matchups `players_points` when the player is rostered (league scoring applied), else the week's stat line
                 scored with the league's settings (`source` says which)
   - projection: Sleeper's projection for the week scored with the league's settings (the live engine's `mu`)
   - owner:      the matchups' `players` lists, which name the roster that holds each player that week */
import type { PlayerRecord, PlayersMap, StatLine } from '../../data/types.ts';

export interface Candidate {
  pid: string;
  name: string;
  pos: string;
  team: string;
  injury: string | null;
}

export interface Owner {
  rid: number;
  team: string;
  manager: string;
  isMe: boolean;
}

export interface DetailPlayer extends Candidate {
  side: 'home' | 'away';
  /** null: a free agent in your league */
  owner: Owner | null;
  /** fantasy points so far this week; null when there is no number (not started, or no stat line) */
  points: number | null;
  source: 'league' | 'stats' | null;
  /** the pre-game expectation for the whole game; null when Sleeper has none */
  projection: number | null;
}

export interface GameDetail {
  /** everyone worth showing, best first */
  players: DetailPlayer[];
  mine: DetailPlayer[];
  /** rostered by another team in your league */
  league: DetailPlayer[];
  /** the best fantasy scores (by points once the game has started, else by projection) */
  top: DetailPlayer[];
  /** free agents: the best scores of the game, or the best projections before kickoff */
  waiver: DetailPlayer[];
  /** how `top` and `waiver` are ranked */
  rankedBy: 'points' | 'projection';
}

export const DEFAULT_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
export const TOP_COUNT = 8;
export const WAIVER_COUNT = 6;

const name = (p: PlayerRecord): string => {
  if (p.position === 'DEF') return `${p.player_id.toLowerCase()} d/st`;
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.player_id;
};

/** The players file indexed by NFL team, keeping only players who could matter in fantasy: an active player at a position the league
    projects. Build it once per players file (it scans about 12,000 entries). */
export function indexByTeam(file: PlayersMap | null | undefined, positions: readonly string[] = DEFAULT_POSITIONS): Map<string, Candidate[]> {
  const out = new Map<string, Candidate[]>();
  if (!file) return out;
  const ok = new Set(positions);
  for (const p of Object.values(file)) {
    // an IDP's `position` can be CB or DT while the league slot is DB or DL: fantasy_positions carries the slot name
    const fp = Array.isArray(p.fantasy_positions) ? (p.fantasy_positions as string[]) : [];
    const pos = ok.has(p.position ?? '') ? (p.position as string) : (fp.find((x) => ok.has(x)) ?? '');
    if (!p.team || !pos) continue;
    if (p.active === false || (p.status ?? 'Active') !== 'Active') continue;
    const list = out.get(p.team);
    const c: Candidate = { pid: p.player_id, name: name(p), pos, team: p.team, injury: p.injury_status ?? null };
    if (list) list.push(c); else out.set(p.team, [c]);
  }
  return out;
}

export interface DetailInput {
  home: string;
  away: string;
  /** `pre` hides points; `final` hides the projection */
  state: 'pre' | 'live' | 'final';
  byTeam: Map<string, Candidate[]>;
  /** rostered players whose names and teams the model knows (a rostered player not in the players file still shows) */
  rostered?: readonly Candidate[];
  /** player id -> roster id, from the matchups' `players` lists */
  owners: ReadonlyMap<string, number>;
  teams: Readonly<Record<number, { name: string; manager: string }>>;
  meRid: number;
  /** player id -> points from the matchups' `players_points` */
  leaguePoints: Readonly<Record<string, number>>;
  /** the week's stat lines and the league's scorer */
  stats: Readonly<Record<string, StatLine>> | null;
  score: (st: StatLine) => number;
  /** player id -> pre-game expectation */
  mu: Readonly<Record<string, number>>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function gameDetail(i: DetailInput): GameDetail {
  const seen = new Set<string>();
  const cands: Candidate[] = [];
  const add = (c: Candidate) => { if (!seen.has(c.pid) && (c.team === i.home || c.team === i.away)) { seen.add(c.pid); cands.push(c); } };
  for (const t of [i.home, i.away]) for (const c of i.byTeam.get(t) ?? []) add(c);
  for (const c of i.rostered ?? []) add(c);

  const started = i.state !== 'pre';
  const players: DetailPlayer[] = [];
  for (const c of cands) {
    const rid = i.owners.get(c.pid);
    const t = rid !== undefined ? i.teams[rid] : undefined;
    const owner: Owner | null = rid !== undefined ? { rid, team: t?.name ?? `team ${rid}`, manager: t?.manager ?? '', isMe: rid === i.meRid } : null;
    const line = i.stats?.[c.pid];
    let points: number | null = null;
    let source: DetailPlayer['source'] = null;
    if (owner && i.leaguePoints[c.pid] !== undefined) { points = r2(i.leaguePoints[c.pid]!); source = 'league'; }
    else if (line) { points = r2(i.score(line)); source = 'stats'; }
    if (!started) { points = null; source = null; }
    const mu = i.mu[c.pid];
    const projection = i.state === 'final' || mu === undefined ? null : r2(mu);
    // worth listing: someone owns him, he has a score, or Sleeper projects him
    if (!owner && !(points !== null && (points !== 0 || line !== undefined)) && !(projection !== null && projection > 0)) continue;
    players.push({ ...c, side: c.team === i.home ? 'home' : 'away', owner, points, source, projection });
  }

  const rank = (a: DetailPlayer, b: DetailPlayer) =>
    (b.points ?? -1) - (a.points ?? -1) || (b.projection ?? -1) - (a.projection ?? -1) || a.name.localeCompare(b.name);
  players.sort(rank);
  const rankedBy: GameDetail['rankedBy'] = started ? 'points' : 'projection';
  const byMetric = (a: DetailPlayer, b: DetailPlayer) => (started ? rank(a, b) : (b.projection ?? -1) - (a.projection ?? -1) || a.name.localeCompare(b.name));
  const sig = (p: DetailPlayer) => (started ? (p.points ?? 0) > 0 : (p.projection ?? 0) > 0);
  const ranked = [...players].sort(byMetric);
  return {
    players,
    mine: players.filter((p) => p.owner?.isMe),
    league: players.filter((p) => p.owner && !p.owner.isMe),
    top: ranked.filter(sig).slice(0, TOP_COUNT),
    waiver: ranked.filter((p) => !p.owner && sig(p)).slice(0, WAIVER_COUNT),
    rankedBy,
  };
}
