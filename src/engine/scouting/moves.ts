/* Their recent moves: adds, drops and trades from the league's transactions, the last RECENT_WEEKS weeks (this one and the one before).

   What Sleeper sends (checked on the real league, Oct 18, 2026): `type` is waiver | free_agent | trade, `status` complete | failed, `leg` the week it
   belongs to, `adds` / `drops` map a player id to the roster that got / lost him, `roster_ids` the rosters involved, `settings.waiver_bid` the FAAB
   bid, `status_updated` when it happened (epoch ms), `draft_picks` the picks of a trade. Only completed transactions count. */
import type { Transaction } from '../../data/types.ts';
import { pts1 } from './format.ts';

export const RECENT_WEEKS = 2;

export interface MovePlayer { pid: string; name: string; pos: string; nfl: string | null; mu: number | null }

export interface Move {
  id: string;
  kind: 'add' | 'drop' | 'swap' | 'trade';
  /** waiver | free_agent | trade */
  type: string;
  week: number;
  /** epoch ms */
  at: number;
  adds: MovePlayer[];
  drops: MovePlayer[];
  /** FAAB bid of a waiver claim, null otherwise */
  bid: number | null;
  /** the other roster of a trade */
  partner: number | null;
  picksIn: string[];
  picksOut: string[];
  text: string;
}

export interface MoveLookup {
  player: (pid: string) => { name: string; pos: string; nfl: string | null; mu?: number | null } | null | undefined;
  teamName: (rid: number) => string;
}

interface RawPick { season?: string | number; round?: number; roster_id?: number; previous_owner_id?: number; owner_id?: number }

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

function playerOf(pid: string, lookup: MoveLookup): MovePlayer {
  const p = lookup.player(pid);
  return { pid, name: p?.name ?? `player ${pid}`, pos: p?.pos ?? '', nfl: p?.nfl ?? null, mu: p?.mu ?? null };
}

const pickText = (p: RawPick) => `${p.season ?? ''} round ${p.round ?? '?'} pick`.trim();

function describe(m: Omit<Move, 'text'>, lookup: MoveLookup): string {
  const showProj = (p: MovePlayer) => `${p.name}${p.mu !== null && p.mu > 0 ? ` (${p.pos.toLowerCase()}, ${pts1(p.mu)} proj)` : ''}`;
  const names = (xs: MovePlayer[]) => xs.map(showProj).join(', ');
  if (m.kind === 'trade') {
    const got = [...m.adds.map(showProj), ...m.picksIn].join(', ') || 'nothing';
    const gave = [...m.drops.map((p) => p.name), ...m.picksOut].join(', ') || 'nothing';
    return `traded with ${m.partner !== null ? lookup.teamName(m.partner) : 'another team'}: got ${got}, gave ${gave}`;
  }
  const bid = m.bid && m.bid > 0 ? ` for $${m.bid}` : '';
  if (m.kind === 'add') return `added ${names(m.adds)}${bid}`;
  if (m.kind === 'drop') return `dropped ${m.drops.map((p) => p.name).join(', ')}`;
  return `added ${names(m.adds)}${bid}, dropped ${m.drops.map((p) => p.name).join(', ')}`;
}

/** The completed moves of roster `rid` in weeks `week - RECENT_WEEKS + 1` to `week`, newest first. */
export function recentMoves(input: { rid: number; week: number; transactions: readonly Transaction[]; lookup: MoveLookup }): Move[] {
  const { rid, week, lookup } = input;
  const out: Move[] = [];
  for (const t of input.transactions) {
    if (t.status !== 'complete') continue;
    const leg = num(t.leg) ?? week;
    if (leg > week || leg <= week - RECENT_WEEKS) continue;
    const addsMap = (t.adds ?? {}) as Record<string, number>, dropsMap = (t.drops ?? {}) as Record<string, number>;
    const adds = Object.keys(addsMap).filter((pid) => addsMap[pid] === rid).map((pid) => playerOf(pid, lookup));
    const drops = Object.keys(dropsMap).filter((pid) => dropsMap[pid] === rid).map((pid) => playerOf(pid, lookup));
    const picks = (Array.isArray(t.draft_picks) ? t.draft_picks : []) as RawPick[];
    const picksIn = picks.filter((p) => p.owner_id === rid && p.previous_owner_id !== rid).map(pickText);
    const picksOut = picks.filter((p) => p.previous_owner_id === rid && p.owner_id !== rid).map(pickText);
    const involved = (t.roster_ids ?? []).includes(rid);
    if (!involved && !adds.length && !drops.length) continue;
    if (!adds.length && !drops.length && !picksIn.length && !picksOut.length) continue;
    const trade = t.type === 'trade';
    const partner = trade ? (t.roster_ids ?? []).find((r) => r !== rid) ?? null : null;
    const settings = (t.settings ?? null) as { waiver_bid?: number } | null;
    const base = {
      id: t.transaction_id, type: t.type, week: leg,
      at: num(t.status_updated) ?? num(t.created) ?? 0,
      kind: trade ? 'trade' as const : adds.length && drops.length ? 'swap' as const : adds.length ? 'add' as const : 'drop' as const,
      adds, drops, bid: t.type === 'waiver' ? num(settings?.waiver_bid) : null, partner, picksIn, picksOut,
    };
    out.push({ ...base, text: describe(base, lookup) });
  }
  return out.sort((a, b) => b.at - a.at);
}
