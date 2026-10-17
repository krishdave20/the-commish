import { Link } from 'react-router-dom';
import { formatOdds, formatPoints1 } from '../../app/format';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE, PAGES } from '../../app/names';
import { teamResult } from '../../app/results';
import { ClinchMark } from '../../components/ClinchMark';
import { CountUp } from '../../components/CountUp';
import { OddsCell } from '../../components/OddsCell';
import { TierPill } from '../../components/TierPill';
import type { Engine } from '../../engine';
import { magicLine } from '../race/magicLine';

/** Playoff odds, the clinch mark and the magic number for the signed-in team. */
export function OddsCard({ engine }: { engine: Engine }) {
  const { model } = useModel();
  const { live } = useScenario();
  if (!model) return null;
  const res = teamResult(model, live, engine.meRid);
  const des = engine.designations()[engine.meRid];
  const pending = model.oddsPending && !live;
  return (
    <section className="card" aria-labelledby="odds-title">
      <header>
        <div className="micro">{engine.me.team}</div>
        <h2 id="odds-title">{FEATURE.odds}</h2>
      </header>
      <div className="big-odds">
        <span className="to">{pending ? '…' : <><CountUp value={Math.round(res.playoff * 100)} />%</>}</span>
        <ClinchMark mark={des?.mark} />
        <TierPill p={res.playoff} pending={pending} status={des?.clinch ? 'clinched' : des?.elim ? 'eliminated' : undefined} />
      </div>
      <OddsCell value={res.playoff} pending={pending} />
      <p className="note">
        {pending ? 'simming the season…' : `${formatOdds(res.div)} to win the division · ${formatPoints1(res.expW)} expected wins (${res.winsP10.toFixed(0)} to ${res.winsP90.toFixed(0)})`}
      </p>
      <p className="take">{magicLine(engine)}</p>
      <p><Link to={PAGES.race.path}>open the {PAGES.race.name} →</Link></p>
    </section>
  );
}
