import { useMemo } from 'react';
import { MoreColumns } from '../../components/MoreColumns';
import { SectionHeader } from '../../components/SectionHeader';
import { useMoreColumns } from '../../components/useMoreColumns';
import { NFL_COPY } from '../../app/names';
import { TeamCell } from './TeamCell';
import { signedDiff } from './format';
import { formatPct, formatWlt } from '../../engine/nfl';
import type { Conference, Standings as StandingsData, StandingRow } from '../../engine/nfl';

interface Props {
  standings: StandingsData;
  conference: Conference;
  /** how many of my rostered players each NFL team has */
  mine: ReadonlyMap<string, number>;
}

const played = (r: StandingRow) => r.games.length > 0;

/** Four division tables for one conference. Default columns: team, record, win percentage and point differential; the rest sit behind "more columns". */
export function StandingsView({ standings, conference, mine }: Props) {
  const more = useMoreColumns('nfl-standings');
  const tables = useMemo(() => standings.divisions.filter((d) => d.conference === conference), [standings, conference]);
  const hasMine = mine.size > 0;
  return (
    <section className="card" aria-labelledby="nf-st-title">
      <SectionHeader
        id="nf-st-title" title={`${conference.toLowerCase()} standings`}
        tip={<>
          <p>{NFL_COPY.tiebreakNote}.</p>
          <p>teams are ordered by win percentage (a tie counts half), then head-to-head among the tied teams, then division record (when all are in one division), then point differential, then city. streak and last 5 count every final game this season.</p>
        </>}
      />
      {!standings.started && <p className="note" role="status">no games have been played yet, so every team is 0-0.</p>}
      <MoreColumns on={more.on} onToggle={more.toggle} label="nfl standings" />
      <div className="nf-divs">
        {tables.map((d) => (
          <div key={d.division} className="tw">
            <table>
              <caption className="sr-only">{conference} {d.division} standings</caption>
              <thead>
                <tr>
                  <th scope="col">{d.division.toLowerCase()}</th>
                  <th scope="col" className="n">w-l</th>
                  <th scope="col" className="n">pct</th>
                  <th scope="col" className="n">diff</th>
                  {more.on && <>
                    <th scope="col" className="n">pf</th><th scope="col" className="n">pa</th>
                    <th scope="col" className="n">div</th><th scope="col" className="n">conf</th>
                    <th scope="col" className="n">strk</th><th scope="col" className="n">last 5</th>
                    {hasMine && <th scope="col" className="n">your players</th>}
                  </>}
                </tr>
              </thead>
              <tbody>
                {d.teams.map((r) => (
                  <tr key={r.abbr} className={r.rank === 1 && played(r) ? 'lead' : undefined}>
                    <td className="nowrap"><TeamCell abbr={r.abbr} /></td>
                    <td className="n">{formatWlt(r)}</td>
                    <td className="n">{formatPct(r.pct, played(r))}</td>
                    <td className="n">{played(r) ? signedDiff(r.diff) : '—'}</td>
                    {more.on && <>
                      <td className="n">{r.pf}</td><td className="n">{r.pa}</td>
                      <td className="n">{formatWlt(r.div)}</td><td className="n">{formatWlt(r.conf)}</td>
                      <td className="n">{r.streak || '—'}</td>
                      <td className="n">{r.last5.length ? formatWlt({ w: r.last5.filter((x) => x === 'W').length, l: r.last5.filter((x) => x === 'L').length, t: r.last5.filter((x) => x === 'T').length }) : '—'}</td>
                      {hasMine && <td className="n">{mine.get(r.abbr) ?? 0}</td>}
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
