import { createContext, useContext } from 'react';
import type { Hero, Moment, MomentCtx } from '../../engine/moments';

export interface MomentsValue {
  /** the engine's context, null until there is a league to talk about */
  ctx: MomentCtx | null;
  /** everything current, best first */
  moments: Moment[];
  /** what the live activity may show: live moments and close countdowns, best first */
  ongoing: Moment[];
  hero: Hero | null;
  /** the clock the moments were worked out at (epoch ms; the preview clock when one is set) */
  now: number;
  /** a `?now=` preview is on: the clock is not the real one */
  previewing: boolean;
}

export const NO_MOMENTS: MomentsValue = { ctx: null, moments: [], ongoing: [], hero: null, now: 0, previewing: false };

export const MomentsContext = createContext<MomentsValue | null>(null);

/** The moments for the signed-in league. Outside a provider it is empty (wrap in `MomentsScope`). */
export function useMoments(): MomentsValue {
  return useContext(MomentsContext) ?? NO_MOMENTS;
}

export const useHasMoments = (): boolean => useContext(MomentsContext) !== null;
