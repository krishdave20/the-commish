import { Art } from './Art';
import type { ArtProps } from './Art';

/** Uprights, crossbar and the post they stand on. */
export function Goalposts(props: ArtProps) {
  return (
    <Art w={40} h={56} defaultSize={36} {...props}>
      <path className="art-upright" d="M9 3V35M31 3V35" />
      <path className="art-gold" d="M9 35H31" />
      <path d="M20 35V53M13.5 53.5H26.5" />
    </Art>
  );
}
