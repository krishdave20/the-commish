import { useMemo } from 'react';
import { useScenario } from '../../app/modelContext';
import { FEATURE } from '../../app/names';
import { WinsNeededChart } from '../../components/charts/WinsNeededChart';
import type { Engine } from '../../engine';
import { magicLine } from './magicLine';

/** Wins you need (P(playoffs | final wins)) and the clinch line from winsToClinch. */
export function MagicNumber({ engine }: { engine: Engine }) {
  const { live } = useScenario();
  const buckets = useMemo(
    () => Object.entries(live?.myHist ?? {}).map(([w, h]) => ({ wins: Number(w), sims: h.n, made: h.made })),
    [live],
  );
  const line = useMemo(() => magicLine(engine), [engine]);

  return (
    <section className="card" aria-labelledby="magic-title">
      <header>
        <div className="micro">wins you need to clinch</div>
        <h2 id="magic-title">{FEATURE.magic}</h2>
      </header>
      <p className="take">{line}</p>
      {buckets.length > 0 ? <WinsNeededChart buckets={buckets} /> : <p className="note">simming the season for the win-total chart…</p>}
      <p className="note">each bar is the chance of making the playoffs if your team finishes with that many wins; the small number under it is how many simulated seasons ended there.</p>
    </section>
  );
}
