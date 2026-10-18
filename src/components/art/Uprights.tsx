import { useReducedMotion } from '../motion';
import { Goalposts } from './Goalposts';

/** A pair of gold uprights that rise behind a crowned champion. Decorative: it sits under the text and ignores the pointer. It plays once, about half a
    second, when it mounts (key it by the champion to play it again for a new one); with reduced motion it simply stands there. */
export function Uprights({ size = 40 }: { size?: number }) {
  const still = useReducedMotion();
  return (
    <span className="art-uprights" data-motion={still ? 'still' : 'play'} aria-hidden="true">
      <Goalposts size={size} />
    </span>
  );
}
