import { Art } from './Art';
import type { ArtProps } from './Art';
import { PlayDiagramShape } from './PlayDiagramShape';

/** A clipboard with X's, O's and route arrows. */
export function PlayDiagram(props: ArtProps) {
  return (
    <Art w={56} h={64} defaultSize={48} {...props}>
      <PlayDiagramShape />
    </Art>
  );
}
