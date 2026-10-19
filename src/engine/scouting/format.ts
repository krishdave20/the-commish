/* Number and slot words for the scouting sentences. Lowercase, like the rest of the app. */
import type { ScoutPlayer } from './types.ts';

export const r1 = (x: number) => Math.round(x * 10) / 10;

/** "+4.2" / "−3.1" / "0.0" (a real minus sign, like the hinges table). */
export function signed1(x: number): string {
  const r = r1(x);
  if (r === 0) return '0.0';
  return r > 0 ? `+${r.toFixed(1)}` : `−${Math.abs(r).toFixed(1)}`;
}

export const pts1 = (x: number) => r1(x).toFixed(1);

/** The slot as a manager says it: "qb", "flex", "superflex", "w/t flex". */
export function slotName(slot: string): string {
  switch (slot) {
    case 'FLEX': return 'flex';
    case 'SUPER_FLEX': return 'superflex';
    case 'REC_FLEX': return 'w/t flex';
    case 'WRRB_FLEX': return 'w/r flex';
    case 'IDP_FLEX': return 'idp flex';
    default: return slot.toLowerCase();
  }
}

export type InjuryClass = 'out' | 'doubtful' | 'questionable' | null;

/** Sleeper's designations folded into three: out-ish (out, IR, PUP, suspended, NA), doubtful, questionable. Anything else is healthy. */
export function injuryClass(injury: string | null | undefined): InjuryClass {
  const s = (injury ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'questionable') return 'questionable';
  if (s === 'doubtful') return 'doubtful';
  if (['out', 'ir', 'pup', 'sus', 'suspended', 'na', 'cov'].includes(s)) return 'out';
  return null;
}

/** "a questionable", "a doubtful", "an out". */
export function injuryWords(cls: Exclude<InjuryClass, null>): string {
  return cls === 'out' ? 'an out' : `a ${cls}`;
}

/** The player's value for the scout: his actual points once the week is over (a review), else his projection for the week as it stands. */
export const valueOf = (p: ScoutPlayer, review: boolean) => (review ? p.actual : p.projection);

/** Gone from the lineup market: his game has kicked off, so he cannot be moved in or out. */
export const isLocked = (p: ScoutPlayer) => p.state === 'live' || p.state === 'final';

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
