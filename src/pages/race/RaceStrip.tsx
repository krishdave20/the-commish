import { formatOdds, formatPoints1, ordinal } from '../../app/format';
import { useModel, useScenario } from '../../app/modelContext';
import { teamResult } from '../../app/results';
import { CountUp } from '../../components/CountUp';
import { HeadlineStrip } from '../../components/HeadlineStrip';
import { TierPill } from '../../components/TierPill';
import type { Engine } from '../../engine';
import { useYourPath } from '../home/yourPath';

/** The playoff picture's answer: your odds, your projected seed and your magic number. */
export function RaceStrip({ engine }: { engine: Engine }) {
  const { model } = useModel();
  const { live } = useScenario();
  const y = useYourPath(engine);
  if (!model) return null;
  const res = teamResult(model, live, engine.meRid);
  const des = engine.designations()[engine.meRid];
  const wc = engine.winsToClinch();
  const pending = model.oddsPending && !live;

  const magic = des?.clinch ? { v: '0', sub: `clinched a playoff spot${des.divClinch ? ' and the division' : ''}` }
    : des?.elim ? { v: '—', sub: 'eliminated from the playoffs' }
    : wc.spot === null ? { v: '—', sub: 'no number of your own wins guarantees a spot yet' }
    : { v: String(wc.spot), sub: wc.winOut ? `win all ${wc.open} of your remaining games` : `win ${wc.spot} of your last ${wc.open}` };

  return (
    <HeadlineStrip label="Your playoff picture" items={[
      {
        label: 'your playoff odds',
        value: pending ? <span>…</span> : <span><CountUp value={Math.round(res.playoff * 100)} />%</span>,
        sub: pending ? 'simming the season…' : <><TierPill p={res.playoff} status={des?.clinch ? 'clinched' : des?.elim ? 'eliminated' : undefined} />{' '}{formatOdds(res.title)} title odds · {formatPoints1(res.expW)} exp wins</>,
      },
      { label: 'projected seed', value: <span>{y?.path?.seed ? ordinal(y.path.seed) : y ? '—' : '…'}</span>, sub: y?.path?.bye ? 'with a bye' : 'from the simulation' },
      { label: 'magic number', value: <span>{magic.v}</span>, sub: magic.sub },
    ]} />
  );
}
