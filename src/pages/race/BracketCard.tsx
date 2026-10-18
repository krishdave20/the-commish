import { useMemo, useState } from 'react';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE, LOSERS_COPY } from '../../app/names';
import { InfoTip } from '../../components/InfoTip';
import { SectionHeader } from '../../components/SectionHeader';
import { Segmented } from '../../components/Segmented';
import { BlockSkeleton } from '../../components/Skeleton';
import { useMediaQuery } from '../../components/useMediaQuery';
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

/** Wide enough to set the two brackets side by side (jsdom, with no matchMedia, is "narrow"). */
const WIDE = '(min-width: 1100px)';

/** The championship bracket and the non-playoff bracket, seeded three ways, with live title and flush odds. */
export function BracketCard({ engine, picks, seeding, setSeeding }: { engine: Engine; picks: Picks; seeding: SeedingMode; setSeeding: (m: SeedingMode) => void }) {
  const { model } = useModel();
  const { live } = useScenario();
  const inputs = useBracketInputs(engine);
  const { mode, leagueMode, differs } = useLosersSetting();
  const { losers } = useSleeperBrackets();
  const [which, setWhich] = useState<Which>('ship');
  const wide = useMediaQuery(WIDE);
  const lc = LOSERS_COPY[mode];

  const order = useMemo(
    () => (model ? orderFor(seeding, { model, sim: live, picks, means: inputs.ctx.means }) : []),
    [model, seeding, live, picks, inputs.ctx.means],
  );
  const brackets = useMemo(() => bracketsFor(order, inputs.rules, mode, losers), [order, inputs.rules, mode, losers]);
  if (!model || engine.model.oddsPending && seeding === 'projected') {
    return (
      <section className="card" aria-labelledby="bracket-title">
        <SectionHeader id="bracket-title" title={FEATURE.bracket} kicker={FEATURE.bracketKicker} />
        <p className="note" role="status">simming the season for the projected seeds…</p>
        <BlockSkeleton height="22rem" />
      </section>
    );
  }

  const showShip = wide || which === 'ship', showField = wide || which === 'field';
  // two brackets side by side only when both are small: a full eight-team bracket needs the whole row, so a wide screen stacks them
  const sideBySide = wide && (brackets.title?.rounds ?? 0) <= 2 && (brackets.field?.rounds ?? 0) <= 2;
  return (
    <div className="stack" id="bracket">
 <div className="row">
        <span className="title-row"><span className="micro">seed the brackets</span><InfoTip label="seeding">{NOTE[seeding]}</InfoTip></span>
        <Segmented label="Bracket seeding" value={seeding} onChange={setSeeding} options={(Object.keys(SEEDING_LABEL) as SeedingMode[]).map((v) => ({ value: v, label: SEEDING_LABEL[v] }))} />
        {!wide && (
          <Segmented
            label="Which bracket" value={which} onChange={setWhich}
            options={[{ value: 'ship', label: 'the ’ship' }, { value: 'field', label: lc.name }]}
          />
        )}
      </div>
      <div className={`br-pair${sideBySide ? ' wide' : ''}`}>
        {showShip && (
          <section className="card" aria-labelledby="bracket-title">
            <SectionHeader id="bracket-title" title={FEATURE.bracket} kicker={FEATURE.bracketKicker} />
            {brackets.title
              ? <Bracket key={`ship-${seeding}`} bracket={brackets.title} ctx={inputs.ctx} names={inputs.names} meRid={engine.meRid} />
              : <p className="note">fewer than two teams make the playoffs, so there is no bracket.</p>}
          </section>
        )}
        {showField && (
          <section className="card" aria-labelledby="field-title">
            <SectionHeader id="field-title" title={lc.name} kicker={lc.kicker} />
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
