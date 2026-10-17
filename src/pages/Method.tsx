import { EnginePage } from '../app/EnginePage';
import { formatAsOf, formatCount, formatPct, formatPoints, formatPoints1 } from '../app/format';
import { MIN_CAL_SAMPLES } from '../engine';
import type { Engine } from '../engine';
import { MarkLegend } from '../components/ClinchMark';
import { useGrown } from '../components/motion';

/** Offline bake-off from SPEC section 5: mean absolute error of each approach on held-out weeks 4 and 5. */
const BAKE_OFF: Array<[string, number]> = [
  ['sleeper projection', 4.39],
  ['projection + gbm fix', 4.43],
  ['shrink to season average', 4.47],
  ['gradient boosting', 4.68],
];

function Bars() {
  const grown = useGrown();
  const mx = Math.max(...BAKE_OFF.map(([, v]) => v));
  return (
    <div className="stack" role="list" aria-label="Offline projection check">
      {BAKE_OFF.map(([name, v], k) => (
        <div className="oddcell" key={name} role="listitem" style={{ gridTemplateColumns: '12em 1fr 3em' }}>
          <span>{name}</span>
          <div className={k ? 'bar gold' : 'bar'} aria-hidden="true"><i style={{ width: `${grown ? (100 * v) / mx : 0}%` }} /></div>
          <span className="n">{v.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function Body({ engine }: { engine: Engine }) {
  const { meta } = engine.model;
  const positions = Object.keys(meta.floorCeil);
  return (
    <>
      <p className="note">
        built from your league’s sleeper data: rosters, schedule, weekly stats, injury tags, and sleeper’s weekly projections through week {meta.maxWeek}.
      </p>
      <div className="grid2">
        <section className="card" aria-labelledby="mth-data">
          <header><h2 id="mth-data">where the data comes from</h2></header>
          <p className="note">
            everything here is pulled from sleeper’s public api by your own browser. no account, no server; the copy that is kept lives only on this device.
          </p>
          <ul className="plain">
            <li><b>last pull.</b> {formatAsOf(meta.asOf)}, week {meta.currentWeek} of {meta.lastRegularWeek} regular-season weeks{meta.stale ? ' (some pieces came from the saved copy)' : ''}.</li>
            <li><b>your league’s rules.</b> scoring is {meta.scoring}, with passing-touchdown and tight-end bonuses read from the league settings; roster slots ({meta.slots.join(', ')}), {meta.playoffTeams} playoff teams, {meta.divisions} {meta.divisions === 1 ? 'division' : 'divisions'} and the ${formatCount(meta.waiverBudget)} faab budget all come from the league itself.</li>
            <li><b>player means.</b> sleeper’s projection, scored with those league settings.</li>
          </ul>
        </section>

        <section className="card" aria-labelledby="mth-check">
          <header><h2 id="mth-check">projection check</h2></header>
          <p className="note">
            {meta.maeProjection !== null
              ? `in this league, sleeper’s projection missed by ${formatPoints(meta.maeProjection)} points per player on average over weeks ${meta.calibrationWeeks.join(', ') || '—'}, scored with your league’s settings.`
              : 'not enough finished weeks yet to measure how far off sleeper’s projection is in this league.'}
          </p>
          <h3>offline bake-off, held-out weeks 4 and 5</h3>
          <Bars />
          <p className="note">
            mean absolute error in points. gradient boosting on form, snap share and matchup, a residual correction and a season-average blend all missed by more than the projection,
            so player means use the projection and the modeling goes where it holds up: floors and ceilings, matchup grades and the season simulation.
          </p>
        </section>

        <section className="card" aria-labelledby="mth-bands">
          <header><h2 id="mth-bands">floors and ceilings</h2></header>
          <p>
            20th and 80th percentile of actual-to-projected points by position over the last finished weeks.
            held out on the latest week, they caught{' '}
            <b>{meta.bandCoverage !== null ? formatPct(meta.bandCoverage, 1) : 'n/a'}</b> of outcomes against a 60% target.
          </p>
          <div className="tw">
            <table>
              <caption className="sr-only">Floor and ceiling calibration by position</caption>
              <thead>
                <tr><th scope="col">pos</th><th scope="col" className="n">floor ×</th><th scope="col" className="n">ceiling ×</th><th scope="col" className="n">samples</th><th scope="col" className="n">residual sd</th></tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const [lo, hi] = meta.floorCeil[p]!;
                  const n = meta.ratioSamples[p];
                  return (
                    <tr key={p}>
                      <td className="pname">{p}</td>
                      <td className="n">{lo.toFixed(2)}</td><td className="n">{hi.toFixed(2)}</td>
                      <td className="n">{n === undefined ? '—' : n}{n !== undefined && n < MIN_CAL_SAMPLES && <> <span className="pill mute">fallback</span></>}</td>
                      <td className="n">{meta.residualSd[p] === undefined ? '—' : formatPoints1(meta.residualSd[p]!)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">positions with fewer than {MIN_CAL_SAMPLES} samples use fixed fallback ratios.</p>
        </section>

        <section className="card" aria-labelledby="mth-sim">
          <header><h2 id="mth-sim">season simulation</h2></header>
          <p>
            each team’s weekly score is its best lineup’s expected points plus noise of <b>{formatPoints1(meta.teamWeeklySd)}</b> points,
            the spread of real results around projections (×0.85 for the week in progress). the first run is <b>{formatCount(meta.simRuns)}</b> simulated seasons;
            what-ifs re-simulate in a background worker.
          </p>
          <p className="note">
            seeding: {meta.divisions > 0 ? 'division winners first, then wildcards by record, points for breaking ties' : 'by record, points for breaking ties'}.
          </p>
        </section>

        <section className="card" aria-labelledby="mth-bracket">
          <header><h2 id="mth-bracket">brackets and title odds</h2></header>
          <p>
            the bracket is built from the seeds and your league’s own playoff settings: byes for the top seeds when the field is not a power of two
            ({meta.playoffTeams} teams here), the usual 1v8, 4v5, 3v6, 2v7 pairings, and reseeding if the league reseeds. each round is scored like a regular-season
            game, from each team’s expected lineup points in the round’s playoff week and the same weekly spread; a two-week round adds the two weeks’ points and
            the variances. the title odds on the bracket are exact (every possible set of results is walked), so they add to 100% and move cleanly as you pick.
          </p>
          <p>
            the standings’ title column comes from the season simulation: after every simulated regular season is seeded, its playoffs are played too, with the same
            random stream, drawn after the regular season so no regular-season number moves. the non-playoff teams get a bracket as well: in the toilet bowl the loser of
            each game advances and the team that loses every round is crowned the worst team; in the consolation style the winner advances. you choose in the front office.
          </p>
          <p className="note">when sleeper has published a bracket, real results are locked into it and only the open games are yours to pick.</p>
        </section>

        <section className="card" aria-labelledby="mth-clinch">
          <header><h2 id="mth-clinch">clinch marks</h2></header>
          <p>
            strict math, never simulation. a mark appears only when it is guaranteed whatever the remaining results and whatever the tiebreakers.
            real results plus any playoff-machine picks feed it.
          </p>
          <MarkLegend />
          <p className="note">a division winner never takes a wildcard spot, which the math accounts for.</p>
        </section>

        <section className="card" aria-labelledby="mth-assume">
          <header><h2 id="mth-assume">assumptions</h2></header>
          <ul className="plain">
            <li>other managers set their best lineup from next week on.</li>
            <li>questionable players count at 85%, doubtful at 30%, out at zero for the current week.</li>
            <li>ir players count again four weeks out unless you set a return week.</li>
            <li>trades take effect next week; the weekly lineup optimizer fills fixed slots first, then flex slots.</li>
          </ul>
        </section>
      </div>
      <section className="card" aria-labelledby="mth-credit">
        <header><h2 id="mth-credit">credits</h2></header>
        <ul className="plain">
          <li>league data: sleeper public api.</li>
          <li>play-by-play and snap data: nflverse. charting data: ftn data via nflverse (arrives in milestone 3).</li>
          <li>values: fantasycalc (arrives in milestone 5).</li>
        </ul>
      </section>
    </>
  );
}

export default function Method() {
  return <EnginePage page="method">{(engine) => <Body engine={engine} />}</EnginePage>;
}
