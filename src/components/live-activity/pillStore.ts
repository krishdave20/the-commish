import { useSyncExternalStore } from 'react';

/* One bit shared between the live activity and the score ticker (two siblings in the shell): "the live matchup is the pill, on a phone". The phone ticker reads
   it to drop its own pinned "my matchup" score, so the same line is not shown twice along the top. A module-level store rather than a context: the two
   components live in different branches of the shell, and nothing else needs it. */
let showing = false;
const subs = new Set<() => void>();

/** The island sets this while it is showing the live matchup on a phone, and clears it when it stops. */
export function setMatchupPillShowing(on: boolean): void {
  if (on === showing) return;
  showing = on;
  subs.forEach((f) => f());
}

/** Whether the phone pill is showing my live matchup (so the ticker should not pin it too). */
export function useMatchupPillShowing(): boolean {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => showing, () => false);
}
