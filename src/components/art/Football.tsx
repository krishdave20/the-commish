import { Art } from './Art';
import type { ArtProps } from './Art';

/** A football on its side, laces up. */
export function Football(props: ArtProps) {
  return (
    <Art w={48} h={32} defaultSize={40} {...props}>
      <path className="art-body" d="M3.5 16C11 2.5 37 2.5 44.5 16C37 29.5 11 29.5 3.5 16Z" />
      <path className="art-gold" d="M10 10.6Q8.6 16 10 21.4M38 10.6Q39.4 16 38 21.4" />
      <path d="M16.5 16H31.5M19.5 13.2V18.8M24 12.8V19.2M28.5 13.2V18.8" />
    </Art>
  );
}
