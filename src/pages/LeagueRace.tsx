import { useState } from 'react';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { formatNote } from './race/formatNote';
import { MagicNumber } from './race/MagicNumber';
import { PlayoffMachine } from './race/PlayoffMachine';
import { SeedingCard } from './race/SeedingCard';
import { StandingsCard } from './race/StandingsCard';
import { TeamDrawer } from './race/TeamDrawer';

export default function LeagueRace() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <EnginePage page="race">
      {(engine) => (
        <>
          <ScenarioBar />
          <p className="note">{formatNote(engine.model.meta)}</p>
          <StandingsCard engine={engine} onOpen={setOpen} />
          <div className="grid2">
            <SeedingCard engine={engine} />
            <MagicNumber engine={engine} />
          </div>
          <PlayoffMachine engine={engine} />
          <TeamDrawer engine={engine} rid={open} onClose={() => setOpen(null)} />
        </>
      )}
    </EnginePage>
  );
}
