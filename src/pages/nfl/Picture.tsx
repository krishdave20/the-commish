import { SectionHeader } from '../../components/SectionHeader';
import { NFL_COPY } from '../../app/names';
import { formatPct, formatWlt, playoffPicture } from '../../engine/nfl';
import type { Conference, Standings } from '../../engine/nfl';
import { TeamCell } from './TeamCell';
import { signedDiff } from './format';

interface Props { standings: Standings; conference: Conference }

/** The seven teams in a conference "if the season ended today": four division leaders, then three wild cards, then the first three out. */
export function PictureView({ standings, conference }: Props) {
  const pic = playoffPicture(standings, conference);
  const any = standings.started;
  return (
    <section className="card" aria-labelledby="nf-pp-title">
      <SectionHeader
        id="nf-pp-title" title={`${conference.toLowerCase()} playoff picture`} kicker={NFL_COPY.ifToday}
        tip={<>
          <p>{NFL_COPY.tiebreakNote}.</p>
          <p>the four division leaders take seeds 1 to 4, ordered by record, so a division winner always ranks above a wild card. the next three best records are the wild cards, seeds 5 to 7. games behind counts from the 7th seed. this is a snapshot of the standings, not a forecast.</p>
        </>}
      />
      {!any && <p className="note" role="status">no games have been played yet, so there is no picture.</p>}
      <div className="tw">
        <table>
          <caption className="sr-only">{conference} playoff picture, if the season ended today</caption>
          <thead>
            <tr>
              <th scope="col" className="n">seed</th><th scope="col">team</th><th scope="col" className="n">w-l</th>
              <th scope="col" className="n">pct</th><th scope="col" className="n">diff</th><th scope="col">in as</th>
            </tr>
          </thead>
          <tbody>
            {pic.seeds.map((s, i) => (
              <tr key={s.team.abbr} className={i === pic.seeds.length - 1 ? 'cut' : undefined}>
                <td className="n">{s.seed}</td>
                <td className="nowrap"><TeamCell abbr={s.team.abbr} /></td>
                <td className="n">{formatWlt(s.team)}</td>
                <td className="n">{formatPct(s.team.pct, s.team.games.length > 0)}</td>
                <td className="n">{s.team.games.length ? signedDiff(s.team.diff) : '—'}</td>
                <td className="dim">{s.kind === 'division' ? `${s.team.division.toLowerCase()} leader` : 'wild card'}</td>
              </tr>
            ))}
            {pic.hunt.map((h) => (
              <tr key={h.team.abbr} className="bn">
                <td className="n">—</td>
                <td className="nowrap"><TeamCell abbr={h.team.abbr} /></td>
                <td className="n">{formatWlt(h.team)}</td>
                <td className="n">{formatPct(h.team.pct, h.team.games.length > 0)}</td>
                <td className="n">{h.team.games.length ? signedDiff(h.team.diff) : '—'}</td>
                <td className="dim">{h.behind === 0 ? 'level with the 7th seed' : `${h.behind} back`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">the line marks the cut after the 7th seed. the last three rows are the next teams in line.</p>
    </section>
  );
}
