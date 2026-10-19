import { createContext, useContext, useMemo } from 'react';
import { useLiveMaybe } from '../../../app/live/liveContext';
import { gamesByTeam } from '../../../engine/live';
import type { NflGame } from '../../../engine/live';

/** The NFL games of the week on screen by team code. Game day provides it for whatever week it shows (a past week, a replay); without it the live
    poller's current week is used. */
export const GamesContext = createContext<ReadonlyMap<string, NflGame> | null>(null);

export function useGameFor(team: string | null | undefined): NflGame | null {
  const given = useContext(GamesContext);
  const live = useLiveMaybe();
  const snap = live && !live.replay ? live.snapshot : null;
  const map = useMemo(() => given ?? (snap ? gamesByTeam(snap.games) : null), [given, snap]);
  return team && map ? map.get(team) ?? null : null;
}
