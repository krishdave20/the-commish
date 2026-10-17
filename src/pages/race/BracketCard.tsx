import { useEffect, useMemo, useState } from 'react';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE, LOSERS_COPY } from '../../app/names';
import { Segmented } from '../../components/Segmented';
import { Bracket } from '../../components/bracket/Bracket';
import { bracketsFor, orderFor, SEEDING_LABEL, type SeedingMode } from '../../components/bracket/assemble';
import { useBracketInputs, useLosersSetting, useSleeperBrackets } from '../../components/bracket/useBracketData';
import type { Engine, Picks } from '../../engine';

const NOTE: Record<SeedingMode, string> = {
  today: 'seeds from today’s standings: division winners first, then the wildcards by record, points for breaking ties.',
  projected: 'each team’s most likely seed from the simulation, filled from the likeliest pairing down so no two teams share a seed.',
  machine: 'seeds from your playoff machine picks below; any game you have not picked goes to the favorite.',
};

type Which = 'ship' | 'field';

/** True when the viewport is wide enough to set the two brackets side by side (jsdom, with no matchMedia, is "narrow"). */
function useWide(): boolean {
  const query = '(min-width: 1100px)';
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return wide;
}

/** The championship bracket and the non-playoff bracket, seeded three ways, with live title and flush odds. */
export function BracketCard({ engine, picks }: { engine: Engine; picks: Picks }) {
  const { model } = useModel();
  const { live } = useScenario();
  const inputs = useBracketInputs(engine);
  const { mode, leagueMode, differs } = useLosersSetting();
  const { losers } = useSleeperBrackets();
  const [seeding, setSeeding] = useState<SeedingMode>('projected');
  const [which, setWhich] = useState<Which>('ship');
  const wide = useWide();
  const lc = LOSERS_COPY[mode];

  const order = useMemo(
    () => (model ? orderFor(seeding, { model, sim: live, picks, means: inputs.ctx.means }) : []),
    [model, seeding, live, picks, inputs.ctx.means],
  );
  const brackets = useMemo(() => bracketsFor(order, inputs.rules, mode, losers), [order, inputs.rules, mode, losers]);
  if (!model || engine.model.oddsPending && seeding === 'projected') {
    return (
      <section className="card" aria-labelledby="bracket-title">
        <header><div className="micro">{FEATURE.bracketKicker}</div><h2 id="bracket-title">{FEATURE.bracket}</h2></header>
        <p className="note" role="status">simming the season for the projected seeds…</p>
      </section>
    );
  }

  const showShip = wide || which === 'ship', showField = wide || which === 'field';
  return (
    <div className="stack" id="bracket">
      <div className="row">
        <span className="micro">seed the brackets</span>
        <Segmented label="Bracket seeding" value={seeding} onChange={setSeeding} options={(Object.keys(SEEDING_LABEL) as SeedingMode[]).map((v) => ({ value: v, label: SEEDING_LABEL[v] }))} />
        {!wide && (
          <Segmented
            label="Which bracket" value={which} onChange={setWhich}
            options={[{ value: 'ship', label: 'the ’ship' }, { value: 'field', label: lc.name }]}
          />
        )}
      </div>
      <p className="note">{NOTE[seeding]}</p>
      <div className={`br-pair${wide ? ' wide' : ''}`}>
        {showShip && (
          <section className="card" aria-labelledby="bracket-title">
            <header>
              <div className="micro">{FEATURE.bracketKicker}</div>
              <h2 id="bracket-title">{FEATURE.bracket}</h2>
            </header>
            {brackets.title
              ? <Bracket key={`ship-${seeding}`} bracket={brackets.title} ctx={inputs.ctx} names={inputs.names} meRid={engine.meRid} />
              : <p className="note">fewer than two teams make the playoffs, so there is no bracket.</p>}
          </section>
        )}
        {showField && (
          <section className="card" aria-labelledby="field-title">
            <header>
              <div className="micro">{lc.kicker}</div>
              <h2 id="field-title">{lc.name}</h2>
            </header>
            {brackets.field
              ? <Bracket key={`field-${seeding}-${mode}`} bracket={brackets.field} ctx={inputs.ctx} names={inputs.names} meRid={engine.meRid} />
              : <p className="note">{`fewer than two teams miss the playoffs, so there is no ${lc.name}.`}</p>}
            {differs && leagueMode && (
              <p className="br-note">your league’s official losers bracket is a {leagueMode === 'toilet' ? 'toilet bowl' : 'consolation bracket'}. change this in the front office.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
