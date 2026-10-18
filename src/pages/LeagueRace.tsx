import { useState } from 'react';
import type { Picks } from '../engine';
import type { SeedingMode } from '../components/bracket/assemble';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { PageTabs } from '../components/PageTabs';
import { BracketCard } from './race/BracketCard';
import { MagicNumber } from './race/MagicNumber';
import { PlayoffMachine } from './race/PlayoffMachine';
import { RaceStrip } from './race/RaceStrip';
import { SeedingCard } from './race/SeedingCard';
import { StandingsCard } from './race/StandingsCard';
import { TeamDrawer } from './race/TeamDrawer';

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
            ) : tab === 'brackets' ? <BracketCard engine={engine} picks={picks} seeding={seeding} setSeeding={setSeeding} />
            : tab === 'machine' ? <PlayoffMachine engine={engine} picks={picks} setPicks={setPicks} />
            : (
              <div className="grid2">
                <SeedingCard engine={engine} />
                <MagicNumber engine={engine} />
              </div>
            )}
          </PageTabs>
          <TeamDrawer engine={engine} rid={open} onClose={() => setOpen(null)} />
        </>
      )}
    </EnginePage>
  );
}
