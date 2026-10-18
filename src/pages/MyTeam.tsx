import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { Disclosure } from '../components/Disclosure';
import { PageTabs } from '../components/PageTabs';
import { AlertsCard } from './team/AlertsCard';
import { LabCard } from './team/LabCard';
import { LineupCard } from './team/LineupCard';
import { ProjectionCard } from './team/ProjectionCard';
import { RosterCard } from './team/RosterCard';
import { TeamStrip } from './team/TeamStrip';

export default function MyTeam() {
  return (
    <EnginePage page="team" suffix={(e) => `week ${e.model.meta.currentWeek}`}>
      {(engine) => (
        <>
          <ScenarioBar />
          <TeamStrip engine={engine} />
          <PageTabs
            label="Locker room sections" defaultTab="lineup"
            tabs={[{ value: 'lineup', label: 'lineup' }, { value: 'roster', label: 'roster' }, { value: 'lab', label: 'the lab' }]}
          >
            {(tab) => tab === 'lineup' ? (
              <>
                <LineupCard engine={engine} />
                <AlertsCard engine={engine} />
                <Disclosure title="weekly projection" hint="expected points, floor to ceiling">
                  <ProjectionCard engine={engine} />
                </Disclosure>
              </>
            ) : tab === 'roster' ? <RosterCard engine={engine} />
            : <LabCard engine={engine} />}
          </PageTabs>
        </>
      )}
    </EnginePage>
  );
}
