import { useMemo, useState } from 'react';
import { formatCount } from '../../app/format';
import { Segmented } from '../../components/Segmented';
import type { Engine } from '../../engine';
import type { PickValuation } from '../../engine/dynasty/index.ts';
import type { DynastyView } from './useDynasty';

type Show = 'all' | 'mine' | 'traded';

function PickLine({ p, dyn }: { p: PickValuation; dyn: DynastyView }) {
  const via = p.acquired ? ` via ${dyn.team(p.originalRosterId).manager}` : '';
  const value = p.value === null ? 'no value' : formatCount(p.value);
  return (
    <li
      data-acquired={p.acquired ? 'true' : undefined}
      title={`${p.label}: ${p.bucket} slot${p.estimated ? ', priced from the nearest fantasycalc row' : ''}${p.fcId ? ` (${p.fcId})` : ''}`}
    >
      <span>{p.label.split(' ')[1]}</span>
      {via && <span style={{ color: 'var(--gold-ink)' }}>{via}</span>}
      <span className="dim"> · {p.bucket} · {value}{p.estimated ? ' · est.' : ''}</span>
    </li>
  );
}

/** Each team's future picks: its own and the ones it bought, with the original owner, projected slot and fantasycalc value. */
export function PicksCard({ engine, dyn }: { engine: Engine; dyn: DynastyView }) {
  const [show, setShow] = useState<Show>('all');
  const data = dyn.data;
  const teams = useMemo(() => [...engine.model.teams].sort((a, b) => Number(b.rid === engine.meRid) - Number(a.rid === engine.meRid) || a.team.localeCompare(b.team)), [engine]);
  const traded = data ? Object.values(data.picks).flat().filter((p) => p.acquired).length : 0;

  return (
    <section className="card" aria-labelledby="picks-title">
      <header>
        <div className="micro">who holds the next {data?.seasons.length ?? 3} drafts</div>
        <h2 id="picks-title">future picks</h2>
      </header>
      {!data ? <p className="note" role="status">loading picks…</p> : (
        <div className="stack">
          <Segmented
            label="Which picks" value={show} onChange={setShow}
            options={[{ value: 'all', label: 'all teams' }, { value: 'mine', label: 'my picks' }, { value: 'traded', label: `traded only (${traded})` }]}
          />
          <div className="tw">
            <table>
              <caption className="sr-only">Future picks by team</caption>
              <thead>
                <tr>
                  <th scope="col">team</th>
                  {data.seasons.map((s) => <th scope="col" key={s}>{s}</th>)}
                  <th scope="col" className="n">pick value</th>
                </tr>
              </thead>
              <tbody>
                {teams.filter((t) => show === 'all' || (show === 'mine' ? t.rid === engine.meRid : !!data.picks[t.rid]?.some((p) => p.acquired))).map((t) => {
                  const mine = data.picks[t.rid] ?? [];
                  const shown = show === 'traded' ? mine.filter((p) => p.acquired) : mine;
                  return (
                    <tr key={t.rid} className={t.rid === engine.meRid ? 'me' : undefined}>
                      <td className="nowrap"><span className="pname">{t.team}</span>{t.rid === engine.meRid && <span className="you">you</span>}</td>
                      {data.seasons.map((s) => (
                        <td key={s} style={{ verticalAlign: 'top' }}>
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
                            {shown.filter((p) => p.season === s).sort((a, b) => a.round - b.round).map((p) => <PickLine key={p.key} p={p} dyn={dyn} />)}
                          </ul>
                        </td>
                      ))}
                      <td className="n">{formatCount(mine.reduce((sum, p) => sum + (p.value ?? 0), 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {show === 'traded' && traded === 0 && <p className="note">no picks have changed hands in this league.</p>}
          {!dyn.fc?.ok && dyn.fc && <p className="note" role="status">pick values are unavailable right now. {dyn.fc.reason}</p>}
          {!dyn.native && <p className="note">this is a redraft league, so every team holds its own picks; these are the default slots, priced with dynasty values.</p>}
          <p className="note">
            the slot (early, mid or late) comes from each pick’s original owner’s projected finish for the next draft; later drafts are mid.
            est. means fantasycalc has no row for that exact pick, so the nearest one is used. values: fantasycalc.
          </p>
        </div>
      )}
    </section>
  );
}
