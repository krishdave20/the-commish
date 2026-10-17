import { useMemo } from 'react';
import { useScenario } from '../../app/modelContext';
import { FEATURE } from '../../app/names';
import { WinsNeededChart } from '../../components/charts/WinsNeededChart';
import type { Engine } from '../../engine';

/** Wins you need (P(playoffs | final wins)) and the clinch line from winsToClinch. */
export function MagicNumber({ engine }: { engine: Engine }) {
  const { live } = useScenario();
  const { divisions } = engine.model.meta;

  const buckets = useMemo(
    () => Object.entries(live?.myHist ?? {}).map(([w, h]) => ({ wins: Number(w), sims: h.n, made: h.made })),
    [live],
  );
  const line = useMemo(() => {
    const des = engine.designations()[engine.meRid];
    const wc = engine.winsToClinch();
    if (des?.clinch) return `magic number: 0. you have clinched a playoff spot${des.divClinch ? ' and the division' : ''}.`;
    if (des?.elim) return 'you have been eliminated from the playoffs.';
    let text: string;
    if (wc.spot === null) text = 'no number of your own wins guarantees a spot yet.';
    else if (wc.winOut) text = `magic number: ${wc.spot}. win all ${wc.open} of your remaining games to clinch a spot.`;
    else text = `magic number: ${wc.spot}. win ${wc.spot} of your last ${wc.open} to clinch a spot.`;
    if (divisions > 0 && wc.div !== null) text += ` win ${wc.div} of your last ${wc.open} to clinch the division.`;
    return text;
  }, [engine, divisions]);

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
