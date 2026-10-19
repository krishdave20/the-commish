/* Their lineup, read as a scout: the lineup they set against the best lineup their roster allowed.

   Rules (every number is the week's projection, or the points themselves once the week is over):
   - value of a player = his projection for the week as it stands (actual so far + the unplayed share of his expectation); in a review
     (the week is over) it is his actual points;
   - while games are on, a player whose game has kicked off cannot be moved: starters who have played stay in their slot and benched players
     who have played are not available;
   - optimal lineup = the engine's own `optimizeLineup` over everyone on the roster; `left` = optimal - set, never negative. Under
     OPTIMAL_WITHIN (0.05) it counts as optimal;
   - a swap is "they're starting X over Y": a starter the best lineup drops, paired with the bench player who takes his place (same position first);
   - an empty slot, a starter who is out / doubtful / questionable, and a starter on a bye are flagged while their game is still to come;
   - a bench threat is a healthy bench player, not already a swap, whose number is within THREAT_WITHIN (3.0) of the weakest movable starter he could
     replace (in a review: who outscored a starter). */
import { fits, optimizeLineup } from '../lineup.ts';
import type { Slot } from '../types.ts';
import { injuryClass, injuryWords, isLocked, pts1, r1, signed1, slotName, valueOf } from './format.ts';
import type { ScoutPlayer, ScoutTeam } from './types.ts';

export const OPTIMAL_WITHIN = 0.05;
export const THREAT_WITHIN = 3;
export const MAX_THREATS = 3;

export interface Swap {
  /** the slot he sits in now (or, for an empty slot, the slot the bench player would fill) */
  slot: Slot;
  /** the starter the best lineup drops; null when the slot is empty */
  out: ScoutPlayer | null;
  /** the bench player who should be in */
  in: ScoutPlayer;
  /** value(in) - value(out): what the swap adds */
  gain: number;
}

export type NoteKind = 'swap' | 'empty' | 'injury' | 'bye';

/** One line about their lineup: a headshot (`player`) and a sentence. */
export interface LineupNote {
  kind: NoteKind;
  /** high: an empty or dead slot, medium: a real swap or a doubtful starter, low: a questionable starter */
  severity: 'high' | 'medium' | 'low';
  text: string;
  player: ScoutPlayer | null;
  /** points the fix would add (swaps and empty slots), 0 otherwise */
  gain: number;
}

export interface Threat {
  player: ScoutPlayer;
  /** the starter he is closest to replacing */
  against: ScoutPlayer;
  slot: Slot;
  /** value(player) - value(against): negative = behind him */
  gap: number;
  text: string;
}

export interface LineupScout {
  review: boolean;
  /** the team's number for the week now (final: its points) */
  projection: number;
  /** the same with the best lineup the roster allowed */
  optimal: number;
  /** optimal - set, 0 when optimal */
  left: number;
  isOptimal: boolean;
  swaps: Swap[];
  /** slots with nobody in them */
  empties: Slot[];
  notes: LineupNote[];
  threats: Threat[];
}

/** The team's number for the week: its points so far plus what its starters are still expected to add. */
export function teamProjection(team: ScoutTeam): number {
  return r1(team.actual + team.starters.reduce((s, p) => s + (p ? p.projection - p.actual : 0), 0));
}

export function scoutLineup(team: ScoutTeam, opts: { review: boolean }): LineupScout {
  const review = opts.review;
  const v = (p: ScoutPlayer) => valueOf(p, review);
  const set = team.starters.filter((p): p is ScoutPlayer => !!p);
  const startedIds = new Set(set.map((p) => p.pid));
  const all = [...set, ...team.bench];

  const locked = review ? undefined : team.starters.map((p) => (p && isLocked(p) ? p : null));
  const best = optimizeLineup(all, team.slots, {
    value: v, locked,
    unavailable: review ? undefined : (p) => isLocked(p) && !startedIds.has(p.pid),
  });
  const setTotal = set.reduce((s, p) => s + v(p), 0);
  const left = Math.max(0, best.total - setTotal);
  const isOptimal = left < OPTIMAL_WITHIN;

  // swaps: the starters the best lineup drops, matched with the bench players it brings in
  const bestIds = new Set(best.slots.map((s) => s.p?.pid).filter((x): x is string => !!x));
  const ins = best.slots.filter((s) => s.p && !startedIds.has(s.p.pid)).map((s) => ({ p: s.p!, slot: s.slot })).sort((a, b) => v(b.p) - v(a.p));
  const outs = team.starters
    .map((p, i) => ({ p, slot: team.slots[i]! }))
    .filter((x): x is { p: ScoutPlayer; slot: Slot } => !!x.p && !bestIds.has(x.p.pid))
    .sort((a, b) => v(a.p) - v(b.p));
  const swaps: Swap[] = [];
  for (const inn of ins) {
    let k = outs.findIndex((o) => o.p.pos === inn.p.pos);
    if (k < 0) k = outs.findIndex((o) => fits(o.slot, inn.p.pos));
    if (k < 0 && outs.length) k = 0;
    const out = k >= 0 ? outs.splice(k, 1)[0]! : null;
    swaps.push({ slot: out ? out.slot : inn.slot, out: out?.p ?? null, in: inn.p, gain: v(inn.p) - (out ? v(out.p) : 0) });
  }
  swaps.sort((a, b) => b.gain - a.gain);

  const empties = team.slots.filter((_, i) => !team.starters[i]);
  const notes = buildNotes(team, swaps, empties, review);
  const swappedIn = new Set(swaps.map((s) => s.in.pid));
  const threats = threatsOf(team, swappedIn, review);

  return {
    review, projection: teamProjection(team),
    optimal: r1(teamProjection(team) + left), left: r1(left), isOptimal, swaps, empties, notes, threats,
  };
}

