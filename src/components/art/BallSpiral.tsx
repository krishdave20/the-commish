import { useReducedMotion } from '../motion';
import { Football } from './Football';

/** A football that spirals in and lands, for the moment a mock draft finishes. `play` is true only for the draft that finished while you watched; a draft
    that was already complete when you opened it just shows the ball at rest. With reduced motion the ball is always at rest. */
export function BallSpiral({ play = false, size = 26 }: { play?: boolean; size?: number }) {
  const still = useReducedMotion();
  return (
    <span className="art-spiral" data-motion={play && !still ? 'play' : 'still'} aria-hidden="true">
      <Football size={size} />
    </span>
  );
}
