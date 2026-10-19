import { useEffect, useSyncExternalStore } from 'react';
import type { NfGame } from '../../engine/nfl';
import { cityOf } from '../../engine/nfl';
import { redZoneTeam } from './liveLogic';

/** how long a "+7" chip stays on a score */
export const FLASH_MS = 3_000;
/** how long a game counts as "just entered the red zone" (the wipe is under 400 ms; the rest is margin for a slow frame) */
export const ENTER_MS = 1_200;
/** a game seen longer ago than this is not compared: after a long absence a changed score is news from the past, not a play just made */
export const FRESH_MS = 3 * 60_000;

export interface Flash {
  side: 'home' | 'away';
  /** points just scored */
  delta: number;
  /** changes every time, so the animation restarts */
  key: string;
}

interface Seen { home: number; away: number; red: boolean; at: number }
/** the last scores seen for each game, kept for the whole session (a module, not component state, so a visit to another page does not forget them) */
const memory = new Map<string, Seen>();

export interface LiveChanges {
  /** a score that went up between two polls, by game id */
  flashes: Readonly<Record<string, Flash>>;
  /** games that just entered the red zone */
  entered: ReadonlySet<string>;
  /** one sentence for a polite live region: "lar scored 7: lar 21, ari 14" */
  said: string;
}

const NONE: Readonly<Record<string, Flash>> = {};
const NO_SET: ReadonlySet<string> = new Set();
const EMPTY: LiveChanges = { flashes: NONE, entered: NO_SET, said: '' };

/* The changes live in a small module store rather than in component state: a flash is a reaction to data arriving, which is an outside event, and
   the page reads it with useSyncExternalStore. It also means the chip's three seconds run on even if the tab is switched and switched back. */
let current: LiveChanges = EMPTY;
const listeners = new Set<() => void>();
const timers = new Set<ReturnType<typeof setTimeout>>();
const set = (next: LiveChanges) => { current = next; for (const l of listeners) l(); };
const later = (fn: () => void, ms: number) => {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
};
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test hook: forget every game seen and every flash. */
export function resetLiveMemory(): void {
  memory.clear();
  for (const t of timers) clearTimeout(t);
  timers.clear();
  current = EMPTY;
}

/** Compare these games with the last ones seen. */
function observe(games: readonly NfGame[]): void {
  const now = Date.now();
  const newFlash: Record<string, Flash> = {};
  const newIn: string[] = [];
  const words: string[] = [];
  for (const g of games) {
    if (g.state === 'pre' || g.homeScore === null || g.awayScore === null) continue;
    const red = redZoneTeam(g) !== null;
    const prev = memory.get(g.id);
    memory.set(g.id, { home: g.homeScore, away: g.awayScore, red, at: now });
    if (!prev || now - prev.at > FRESH_MS) continue;
    for (const side of ['away', 'home'] as const) {
      const delta = side === 'home' ? g.homeScore - prev.home : g.awayScore - prev.away;
      if (delta > 0) {
        newFlash[g.id] = { side, delta, key: `${g.id}:${side}:${side === 'home' ? g.homeScore : g.awayScore}` };
        words.push(`${cityOf(side === 'home' ? g.home : g.away).toLowerCase()} scored ${delta}: ${g.away.toLowerCase()} ${g.awayScore}, ${g.home.toLowerCase()} ${g.homeScore}`);
      }
    }
    if (red && !prev.red) newIn.push(g.id);
  }
  if (Object.keys(newFlash).length) {
    set({ ...current, flashes: { ...current.flashes, ...newFlash }, said: words.join('. ') });
    for (const [id, fl] of Object.entries(newFlash)) {
      later(() => {
        if (current.flashes[id]?.key !== fl.key) return;
        const { [id]: _gone, ...rest } = current.flashes;
        set({ ...current, flashes: rest });
      }, FLASH_MS);
    }
  }
  if (newIn.length) {
    set({ ...current, entered: new Set([...current.entered, ...newIn]) });
    later(() => { const n = new Set(current.entered); for (const id of newIn) n.delete(id); set({ ...current, entered: n }); }, ENTER_MS);
  }
}

/** Watches the games the shared poller brings (it adds no poller of its own) and notices two things between polls: a team's score going up,
    and a game newly entering the red zone. Each lasts a moment and clears itself. A game seen for the first time, or not seen for a few minutes,
    is only remembered. */
export function useLiveChanges(games: readonly NfGame[] | null): LiveChanges {
  useEffect(() => {
    if (games) observe(games);
  }, [games]);
  return useSyncExternalStore(subscribe, () => current, () => EMPTY);
}
