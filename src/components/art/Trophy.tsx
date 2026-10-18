import { Art } from './Art';
import type { ArtProps } from './Art';
import { TrophyShape } from './TrophyShape';

/** A plain cup with two handles and a small star. No league marks. */
export function Trophy(props: ArtProps) {
  return (
    <Art w={40} h={48} defaultSize={36} {...props}>
      <TrophyShape />
    </Art>
  );
}
