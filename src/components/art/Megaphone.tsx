import { Art } from './Art';
import type { ArtProps } from './Art';

/** A cone megaphone with two arcs of sound. */
export function Megaphone(props: ArtProps) {
  return (
    <Art w={52} h={40} defaultSize={44} {...props}>
      <path d="M4.5 16H10L33 6.5V32.5L10 24H4.5Z" />
      <path d="M33 6.5C36.2 13 36.2 26 33 32.5" />
      <path d="M14.5 25L16.6 34H22L20.6 28.6" />
      <path className="art-gold" d="M39.5 14.5C42 18 42 21 39.5 24.5M43.5 10C48 16 48 23 43.5 29" />
    </Art>
  );
}
