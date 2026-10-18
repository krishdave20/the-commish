import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE, LOSERS_COPY, PAGES } from '../../app/names';
import { Bracket } from '../../components/bracket/Bracket';
import { bracketsFor, fieldOrderFromSleeper, orderFor, titleFromSleeper } from '../../components/bracket/assemble';
import { useBracketInputs, useLosersSetting, useSleeperBrackets } from '../../components/bracket/useBracketData';
import { PageTabs } from '../../components/PageTabs';
import { SectionHeader } from '../../components/SectionHeader';
import { buildBracket, realGamesOf, type Engine } from '../../engine';

/** Postseason: both brackets, one at a time (the championship road first). From Sleeper's own winners bracket when it has one (real results
    locked, the rest open to pick), else the projected one. The non-playoff bracket follows the front-office setting (toilet bowl by default). */
export function PostseasonBrackets({ engine }: { engine: Engine }) {
  const { model } = useModel();
  const { live } = useScenario();
  const inputs = useBracketInputs(engine);
  const { mode, differs, leagueMode } = useLosersSetting();
  const { winners, losers, loading } = useSleeperBrackets();
  const lc = LOSERS_COPY[mode];

  const built = useMemo(() => {
    if (!model || model.oddsPending) return null;
    const projected = orderFor('projected', { model, sim: live, picks: {}, means: inputs.ctx.means });
    const today = orderFor('today', { model, sim: live, picks: {}, means: inputs.ctx.means });
    const sleeperTitle = titleFromSleeper(winners, inputs.rules, today);
    if (sleeperTitle) {
      const fieldOrder = fieldOrderFromSleeper(sleeperTitle, today, mode);
      const field = fieldOrder.length >= 2 ? buildBracket({ kind: mode, seedOrder: fieldOrder, rules: inputs.rules, real: realGamesOf(losers) }) : null;
      return { title: sleeperTitle, field, from: 'sleeper' as const };
    }
    return { ...bracketsFor(projected, inputs.rules, mode, losers), from: 'projected' as const };
  }, [model, live, inputs, winners, losers, mode]);

  if (!built) {
    return (
      <section className="card" aria-labelledby="post-title">
        <SectionHeader id="post-title" title={FEATURE.bracket} kicker={FEATURE.bracketKicker} />
        <p className="note" role="status">{loading ? 'pulling the bracket…' : 'simming the season for the bracket…'}</p>
      </section>
    );
  }
  const caption = built.from === 'sleeper'
    ? 'from sleeper’s bracket: games already played are locked, the rest are yours to pick.'
    : 'sleeper has no bracket yet, so this is the projected one: seeds from the simulation.';
  return (
    <PageTabs
      label="Brackets" defaultTab="ship"
      tabs={[{ value: 'ship', label: FEATURE.bracket }, { value: 'field', label: lc.name }]}
    >
      {(tab) => tab === 'ship' ? (
        <section className="card" aria-labelledby="post-title">
          <SectionHeader id="post-title" title={FEATURE.bracket} kicker={FEATURE.bracketKicker} />
          {built.title
            ? <Bracket key={`ship-${built.from}`} bracket={built.title} ctx={inputs.ctx} names={inputs.names} meRid={engine.meRid} caption={caption} />
            : <p className="note">no playoff bracket yet.</p>}
          <p><Link to={PAGES.race.path}>seed it other ways on the {PAGES.race.name} →</Link></p>
        </section>
      ) : (
        <section className="card" aria-labelledby="post-field-title">
          <SectionHeader id="post-field-title" title={lc.name} kicker={lc.kicker} />
          {built.field
            ? <Bracket key={`field-${built.from}-${mode}`} bracket={built.field} ctx={inputs.ctx} names={inputs.names} meRid={engine.meRid} />
            : <p className="note">{`fewer than two teams miss the playoffs, so there is no ${lc.name}.`}</p>}
          {differs && leagueMode && (
            <p className="br-note">your league’s official losers bracket is a {leagueMode === 'toilet' ? 'toilet bowl' : 'consolation bracket'}. change this in the front office.</p>
          )}
        </section>
      )}
    </PageTabs>
  );
}
