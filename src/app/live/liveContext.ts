import { createContext, useContext } from 'react';
import type { LiveCtx, LiveSnapshot, LiveState, LiveView, NflGame, ReplaySource, WeekPhase } from '../../engine/live';

export interface LiveValue {
  /** the league can be followed live (a model, and a Sleeper client that has the live endpoints) */
  available: boolean;
  /** waiting for the first snapshot */
  loading: boolean;
  error: string | null;
  /** the week on screen: this week, or last week while a replay runs */
  week: number;
  currentWeek: number;
  ctx: LiveCtx | null;
  state: LiveState;
  snapshot: LiveSnapshot | null;
  view: LiveView | null;
  phase: WeekPhase;
  /** games are on (or a replay is playing): the poller is running at its fast pace */
  live: boolean;
  /** when the data on screen was fetched (epoch ms) */
  asOf: number | null;
  /** the next game that has not kicked off: this week's, or next week's when this one is over */
  nextGame: NflGame | null;
  replay: ReplaySource | null;
  replayLoading: boolean;
  replayError: string | null;
  startReplay: () => Promise<void>;
  stopReplay: () => void;
  /** one poll now */
  refresh: () => Promise<void>;
  /** the game day page tells the provider it is on screen, so polls skip the 30 s cache */
  setOnGameDay: (on: boolean) => void;
}

export const LiveContext = createContext<LiveValue | null>(null);

export function useLive(): LiveValue {
  const v = useContext(LiveContext);
  if (!v) throw new Error('LiveProvider is missing');
  return v;
}

/** Like useLive, but null outside a provider (the nav and the ticker also render in small tests). */
export function useLiveMaybe(): LiveValue | null {
  return useContext(LiveContext);
}
