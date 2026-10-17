import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { AlertsCard } from './team/AlertsCard';
import { LabCard } from './team/LabCard';
import { LineupCard } from './team/LineupCard';
import { ProjectionCard } from './team/ProjectionCard';
import { RosterCard } from './team/RosterCard';

export default function MyTeam() {
  return (
    <EnginePage page="team" suffix={(e) => `week ${e.model.meta.currentWeek}`}>
      {(engine) => (
        <>
          <ScenarioBar />
          <RosterCard engine={engine} />
          <div className="grid2">
            <LineupCard engine={engine} />
            <AlertsCard engine={engine} />
          </div>
          <LabCard engine={engine} />
          <ProjectionCard engine={engine} />
        </>
      )}
    </EnginePage>
  );
}
