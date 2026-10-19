import { useEffect, useRef, useState } from 'react';
import { bigMomentText, bigMoments } from '../../engine/moments';
import type { RawChange } from '../../engine/live';

export interface Flash { /** "+6.4 · chase" */ text: string; at: number }

/** How long the flash holds before the pill settles. */
export const FLASH_MS = 4500;

/** A big moment for my team: a poll in which my score jumped by 6 points or more (a rule on the delta alone, so it never says what kind of play it
    was). Only polls that arrive after this hook mounted count (the history already in the feed is not news); the flash holds for a few seconds and clears. */
export function useBigMoment(changes: readonly RawChange[], rid: number | null, nameOf: (pid: string) => string): Flash | null {
  const seen = useRef(changes.reduce((m, c) => Math.max(m, c.at), 0));
  const [flash, setFlash] = useState<Flash | null>(null);
  const names = useRef(nameOf);
  useEffect(() => { names.current = nameOf; });

  useEffect(() => {
    const newest = changes.reduce((m, c) => Math.max(m, c.at), 0);
    if (rid !== null) {
      const found = bigMoments(changes, rid, seen.current)[0];
      if (found) setFlash({ text: bigMomentText(found, names.current(found.pid)), at: found.at });
    }
    // everything up to the newest poll has been looked at, a big moment or not (a feed that started over is a lower number, not a reason to rewind)
    if (newest > seen.current) seen.current = newest;
  }, [changes, rid]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(id);
  }, [flash]);

  return flash;
}
