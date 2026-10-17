/* Glue between the pipeline's entities, players.csv and Sleeper's player map, around the pure join in src/data/ids.ts. */
import { normalizeName, normalizeTeam, posGroup, resolveIds, type IdResolution, type NvPlayer, type SleeperCand } from '../../src/data/ids.ts';
import type { UnmatchedFile, UnmatchedPlayer } from '../../src/data/nflverseTypes.ts';
import type { PlayerRecord } from '../../src/data/types.ts';
import type { Entity } from './aggregate.ts';
import type { PlayersCsvRow } from './rows.ts';

export interface Usage { off_snaps: number; tgt: number; car: number }

/** Sleeper record -> the fields the join reads. Players with no skill position are dropped later by resolveIds. */
export function sleeperCands(players: Record<string, PlayerRecord>): SleeperCand[] {
  const out: SleeperCand[] = [];
  for (const [id, p] of Object.entries(players)) {
    const positions = [p.position, ...(Array.isArray(p.fantasy_positions) ? (p.fantasy_positions as string[]) : [])].filter((x): x is string => !!x && !!posGroup(x));
    if (!positions.length) continue;
    const name = (p.full_name as string | undefined) || [p.first_name, p.last_name].filter(Boolean).join(' ');
    if (!name) continue;
    out.push({
      id: p.player_id ?? id,
      gsis: p.gsis_id ? String(p.gsis_id) : null,
      espn: p.espn_id !== null && p.espn_id !== undefined && p.espn_id !== '' ? String(p.espn_id) : null,
      name,
      team: normalizeTeam(p.team),
      positions,
      birth: typeof p.birth_date === 'string' && p.birth_date ? p.birth_date : null,
      active: p.status === 'Active' || p.active === true,
      rank: typeof p.search_rank === 'number' ? p.search_rank : undefined,
    });
  }
  return out;
}

export interface NvSet {
  players: NvPlayer[];
  /** `pfr:<id>` entity -> gsis entity of the same person, when players.csv could not link them (no pfr_id on its row) */
  aliases: Map<string, string>;
}

/** nflverse-side players the join must place: every entity with skill-position usage, plus last season's route runners. */
export function nvPlayers(
  entities: Map<string, Entity>,
  usage: Map<string, Usage>,
  csv: Map<string, PlayersCsvRow>,
  extra: Array<{ gsis: string; team: string }> = [],
): NvSet {
  const out = new Map<string, NvPlayer>();
  for (const e of entities.values()) {
    const u = usage.get(e.key);
    if (!u || !(u.off_snaps > 0 || u.tgt > 0 || u.car > 0)) continue;
    const row = e.gsis ? csv.get(e.gsis) : undefined;
    const pos = e.pos ?? row?.pos ?? null;
    // a snap-count position decides skill-or-not; with none, any target or carry keeps a player in
    if (pos ? !posGroup(pos) : !(u.tgt > 0 || u.car > 0)) continue;
    out.set(e.key, {
      key: e.key, gsis: e.gsis, pfr: e.pfr ?? row?.pfr ?? null, espn: row?.espn ?? null,
      name: e.name ?? row?.name ?? '(unknown)', team: e.team ?? row?.team ?? null, pos, birth: row?.birth ?? null,
    });
  }
  for (const x of extra) {
    if (out.has(x.gsis)) continue;
    const row = csv.get(x.gsis);
    if (!row || !posGroup(row.pos)) continue;
    out.set(x.gsis, { key: x.gsis, gsis: x.gsis, pfr: row.pfr, espn: row.espn, name: row.name, team: x.team, pos: row.pos, birth: row.birth });
  }

  /* A snap-only `pfr:` player and a gsis player with no pfr_id can be one person (players.csv sometimes lacks the pfr_id).
     Merge only when exactly one gsis player has the same normalized name and position group, so a shared name never merges. */
  const aliases = new Map<string, string>();
  const unlinked = new Map<string, NvPlayer[]>();
  for (const n of out.values()) {
    if (n.gsis && !n.pfr && posGroup(n.pos)) {
      const k = `${normalizeName(n.name)}|${posGroup(n.pos)}`;
      unlinked.set(k, [...(unlinked.get(k) ?? []), n]);
    }
  }
  for (const p of [...out.values()]) {
    if (p.gsis || !p.pfr || !posGroup(p.pos)) continue;
    const gs = unlinked.get(`${normalizeName(p.name)}|${posGroup(p.pos)}`);
    if (gs?.length !== 1) continue;
    const g = gs[0];
    out.set(g.key, { ...g, pfr: p.pfr, team: p.team ?? g.team });
    out.delete(p.key);
    aliases.set(p.key, g.key);
  }
  return { players: [...out.values()], aliases };
}

export function unmatchedFile(
  res: IdResolution, nv: NvPlayer[], usage: Map<string, Usage>, o: { season: number; generatedAt: string },
): UnmatchedFile {
  const players: UnmatchedPlayer[] = [];
  for (const n of nv) {
    const u = usage.get(n.key);
    // only players who matter this season; last-season-only route runners are not a join problem
    if (!u || !(u.off_snaps > 0 || u.tgt > 0 || u.car > 0)) continue;
    const m = res.unmatched.get(n.key);
    if (!m) continue;
    players.push({
      key: n.key, gsis: n.gsis, pfr: n.pfr, name: n.name, team: normalizeTeam(n.team), pos: n.pos,
      off_snaps: u.off_snaps, tgt: u.tgt, car: u.car, reason: m.reason, candidates: m.candidates.slice(0, 4),
    });
  }
  players.sort((a, b) => b.off_snaps - a.off_snaps || b.tgt + b.car - (a.tgt + a.car) || a.name.localeCompare(b.name));
  return { schema: 1, season: o.season, generatedAt: o.generatedAt, players };
}

export { resolveIds };
