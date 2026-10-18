import { FEATURE, LOSERS_COPY } from '../../app/names';
import type { LosersPref } from '../../app/prefs';
import { Disclosure } from '../../components/Disclosure';
import { InfoTip } from '../../components/InfoTip';
import { Segmented } from '../../components/Segmented';
import { useLosersSetting } from '../../components/bracket/useBracketData';

const OPTIONS: Array<{ value: LosersPref; label: string }> = [
  { value: 'match', label: 'match my league' },
  { value: 'toilet', label: 'toilet bowl' },
  { value: 'consolation', label: 'consolation' },
];

/** How the non-playoff teams' bracket works: toilet bowl (losers advance, the worst team is crowned) by default. */
export function LosersSection() {
  const { pref, setPref, leagueMode, mode } = useLosersSetting();
  const on = LOSERS_COPY[mode];
  return (
    <Disclosure title={FEATURE.losersSetting} id="set-losers" hint={on.name}>
      <div className="title-row">
        <p>How the teams that miss the playoffs play it out. The odds columns, the huddle and the simulation all follow.</p>
        <InfoTip label="the losers bracket styles">
          <ul className="plain">
            <li><b>match my league.</b> Follow whatever your Sleeper league’s own losers bracket does.</li>
            <li><b>toilet bowl.</b> The loser of each game advances, and the team that loses every round is crowned the worst team. The default.</li>
            <li><b>consolation.</b> The winner advances, like the playoffs, and the best of the rest is crowned.</li>
          </ul>
        </InfoTip>
      </div>
      <Segmented label="Losers bracket style" value={pref} onChange={setPref} options={OPTIONS} />
      <p className="note" role="status">
        your league on sleeper: {leagueMode === 'toilet' ? 'toilet bowl (losers advance)' : leagueMode === 'consolation' ? 'consolation (winners advance)' : 'not published yet'}.
        {' '}showing: {on.name} ({mode === 'toilet' ? 'losers advance' : 'winners advance'}).
      </p>
      {leagueMode === null && (
        <p className="note">Sleeper has no setting for this on the league itself; the app reads it from the shape of the league’s losers bracket once Sleeper publishes one. “match my league” assumes a consolation bracket until then.</p>
      )}
    </Disclosure>
  );
}
