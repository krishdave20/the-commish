import { SectionHeader } from '../../components/SectionHeader';
import { Trophy } from '../../components/art/Trophy';
import type { Almanac, SeasonOutcome } from '../../engine/almanac';
import { managerName } from './text';

function Team({ a, mgr, team, userId }: { a: Almanac; mgr: string; team: string; userId: string | null }) {
  const name = managerName(a, mgr);
  return (
    <>
      <span className="pname">{team}</span>
      {team !== name && <span className="dim sub-note">{name}</span>}
      {userId === mgr && <span className="you">you</span>}
    </>
  );
}

/** Champions and toilet bowl "winners" by season, from the brackets. */
export function Champions({ almanac: a, userId }: { almanac: Almanac; userId: string | null }) {
  const bowl = (o: SeasonOutcome) => o.toilet;
  const anyToilet = a.outcomes.some((o) => o.toilet);
  return (
    <section className="card" aria-labelledby="champs-title">
      <SectionHeader
        id="champs-title" title="champions by season"
        tip="the champion is the winner of the winners bracket’s final. the toilet bowl column is the team that lost every round of a toilet bowl, or, where the league plays a different losers bracket, the team that finished last in the regular season. each row says which."
      />
      <div className="tw">
        <table>
          <caption className="sr-only">Champions and toilet bowl winners by season</caption>
          <thead>
            <tr>
              <th scope="col">season</th>
              <th scope="col">champion</th>
              <th scope="col" className="hide-sm">runner-up</th>
              {anyToilet && <th scope="col">toilet bowl</th>}
            </tr>
          </thead>
          <tbody>
            {a.outcomes.map((o) => (
              <tr key={o.leagueId} className={o.champion?.mgr === userId && userId ? 'me' : undefined}>
                <td className="nowrap">{o.season}</td>
                <td>
                  {o.champion ? (
                    <span className="champ-cell">
                      <Trophy size={18} className="champ-cup" />
                      <Team a={a} mgr={o.champion.mgr} team={o.champion.team} userId={userId} />
                    </span>
                  ) : <span className="dim">{o.complete ? 'not recorded' : 'in progress'}</span>}
                </td>
                <td className="hide-sm">{o.runnerUp ? <Team a={a} mgr={o.runnerUp.mgr} team={o.runnerUp.team} userId={userId} /> : <span className="dim">—</span>}</td>
                {anyToilet && (
                  <td>
                    {bowl(o) ? (
                      <>
                        <Team a={a} mgr={bowl(o)!.mgr} team={bowl(o)!.team} userId={userId} />
                        <span className="dim sub-note">{bowl(o)!.source === 'toilet-bowl' ? 'won the toilet bowl' : 'last in the regular season'}</span>
                      </>
                    ) : <span className="dim">{o.complete ? '—' : 'in progress'}</span>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!a.outcomes.some((o) => o.complete) && (
        <p className="note">no season has finished yet. champions and the toilet bowl appear once the playoffs are done.</p>
      )}
      {a.outcomes.some((o) => o.champion?.source === 'sleeper') && (
        <p className="note">where the bracket is missing, the champion is the winner sleeper recorded for the league.</p>
      )}
    </section>
  );
}
