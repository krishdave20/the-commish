import type { Engine } from '../../engine';
import { MagicNumber } from './MagicNumber';
import { SeedingCard } from './SeedingCard';

/** The odds detail tab: seeding odds and the magic number. Its own chunk, so the heatmap and the charts load only when the tab opens. */
export default function OddsDetail({ engine }: { engine: Engine }) {
  return (
    <div className="grid2">
      <SeedingCard engine={engine} />
      <MagicNumber engine={engine} />
    </div>
  );
}
