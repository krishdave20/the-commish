import type { ReactNode } from 'react';
import type { Phase } from '../../data';
import { MomentsContext } from './momentsContext';
import { useHasMoments } from './momentsContext';
import { useBasics, useFullExtras, useMomentsCore } from './useMomentsCore';

function Lite({ phase, children }: { phase: Phase | null; children: ReactNode }) {
  const b = useBasics(phase);
  const value = useMomentsCore(b, null);
  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

function Full({ phase, children }: { phase: Phase | null; children: ReactNode }) {
  const b = useBasics(phase);
  const extras = useFullExtras(b, b.nfl?.week ?? null);
  const value = useMomentsCore(b, extras);
  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

interface Props {
  children: ReactNode;
  /** leave out the heavier pieces (hot takes, rankings, grade): the live activity and the banners do not need them */
  lite?: boolean;
  /** force a phase (the huddle's `?phase=` preview) */
  phase?: Phase | null;
}

/** The moments for the followed league, shared by everything below it: the huddle, the page banners and the live activity.
    Mount it once, inside the live provider (so the live games are there), around the page frame; `MomentsScope` does it on its own where
    nothing above has. */
export function MomentsProvider({ children, lite = false, phase = null }: Props) {
  return lite ? <Lite phase={phase}>{children}</Lite> : <Full phase={phase}>{children}</Full>;
}

/** Uses the moments of a provider above, or starts its own. A page or a component that reads moments wraps itself in this. */
export function MomentsScope({ children, lite = true, phase = null }: Props) {
  const has = useHasMoments();
  // a forced phase needs its own provider: the one above was built for the real phase
  if (has && !phase) return <>{children}</>;
  return <MomentsProvider lite={lite} phase={phase}>{children}</MomentsProvider>;
}
