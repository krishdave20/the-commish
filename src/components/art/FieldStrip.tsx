import { Art } from './Art';
import type { ArtProps } from './Art';
import { FieldMarks } from './FieldMarks';

/** A top-down slice of field: end zones, yard lines, hash marks, and a ball with a short drive ahead of it. */
export function FieldStrip(props: ArtProps) {
  return (
    <Art w={120} h={30} defaultSize={160} {...props}>
      <rect className="art-edge" x="0.7" y="0.7" width="118.6" height="28.6" rx="3" />
      <FieldMarks h={30} />
      <ellipse className="art-body" cx="38" cy="15" rx="3.6" ry="2.1" />
      <path className="art-green" d="M44.5 15H66M62.2 12.4L66.2 15L62.2 17.6" />
    </Art>
  );
}
