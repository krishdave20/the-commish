import { EnginePage } from '../app/EnginePage';
import { formatAsOf, formatCount, formatMoney, formatNum, formatPct, formatPoints, formatPoints1 } from '../app/format';
import { MIN_CAL_SAMPLES } from '../engine';
import type { Engine } from '../engine';
import { PlayDiagram } from '../components/art/PlayDiagram';
import { MarkLegend } from '../components/ClinchMark';
import { Disclosure } from '../components/Disclosure';
import { useGrown } from '../components/motion';
import { LIVE_INTERVAL_MS } from './draft/pickFeed';

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
          <span className="n">{formatNum(v, 2)}</span>
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
      <div className="art-aside">
        <p className="note">
          built from your league’s sleeper data: rosters, schedule, weekly stats, injury tags, and sleeper’s weekly projections through week {meta.maxWeek}.
        </p>
        <PlayDiagram size={44} />
      </div>
      <div className="accordion">
        <Disclosure title="where the data comes from" id="mth-data">
          <p className="note">
            three free public sources and no server of ours. your browser pulls sleeper and fantasycalc itself; nflverse comes through a nightly job.
            nothing here is written by an ai, and the copy that is kept lives only on this device.
          </p>
          <ul className="plain">
            <li><b>sleeper.</b> rosters, schedule, weekly stats, injury tags, projections through week {meta.maxWeek}, drafts, traded picks and playoff brackets, from sleeper’s public api.</li>
            <li><b>nflverse.</b> play-by-play, snap counts and ftn charting. its files do not allow browser access and one is 49 mb, so a github action runs every night, downloads them, joins player ids to sleeper’s and publishes small per-player-week files next to this site. snap and target shares, red-zone shares, the charting splits and the usage-based takes read those files. the route and coverage splits are labeled 2025 until 2026 participation data is published.</li>
            <li><b>fantasycalc.</b> trade and draft values for dynasty and redraft, from its free api. they feed the dynasty trade block, the dynasty and rookie draft rankings and the value movers on the huddle.</li>
            <li><b>player ids.</b> nflverse and sleeper number players differently, so the join runs on the gsis id first, then on name, team and position. whatever cannot be matched is listed on the injury report in the front office.</li>
            <li><b>last pull.</b> {formatAsOf(meta.asOf)}, week {meta.currentWeek} of {meta.lastRegularWeek} regular-season weeks{meta.stale ? ' (some pieces came from the saved copy)' : ''}.</li>
            <li><b>your league’s rules.</b> scoring is {meta.scoring}, with passing-touchdown and tight-end bonuses read from the league settings; roster slots ({meta.slots.join(', ')}), {meta.playoffTeams} playoff teams, {meta.divisions} {meta.divisions === 1 ? 'division' : 'divisions'} and the {formatMoney(meta.waiverBudget)} faab budget all come from the league itself.</li>
            <li><b>player means.</b> sleeper’s projection, scored with those league settings.</li>
          </ul>
        </Disclosure>

        <Disclosure title="projection check" id="mth-check">
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
        </Disclosure>

        <Disclosure title="floors and ceilings" id="mth-bands">
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
                      <td className="n">{formatNum(lo, 2)}</td><td className="n">{formatNum(hi, 2)}</td>
                      <td className="n">{n === undefined ? '—' : n}{n !== undefined && n < MIN_CAL_SAMPLES && <> <span className="pill mute">fallback</span></>}</td>
                      <td className="n">{meta.residualSd[p] === undefined ? '—' : formatPoints1(meta.residualSd[p]!)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">positions with fewer than {MIN_CAL_SAMPLES} samples use fixed fallback ratios.</p>
        </Disclosure>

        <Disclosure title="season simulation" id="mth-sim">
          <p>
            each team’s weekly score is its best lineup’s expected points plus noise of <b>{formatPoints1(meta.teamWeeklySd)}</b> points,
            the spread of real results around projections (×0.85 for the week in progress). the first run is <b>{formatCount(meta.simRuns)}</b> simulated seasons;
            what-ifs re-simulate in a background worker.
          </p>
          <p className="note">
            seeding: {meta.divisions > 0 ? 'division winners first, then wildcards by record, points for breaking ties' : 'by record, points for breaking ties'}.
          </p>
        </Disclosure>

        <Disclosure title="brackets and title odds" id="mth-bracket">
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
        </Disclosure>

        <Disclosure title="clinch marks" id="mth-clinch">
          <p>
            strict math, never simulation. a mark appears only when it is guaranteed whatever the remaining results and whatever the tiebreakers.
            real results plus any playoff-machine picks feed it.
          </p>
          <MarkLegend />
          <p className="note">a division winner never takes a wildcard spot, which the math accounts for.</p>
        </Disclosure>

        <Disclosure title="hot takes" id="mth-takes">
          <p>
            every take is a template filled with real numbers. fixed detectors (usage spike, target hog, buy low, sell high, red-zone role, box-count edge, blitz beater,
            soft schedule, waiver riser, dynasty mover, coverage note) run over the nightly nflverse data, your rosters and the waiver wire. each has a threshold tuned
            on 2025 data, and every card shows how that detector did in the backtest.
          </p>
          <p className="note">
            headlines run twelve words or fewer, every card shows its sample size, no player gets more than three takes a week, and cards on your own players come first.
          </p>
        </Disclosure>

        <Disclosure title="draft room" id="mth-draft">
          <p>
            rankings score sleeper’s season projections with your league’s settings, set a replacement level from the league’s starting slots, rank by value over replacement and cut
            tiers where the gaps are natural. adp comes from the matching sleeper field (ppr, half, standard, 2qb, dynasty or rookie).
          </p>
          <p>
            the mock draft puts you in your real slot; bots draft by adp with some noise and a nudge for roster need, and the grade compares your projected starting lineup
            with the league’s. on the clock polls sleeper every {LIVE_INTERVAL_MS / 1000} seconds during a live draft and shows best available, positional runs, your open slots, who is likely gone
            and each pick against its adp. a finished draft can be replayed pick by pick.
          </p>
        </Disclosure>

        <Disclosure title="dynasty trade block" id="mth-dynasty">
          <p>
            in a dynasty league (or when you explore it in a redraft one) trades are also priced in fantasycalc value, with future picks included: the next draft is priced by early,
            mid or late slot from each pick’s original owner’s projected finish, later drafts by round alone.
          </p>
          <p>
            the contender-or-rebuilder lens scores every team on now (expected points, rest of season) and later (dynasty value), then reads each as a contender (strong now and later),
            all-in (strong now, thin later), retool (weak now, strong later) or rebuilder (weak now and thin later). the trade verdict weighs the value moved against your lens.
          </p>
        </Disclosure>

        <Disclosure title="the nfl page" id="mth-nfl">
          <p>
            scores, clocks and kickoff times come from sleeper’s scores feed, one request per week. the live games ride on the same single poller as game day, so the nfl page adds no polling of its own.
            standings are sums over every final game this season: wins, losses and ties, points for and against, division and conference records, the streak and the last five.
            league leaders add up sleeper’s weekly stat lines (a finished week is kept for a day), and a game’s box score reads the same lines for its two teams.
          </p>
          <p>
            <b>simplified tiebreakers.</b> teams are ordered by win percentage (a tie counts half), then head-to-head among the tied teams, then division record (only when all of them share a division),
            then point differential, then city. the official nfl procedure has more steps (common games, conference record, strength of victory and more), so a close race can differ from the league’s own.
            the playoff picture is “if the season ended today”: the four division leaders take seeds 1 to 4 by record, then the next three best records are the wild cards. it is a snapshot, not a forecast.
          </p>
          <p className="note">“nfl only” hides the fantasy layer (owners, your players, the fantasy sections of a game) and is remembered on this device.</p>
        </Disclosure>

        <Disclosure title="team defenses" id="mth-def">
          <p>
            sleeper marks a team defense’s weekly stat row with games played (gp), not the active-games field players use. the original reference engine only read that field, so a defense never
            got actual points, locked points, calibration samples or matchup grades. this app counts a defense row as played when gp is above zero.
          </p>
          <p className="note">
            on the saved oct 16 league that moves playoff odds by at most 2.7 points (one team; nine of twelve move half a point or less) and leaves the top three waiver adds the same.
            a reference-compatible build still reproduces the original to 0.005 points, and a test holds it there.
          </p>
        </Disclosure>

        <Disclosure title="assumptions" id="mth-assume">
          <ul className="plain">
            <li>other managers set their best lineup from next week on.</li>
            <li>questionable players count at 85%, doubtful at 30%, out at zero for the current week.</li>
            <li>ir players count again four weeks out unless you set a return week.</li>
            <li>trades take effect next week; the weekly lineup optimizer fills fixed slots first, then flex slots.</li>
          </ul>
        </Disclosure>

        <Disclosure title="credits" id="mth-credit">
        <ul className="plain">
          <li>league data: sleeper public api.</li>
          <li>play-by-play and snap data: nflverse. charting data: ftn data via nflverse.</li>
          <li>values: fantasycalc.</li>
        </ul>
        </Disclosure>
      </div>
    </>
  );
}

export default function Method() {
  return <EnginePage page="method">{(engine) => <Body engine={engine} />}</EnginePage>;
}
