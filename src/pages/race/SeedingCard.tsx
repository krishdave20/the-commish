import { useMemo } from 'react';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE } from '../../app/names';
import { teamResult } from '../../app/results';
import { SeedHeatmap } from '../../components/charts/SeedHeatmap';
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
      <header>
        <div className="micro">chance of each final seed</div>
        <h2 id="seeding-title">{FEATURE.seeding}</h2>
      </header>
      {engine.model.oddsPending ? <p className="note" role="status">simming seeding odds…</p> : <SeedHeatmap rows={rows} divisionSeeds={divSeeds} />}
      <p className="note">
        {divSeeds > 0 ? `seeds 1 to ${divSeeds} go to division winners. ` : ''}darker means likelier.
      </p>
    </section>
  );
}
