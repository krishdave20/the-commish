import { Art } from './Art';
import type { ArtProps } from './Art';

/** A floodlight tower: a panel of lamps on a mast, with rays of light. */
export function StadiumLights(props: ArtProps) {
  return (
    <Art w={56} h={56} defaultSize={48} {...props}>
      <rect x="13" y="4" width="30" height="17" rx="2.5" />
      <path d="M13 12.5H43M23 4V21M33 4V21" />
      <path d="M28 21V36M28 33L21 53M28 33L35 53M22 53H34M3.5 53.5H52.5" />
      <path className="art-gold" d="M17 25L11 35M28 26V32M39 25L45 35" />
    </Art>
  );
}
