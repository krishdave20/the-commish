import { Art } from './Art';
import type { ArtProps } from './Art';
import { WhistleShape } from './WhistleShape';

/** A referee's whistle with a loop of cord. */
export function Whistle(props: ArtProps) {
  return (
    <Art w={48} h={32} defaultSize={40} {...props}>
      <WhistleShape />
    </Art>
  );
}
