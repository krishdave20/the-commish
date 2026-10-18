import { useMemo } from 'react';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE } from '../../app/names';
import { teamResult } from '../../app/results';
import { SeedHeatmap } from '../../components/charts/SeedHeatmap';
import { SectionHeader } from '../../components/SectionHeader';
import { BlockSkeleton } from '../../components/Skeleton';
import type { Engine } from '../../engine';

export function SeedingCard({ engine }: { engine: Engine }) {
  const { live } = useScenario();
  const { model } = useModel();
  const { divisions, playoffTeams } = engine.model.meta;
  const rows = useMemo(
    () => (model ? model.teams.map((t) => ({ id: t.rid, team: t.team, seeds: teamResult(model, live, t.rid).seeds, isMe: t.rid === engine.meRid })) : []),
    [model, live, engine.meRid],
  );
  const divSeeds = Math.min(divisions, playoffTeams);
  return (
    <section className="card" aria-labelledby="seeding-title">
      <SectionHeader
        id="seeding-title" title={FEATURE.seeding}
        tip={`chance of each final seed. ${divSeeds > 0 ? `seeds 1 to ${divSeeds} go to division winners. ` : ''}darker means likelier.`}
      />
      {engine.model.oddsPending ? (
        <>
          <p className="note" role="status">simming seeding odds…</p>
          <BlockSkeleton height={`${(rows.length || 12) * 1.625 + 4}rem`} />
        </>
      ) : <SeedHeatmap rows={rows} divisionSeeds={divSeeds} />}
    </section>
  );
}
