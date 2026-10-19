import { Suspense, lazy, useState } from 'react';
import type { Picks } from '../engine';
import type { SeedingMode } from '../components/bracket/assemble';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { PageTabs } from '../components/PageTabs';
import { BlockSkeleton } from '../components/Skeleton';
import { RaceStrip } from './race/RaceStrip';
import { StandingsCard } from './race/StandingsCard';
import { TeamDrawer } from './race/TeamDrawer';

// the brackets, the machine and the odds detail pull in the bracket engine and charts: each is fetched when its tab opens
const BracketCard = lazy(() => import('./race/BracketCard').then((m) => ({ default: m.BracketCard })));
const PlayoffMachine = lazy(() => import('./race/PlayoffMachine').then((m) => ({ default: m.PlayoffMachine })));
const OddsDetail = lazy(() => import('./race/OddsDetail'));

export default function LeagueRace() {
  const [open, setOpen] = useState<number | null>(null);
  // the playoff machine's picks feed the bracket's "from the machine" seeding; they stay while you move between tabs
  const [picks, setPicks] = useState<Picks>({});
  // so is the seeding you chose for the brackets
  const [seeding, setSeeding] = useState<SeedingMode>('projected');
  return (
    <EnginePage page="race">
      {(engine) => (
        <>
          <ScenarioBar />
          <RaceStrip engine={engine} />
          <PageTabs
            label="Playoff picture sections" defaultTab="standings"
            tabs={[
              { value: 'standings', label: 'standings' }, { value: 'brackets', label: 'brackets' },
              { value: 'machine', label: 'playoff machine' }, { value: 'odds', label: 'odds detail' },
            ]}
          >
            {(tab) => tab === 'standings' ? (
              <StandingsCard engine={engine} onOpen={setOpen} />
            ) : (
              <Suspense fallback={<BlockSkeleton height="18rem" />}>
                {tab === 'brackets' ? <BracketCard engine={engine} picks={picks} seeding={seeding} setSeeding={setSeeding} />
                  : tab === 'machine' ? <PlayoffMachine engine={engine} picks={picks} setPicks={setPicks} />
                  : <OddsDetail engine={engine} />}
              </Suspense>
            )}
          </PageTabs>
          <TeamDrawer engine={engine} rid={open} onClose={() => setOpen(null)} />
        </>
      )}
    </EnginePage>
  );
}