function injuryTag(p: ScoutPlayer): string {
  const c = injuryClass(p.injury);
  return c ? ` (${c})` : '';
}

function buildNotes(team: ScoutTeam, swaps: Swap[], empties: Slot[], review: boolean): LineupNote[] {
  const notes: LineupNote[] = [];
  const unit = review ? 'pts' : 'proj';
  const inSwap = new Set<string>();
  const filled: Slot[] = [];

  for (const s of swaps) {
    if (s.out === null) {
      // an empty slot the bench could fill
      filled.push(s.slot);
      notes.push({
        kind: 'empty', severity: 'high', gain: s.gain, player: s.in,
        text: `their ${slotName(s.slot)} slot ${review ? 'was' : 'is'} empty, with ${s.in.name} (${pts1(review ? s.in.actual : s.in.projection)} ${unit}) on the bench`,
      });
      continue;
    }
    if (s.gain < OPTIMAL_WITHIN) continue;
    inSwap.add(s.out.pid);
    const cls = injuryClass(s.out.injury);
    notes.push({
      kind: 'swap', severity: cls === 'out' || s.gain >= 5 ? 'high' : 'medium', gain: s.gain, player: s.out,
      text: review
        ? `they started ${s.out.name} over ${s.in.name} (${signed1(-s.gain)} ${unit})`
        : `they’re starting ${s.out.name}${injuryTag(s.out)} over ${s.in.name} (${signed1(-s.gain)} ${unit})`,
    });
  }
  // empty slots nobody on the bench can fill
  const open = [...empties];
  for (const f of filled) { const i = open.indexOf(f); if (i >= 0) open.splice(i, 1); }
  for (const slot of open) {
    notes.push({ kind: 'empty', severity: 'high', gain: 0, player: null, text: `their ${slotName(slot)} slot ${review ? 'was' : 'is'} empty` });
  }

  if (!review) {
    for (const p of team.starters) {
      if (!p || isLocked(p) || inSwap.has(p.pid)) continue;
      const cls = injuryClass(p.injury);
      if (cls) {
        notes.push({
          kind: 'injury', severity: cls === 'questionable' ? 'low' : cls === 'doubtful' ? 'medium' : 'high', gain: 0, player: p,
          text: `they’re starting ${injuryWords(cls)} ${p.pos.toLowerCase()}: ${p.name}`,
        });
      } else if (p.bye) {
        notes.push({ kind: 'bye', severity: 'high', gain: 0, player: p, text: `they’re starting ${p.name}, who is on a bye` });
      }
    }
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  return notes.sort((a, b) => rank[a.severity] - rank[b.severity] || b.gain - a.gain);
}

/** The bench players who are close to a starter, or in a review, who beat one. */
function threatsOf(team: ScoutTeam, swappedIn: ReadonlySet<string>, review: boolean): Threat[] {
  const v = (p: ScoutPlayer) => valueOf(p, review);
  const movable = team.starters
    .map((p, i) => ({ p, slot: team.slots[i]! }))
    .filter((x): x is { p: ScoutPlayer; slot: Slot } => !!x.p && (review || !isLocked(x.p)));
  const out: Threat[] = [];
  for (const b of team.bench) {
    if (swappedIn.has(b.pid)) continue;
    if (!review && (isLocked(b) || injuryClass(b.injury) === 'out')) continue;
    // the weakest starter he could take over from
    const targets = movable.filter((x) => fits(x.slot, b.pos)).sort((a, c) => v(a.p) - v(c.p));
    const against = targets[0];
    if (!against) continue;
    const gap = v(b) - v(against.p);
    if (review ? gap <= 0 : gap < -THREAT_WITHIN) continue;
    out.push({
      player: b, against: against.p, slot: against.slot, gap: r1(gap),
      text: review
        ? `${b.name} outscored ${against.p.name}: ${pts1(b.actual)} vs ${pts1(against.p.actual)}`
        : `${b.name} is ${gap >= 0 ? `${pts1(gap)} ahead of` : `${pts1(-gap)} behind`} ${against.p.name} at ${slotName(against.slot)}: ${pts1(b.projection)} vs ${pts1(against.p.projection)} proj${b.ceiling != null ? `, ceiling ${pts1(b.ceiling)}` : ''}`,
    });
  }
  return out.sort((a, c) => c.gap - a.gap).slice(0, MAX_THREATS);
}
