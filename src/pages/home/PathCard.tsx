import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatOdds, ordinal } from '../../app/format';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE, LOSERS_COPY, PAGES } from '../../app/names';
import { teamResult } from '../../app/results';
import { OddsCell } from '../../components/OddsCell';
import { bracketsFor, orderFor } from '../../components/bracket/assemble';
import { pathOf, type PathInfo } from '../../components/bracket/path';
import { useBracketInputs, useLosersSetting, useSleeperBrackets } from '../../components/bracket/useBracketData';
import { weeksLabel } from '../../components/bracket/copy';
import type { Engine } from '../../engine';

const name = (names: ReadonlyMap<number, string>, rid: number) => names.get(rid) ?? `team ${rid}`;

/** In season: where the signed-in team is headed, projected. Normally the playoff road (seed, first opponent, title odds); a team more
    likely to miss the playoffs than make them gets its road through the non-playoff bracket instead, with a straight face. */
export function PathCard({ engine }: { engine: Engine }) {
  const { model } = useModel();
  const { live } = useScenario();
  const inputs = useBracketInputs(engine);
  const { mode } = useLosersSetting();
  const { losers } = useSleeperBrackets();
  const me = engine.meRid;
  const lc = LOSERS_COPY[mode];

  const info = useMemo(() => {
    if (!model || model.oddsPending) return null;
    const make = (seeding: 'projected' | 'today') => {
      const order = orderFor(seeding, { model, sim: live, picks: {}, means: inputs.ctx.means });
      return bracketsFor(order, inputs.rules, mode, losers);
    };
    const res = teamResult(model, live, me);
    const toiletSide = res.inField > res.playoff;
    let b = make('projected');
    // the projection can seat us on the other side of the cut from the odds; fall back to today's table before giving up
    const here = (x: typeof b) => (toiletSide ? x.field : x.title);
    if (!here(b)?.seeds[me]) b = make('today');
    const bk = here(b);
    const path = bk && bk.seeds[me] ? pathOf(bk, inputs.ctx, me) : null;
    return { res, toiletSide, path, bk };
  }, [model, live, inputs, mode, losers, me]);

  if (!info) {
    return (
      <section className="card" aria-labelledby="path-title">
        <header><div className="micro">{FEATURE.bracketKicker}</div><h2 id="path-title">{FEATURE.yourPath}</h2></header>
        <p className="note" role="status">simming the season for your path…</p>
      </section>
    );
  }
  const { res, toiletSide, path } = info;
  const crowned = mode === 'toilet' ? res.flush : res.consolation;
  const pct = (x: number) => (x > 0 && x < 0.01 ? '<1%' : formatOdds(x));

  return (
    <section className="card" aria-labelledby="path-title">
      <header>
        <div className="micro">{engine.me.team} · {toiletSide ? lc.name : FEATURE.bracketKicker}</div>
        <h2 id="path-title">{FEATURE.yourPath}</h2>
      </header>
      {toiletSide ? (
        <>
          <p className="path-line">
            {mode === 'toilet'
              ? `the odds have you in the toilet bowl (${formatOdds(res.inField)}) before the playoffs (${formatOdds(res.playoff)}). someone has to be the worst team in the league.`
              : `the odds have you in the consolation bracket (${formatOdds(res.inField)}) before the playoffs (${formatOdds(res.playoff)}). there is still a trophy down here.`}
          </p>
          <PathLines path={path} names={inputs.names} toilet={mode === 'toilet'} />
          <div className="stat">
            <span className="micro">{lc.oddsHeader}</span>
            <OddsCell value={crowned} invert={mode === 'toilet'} />
            <span className="note">{mode === 'toilet' ? `${pct(crowned)} to be crowned ${lc.champ}: ${lc.line}.` : `${pct(crowned)} to be ${lc.champ}.`}</span>
          </div>
        </>
      ) : (
        <>
          <PathLines path={path} names={inputs.names} toilet={false} />
          <div className="stat">
            <span className="micro">title odds</span>
            <OddsCell value={res.title} />
            <span className="note">{formatOdds(res.finals)} to reach the final · {formatOdds(res.playoff)} to make the playoffs at all.</span>
          </div>
        </>
      )}
      <p><Link to={PAGES.race.path}>open the full bracket →</Link></p>
    </section>
  );
}

function PathLines({ path, names, toilet }: { path: PathInfo | null; names: ReadonlyMap<number, string>; toilet: boolean }) {
  if (!path) return <p className="note">no projected spot in the bracket yet.</p>;
  const opp = path.opponent;
  const seedLine = path.seed ? `projected seed: ${ordinal(path.seed)}${path.bye ? ', with a bye' : ''}.` : null;
  const when = `round ${path.round}, ${weeksLabel(path.weeks)}`;
  let game: string;
  if (!opp) game = `first game: ${when}, opponent still open.`;
  else if (opp.chance >= 0.995) game = `first game: ${when} against ${name(names, opp.rid)}${opp.seed ? ` (seed ${opp.seed})` : ''}; ${formatOdds(path.advance ?? 0)} ${toilet ? 'to lose it and advance' : 'to win'}.`;
  else game = `first game: ${when}, most likely against ${name(names, opp.rid)}${opp.seed ? ` (seed ${opp.seed})` : ''}, ${formatOdds(opp.chance)} to get there; ${formatOdds(path.advance ?? 0)} ${toilet ? 'to lose it and advance' : 'to win'}.`;
  return (
    <ul className="plain">
      {seedLine && <li className="take">{seedLine}</li>}
      <li className="take">{game}</li>
    </ul>
  );
}
