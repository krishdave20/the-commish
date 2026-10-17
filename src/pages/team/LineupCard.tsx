import { useMemo, useState } from 'react';
import { formatPoints1 } from '../../app/format';
import { useScenario } from '../../app/modelContext';
import { PlayerLink } from '../../components/PlayerLink';
import { MatchupGrade } from '../../components/MatchupGrade';
import { Segmented } from '../../components/Segmented';
import { SLOT_LABEL } from '../../engine';
import type { Engine, ModelPlayer, Scenario } from '../../engine';
import { PlayerTags } from './PlayerTags';

function pinned(s: Scenario, pid: string): Scenario {
  if (s.pins.includes(pid)) return { ...s, pins: s.pins.filter((x) => x !== pid) };
  return { ...s, pins: [...s.pins, pid], benches: s.benches.filter((x) => x !== pid) };
}
function benched(s: Scenario, pid: string): Scenario {
  if (s.benches.includes(pid)) return { ...s, benches: s.benches.filter((x) => x !== pid) };
  return { ...s, benches: [...s.benches, pid], pins: s.pins.filter((x) => x !== pid) };
}

export function LineupCard({ engine }: { engine: Engine }) {
  const { scenario, setScenario } = useScenario();
  const { currentWeek: cur, maxWeek, lastRegularWeek: last } = engine.model.meta;
  const [week, setWeek] = useState(cur);
  const weeks = useMemo(() => Array.from({ length: maxWeek - cur + 1 }, (_, i) => cur + i), [cur, maxWeek]);

  const view = useMemo(() => {
    const scope = engine.scope(scenario);
    const ros = scope.myRoster();
    const L = scope.lineup(ros, week, true);
    const best = scope.lineup(ros, week, true, { pins: new Set(), benches: new Set() });
    const starters = L.slots.map((s) => ({ slot: s.slot as string, p: s.p, locked: s.locked, start: true }));
    const bench = L.bench.map((p) => ({ slot: 'BN', p: p as ModelPlayer | null, locked: false, start: false }));
    const all = [...starters, ...bench];
    const maxHi = Math.max(1, ...all.map((r) => (r.p ? scope.range(r.p, week, true)[1] : 0)));
    let lo = 0, hi = 0;
    for (const s of L.slots) if (s.p) { const [a, b] = scope.range(s.p, week, true); lo += a; hi += b; }
    return { scope, L, best, all, maxHi, lo, hi };
  }, [engine, scenario, week]);

  const { scope, L, best, all, maxHi } = view;
  const isPlayoff = week > last;

  return (
    <section className="card" aria-labelledby="lineup-title">
      <header>
        <div className="micro">the best eleven, by the numbers</div>
        <h2 id="lineup-title">lineup</h2>
      </header>
      <div className="stack">
        <Segmented label="Lineup week" value={week} onChange={setWeek} options={weeks.map((w) => ({ value: w, label: `wk ${w}` }))} />
        {isPlayoff && <p className="note">fantasy playoff week.</p>}
      </div>
      <div className="tw">
        <table>
          <caption className="sr-only">{`Lineup for week ${week}`}</caption>
          <thead>
            <tr>
              <th scope="col">slot</th><th scope="col">player</th><th scope="col" className="hide-sm">opp</th>
              <th scope="col">range</th><th scope="col" className="n">exp</th><th scope="col" className="n">start</th>
            </tr>
          </thead>
          <tbody>
            {all.map((r, i) => {
              const p = r.p;
              if (!p) {
                return <tr key={`e${i}`}><td className="micro">{SLOT_LABEL[r.slot] ?? r.slot}</td><td className="dim" colSpan={5}>empty slot</td></tr>;
              }
              const v = scope.val(p, week, true);
              const [lo, hi] = scope.range(p, week, true);
              const played = r.locked || (week === cur && p.playedThisWeek);
              return (
                <tr key={p.pid} className={r.start ? undefined : 'bn'}>
                  <td className="micro">{SLOT_LABEL[r.slot] ?? r.slot}</td>
                  <td><PlayerLink pid={p.pid} name={p.name} /> <span className="dim">{p.pos} · {p.nfl ?? ''}</span><PlayerTags p={p} /></td>
                  <td className="hide-sm"><MatchupGrade opponent={p.opp[week]} dvp={p.dvp[week]} /></td>
                  <td>
                    <div className="rng" title={`floor ${formatPoints1(lo)} · expected ${formatPoints1(v)} · ceiling ${formatPoints1(hi)}`}>
                      <div className="track" />
                      <div className="span" style={{ left: `${(lo / maxHi) * 100}%`, width: `${((hi - lo) / maxHi) * 100}%` }} />
                      <div className="mu" style={{ left: `${(v / maxHi) * 100}%` }} />
                    </div>
                  </td>
                  <td className={`n${r.start ? '' : ' dim'}`}>{formatPoints1(v)}</td>
                  <td className="n">
                    {played ? <span className="dim">played</span> : (
                      <>
                        <button type="button" className="tog pin" aria-pressed={scenario.pins.includes(p.pid)}
                          aria-label={`Always start ${p.name}`} onClick={() => setScenario((s) => pinned(s, p.pid))}>pin</button>{' '}
                        <button type="button" className="tog bench" aria-pressed={scenario.benches.includes(p.pid)}
                          aria-label={`Never start ${p.name}`} onClick={() => setScenario((s) => benched(s, p.pid))}>bench</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="total">
              <td className="micro">total</td><td>starting lineup</td><td className="hide-sm" />
              <td className="dim">{formatPoints1(view.lo)}–{formatPoints1(view.hi)}</td>
              <td className="n">{formatPoints1(L.total)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="note">
        expected <b>{formatPoints1(L.total)}</b>, floor {formatPoints1(view.lo)} to ceiling {formatPoints1(view.hi)}
        {L.total < best.total - 0.05
          ? <> · pins and benches cost <span className="neg-c">{formatPoints1(best.total - L.total)}</span> against the best lineup</>
          : ' · best possible'}
      </p>
    </section>
  );
}
