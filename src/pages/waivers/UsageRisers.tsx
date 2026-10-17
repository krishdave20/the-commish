import { useMemo, useState } from 'react';
import { PlayerLink } from '../../components/PlayerLink';
import { Segmented } from '../../components/Segmented';
import type { PlayerWeek } from '../../data/nflverseTypes';
import { MIN_RISER_SNAPS, MIN_RISER_TARGETS, RISER_WINDOW, usageRisers } from './risers';
import type { RiserMetric } from './risers';

export interface RiserPlayer { name: string; pos: string }

interface Props {
  weeks: readonly PlayerWeek[] | null;
  through: number | null;
  /** free agents to consider, with the names to show */
  freeAgents: ReadonlyMap<string, RiserPlayer>;
  loading: boolean;
}

const pts = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}`;

/** Free agents whose snap or target share rose most over the last two weeks, from the nightly nflverse weekly rows. */
export function UsageRisers({ weeks, through, freeAgents, loading }: Props) {
  const [metric, setMetric] = useState<RiserMetric>('snap');
  const list = useMemo(
    () => (weeks && through !== null ? usageRisers(weeks, new Set(freeAgents.keys()), through, metric).slice(0, 15) : []),
    [weeks, through, freeAgents, metric],
  );
  return (
    <section className="card" aria-labelledby="risers-title">
      <header>
        <div className="micro">who is gaining snaps and targets</div>
        <h2 id="risers-title">usage risers</h2>
      </header>
      {!weeks || through === null ? (
        <p className="note" role="status">{loading ? 'loading the nightly nflverse data…' : 'nflverse data arrives with the nightly update.'}</p>
      ) : (
        <>
          <Segmented label="Riser measure" value={metric} onChange={setMetric}
            options={[{ value: 'snap', label: 'snap share' }, { value: 'target', label: 'target share' }]} />
          {list.length === 0 ? (
            <p className="note">no free agent has risen enough yet.</p>
          ) : (
            <div className="tw">
              <table>
                <caption className="sr-only">Usage risers</caption>
                <thead>
                  <tr>
                    <th scope="col">player</th><th scope="col">pos</th><th scope="col" className="n">last {RISER_WINDOW} weeks</th>
                    <th scope="col" className="n">before</th><th scope="col" className="n">change</th><th scope="col" className="hide-sm">sample</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const p = freeAgents.get(r.pid);
                    return (
                      <tr key={r.pid}>
                        <td className="nowrap"><PlayerLink pid={r.pid} name={p?.name ?? r.pid} /> <span className="dim">{r.team}</span></td>
                        <td className="dim">{p?.pos}</td>
                        <td className="n">{(r.recent * 100).toFixed(1)}%</td>
                        <td className="n dim">{(r.prior * 100).toFixed(1)}%</td>
                        <td className="n pos-c">{pts(r.change)} pts</td>
                        <td className="hide-sm dim">
                          {r.recentSnaps} snaps{metric === 'target' ? `, ${r.recentTargets} targets` : ''} in {r.recentWeeks} {r.recentWeeks === 1 ? 'week' : 'weeks'}; {r.priorWeeks} earlier {r.priorWeeks === 1 ? 'week' : 'weeks'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="note">
            compares the last {RISER_WINDOW} weeks with the same player’s average before that. needs {MIN_RISER_SNAPS} snaps in the window, and {MIN_RISER_TARGETS} targets for target share.
            snap share and target share come from nflverse.
          </p>
        </>
      )}
    </section>
  );
}
