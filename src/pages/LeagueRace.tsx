import { useState } from 'react';
import type { Picks } from '../engine';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { formatNote } from './race/formatNote';
import { BracketCard } from './race/BracketCard';
import { MagicNumber } from './race/MagicNumber';
import { PlayoffMachine } from './race/PlayoffMachine';
import { SeedingCard } from './race/SeedingCard';
import { StandingsCard } from './race/StandingsCard';
import { TeamDrawer } from './race/TeamDrawer';

export default function LeagueRace() {
  const [open, setOpen] = useState<number | null>(null);
  // the playoff machine's picks feed the bracket's "from the machine" seeding
  const [picks, setPicks] = useState<Picks>({});
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
          <BracketCard engine={engine} picks={picks} />
          <PlayoffMachine engine={engine} picks={picks} setPicks={setPicks} />
          <TeamDrawer engine={engine} rid={open} onClose={() => setOpen(null)} />
        </>
      )}
    </EnginePage>
  );
}
