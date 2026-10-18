import { useMemo } from 'react';
import { useDraftInputs, useRankings } from '../../app/draftInputs';
import { FEATURE } from '../../app/names';
import { PlayerLink } from '../../components/PlayerLink';
import type { SleeperLeague } from '../../data';
import { formatNum, formatPoints1 } from '../../app/format';

const TOP = 12;

/** The incoming rookie class: the draft engine's rookie-mode rankings (projections scored with this league's settings), top twelve. */
export function RookieClass({ league, season }: { league: SleeperLeague; season: string }) {
  const inputs = useDraftInputs(league, { mode: 'rookie', draftId: null, season, enabled: true });
  const rankings = useRankings(league, inputs.data, 'rookie');
  // kickers and defenses are not a "class": the list is the skill positions (and IDP), in the engine's order
  const rows = useMemo(() => rankings?.rows.filter((r) => r.pos !== 'K' && r.pos !== 'DEF').slice(0, TOP) ?? [], [rankings]);
  return (
    <section className="card" aria-labelledby="rookies-title">
      <header>
        <div className="micro">{rankings ? `${rankings.adpField.replace(/_/g, ' ')} · ${season} season projections scored with your league` : `${season} season projections`}</div>
        <h2 id="rookies-title">{FEATURE.rookies}</h2>
      </header>
      {inputs.loading && !rankings ? <p className="note" role="status">loading the rookie rankings…</p>
        : inputs.error && !rankings ? <p className="note neg-c" role="status">could not load the rookie rankings. {inputs.error}</p>
        : rows.length === 0 ? <p className="note">no rookie projections are out yet.</p>
        : (
          <div className="tw">
            <table>
              <caption className="sr-only">Rookie class, top {TOP}</caption>
              <thead>
                <tr>
                  <th scope="col" className="n">#</th><th scope="col">player</th><th scope="col">pos</th><th scope="col">team</th>
                  <th scope="col" className="n">proj pts</th><th scope="col" className="n hide-sm">tier</th><th scope="col" className="n hide-sm">adp</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.pid}>
                    <td className="n dim">{i + 1}</td>
                    <td className="nowrap"><PlayerLink pid={r.pid} name={r.name} /></td>
                    <td className="dim">{r.pos}{r.posRank}</td>
                    <td className="dim">{r.team ?? 'fa'}</td>
                    <td className="n">{formatPoints1(r.points)}</td>
                    <td className="n hide-sm">{r.tier}</td>
                    <td className="n hide-sm dim">{r.adp === null ? '—' : formatNum(r.adp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {rankings && Object.values(rankings.byPid).some((r) => r.fc) && <p className="note">Values: FantasyCalc.</p>}
    </section>
  );
}
