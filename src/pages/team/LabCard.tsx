import { useMemo, useState } from 'react';
import { formatOdds, formatPoints1, signedPct, formatNum } from '../../app/format';
import { FEATURE } from '../../app/names';
import { useScenario } from '../../app/modelContext';
import { teamResult } from '../../app/results';
import { PlayerLink } from '../../components/PlayerLink';
import { CountUp } from '../../components/CountUp';
import { Disclosure } from '../../components/Disclosure';
import { SectionHeader } from '../../components/SectionHeader';
import { emptyScenario, toggleIn, withOverride } from '../../engine';
import type { Engine, ModelPlayer, PlayerOverride, Scenario } from '../../engine';
import { PlayerTags } from './PlayerTags';
import { useSaved } from './useSaved';

function setOverride(s: Scenario, pid: string, patch: Partial<PlayerOverride>): Scenario {
  const o: PlayerOverride = { ...s.overrides[pid], ...patch };
  return withOverride(s, pid, o.returnWeek || o.ppg != null ? o : null);
}

export function LabCard({ engine }: { engine: Engine }) {
  const { scenario, setScenario, reset, active, base, live, running } = useScenario();
  const { model, meRid } = engine;
  const { currentWeek: cur, maxWeek, lastRegularWeek: last, playoffWeeks, playoffTeams, divisions } = model.meta;
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const saved = useSaved(model.meta.leagueId);

  const scope = useMemo(() => engine.scope(scenario), [engine, scenario]);
  const baseScope = useMemo(() => engine.scope(emptyScenario()), [engine]);

  const before = teamResult(model, base, meRid);
  const after = teamResult(model, live, meRid);
  const shown = live ?? base;
  const delta = after.playoff - before.playoff;

  const poAvg = (sc: typeof scope, ids: string[]) =>
    playoffWeeks.length ? playoffWeeks.reduce((s, w) => s + sc.total(ids, w, true), 0) / playoffWeeks.length : 0;
  const poNow = useMemo(() => poAvg(baseScope, baseScope.myRoster()), [baseScope]); // eslint-disable-line react-hooks/exhaustive-deps
  const poScen = useMemo(() => poAvg(scope, scope.myRoster()), [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = Math.min(4, playoffTeams);
  const topSeed = (r: { seeds: number[] }) => r.seeds.slice(0, k).reduce((s, x) => s + x, 0);
  const stats: Array<{ label: string; a: number; b: number; fmt: (x: number) => string; note: string; show: boolean }> = [
    { label: 'expected wins', a: before.expW, b: after.expW, fmt: formatPoints1, note: 'wins', show: true },
    { label: 'division title', a: before.div, b: after.div, fmt: (x) => `${Math.round(x * 100)}%`, note: '', show: divisions > 0 },
    { label: `top-${k} seed`, a: topSeed(before), b: topSeed(after), fmt: (x) => `${Math.round(x * 100)}%`, note: '', show: k > 0 && k < playoffTeams },
    { label: 'playoff-week lineup', a: poNow, b: poScen, fmt: formatPoints1, note: 'points a week', show: playoffWeeks.length > 0 },
  ];

  const baseRoster = useMemo(() => baseScope.myRoster().map((id) => baseScope.idx.P[id]).filter((p): p is ModelPlayer => !!p), [baseScope]);
  const rosterRows = useMemo(() => {
    const adds = scenario.adds.map((id) => scope.idx.P[id]).filter((p): p is ModelPlayer => !!p);
    const ros = (p: ModelPlayer) => { let s = 0; for (let w = cur + 1; w <= maxWeek; w++) s += p.mu[w] || 0; return s; };
    return [...baseRoster, ...adds].sort((a, b) => ros(b) - ros(a));
  }, [baseRoster, scenario.adds, scope, cur, maxWeek]);

  const injured = baseRoster.filter((p) => p.onIr || p.injury).slice(0, 4);

  const freeAgents = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ros = (p: ModelPlayer) => { let s = 0; for (let w = cur + 1; w <= maxWeek; w++) s += p.mu[w] || 0; return s; };
    const added = new Set(scenario.adds);
    return model.players
      .filter((p) => p.ownerRid === 0 && !added.has(p.pid))
      .filter((p) => !q || `${p.name} ${p.nfl ?? ''} ${p.pos}`.toLowerCase().includes(q))
      .sort((a, b) => ros(b) - ros(a)).slice(0, q ? 12 : 8)
      .map((p) => ({ p, perWeek: ros(p) / Math.max(1, maxWeek - cur) }));
  }, [model.players, scenario.adds, query, cur, maxWeek]);

  function remove(pid: string) {
    setScenario((s) => {
      const o = { ...s.overrides };
      delete o[pid];
      return { ...s, adds: s.adds.filter((x) => x !== pid), overrides: o, pins: s.pins.filter((x) => x !== pid) };
    });
  }

  function save() {
    if (!live) return;
    saved.update((l) => [...l, {
      name: name.trim() || `scenario ${l.length + 1}`, odds: after.playoff, expW: after.expW, po: poScen, scenario,
    }]);
    setName('');
  }

  const bestOdds = saved.list.reduce((m, s) => Math.max(m, s.odds), 0);

  return (
    <section className="card" aria-labelledby="lab-title">
      <SectionHeader
        id="lab-title" title={FEATURE.lab} kicker="what if…?"
        tip="change a player’s return week or points per game, add a free agent, drop someone, or turn the weekly swing up or down (1.00× is the spread of real results around projections; higher means more upsets). the season is re-simulated off the main thread after each change."
      />

      <div className="stack" aria-live="polite">
        <div className="micro">your playoff odds</div>
        <div className="big-odds">
          <span className="from">{model.oddsPending ? '…' : formatOdds(before.playoff)}</span>
          <span className="micro">→</span>
          <span className="to">{running && !live ? '…' : <><CountUp value={Math.round(after.playoff * 100)} />%</>}</span>
          <span className={`chip ${delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'flat'}`}>
            {active ? (live ? `${signedPct(delta)} points` : 'simming…') : 'no changes yet'}
          </span>
        </div>
        {shown && (
          <div className="stats">
            {stats.filter((s) => s.show).map((s) => {
              const d = s.b - s.a;
              const same = s.fmt(s.a) === s.fmt(s.b);
              return (
                <div key={s.label} className="stat">
                  <span className="micro">{s.label}</span>
                  <span className="v">{s.fmt(s.b)}</span>
                  <span className={`note ${same ? 'dim' : d > 0 ? 'pos-c' : 'neg-c'}`}>
                    {same ? 'unchanged' : `${d > 0 ? '+' : '−'}${s.fmt(Math.abs(d))} ${s.note}`.trim()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {injured.length > 0 && (
        <div className="presets">
          <span className="micro">try</span>
          {injured.map((p) => (
            <button key={p.pid} type="button" className="btn quiet"
              onClick={() => setScenario((s) => setOverride(s, p.pid, { returnWeek: cur + 4, ppg: undefined }))}>
              {`${p.name} out until week ${cur + 4}`}
            </button>
          ))}
        </div>
      )}

      <div className="tw">
        <table>
          <caption className="sr-only">What-if roster</caption>
          <thead>
            <tr><th scope="col">player</th><th scope="col">out until</th><th scope="col" className="n">points a game</th><th scope="col" className="n">avg</th><th scope="col">drop</th></tr>
          </thead>
          <tbody>
            {rosterRows.map((p) => {
              const o = scenario.overrides[p.pid] ?? {};
              const dropped = scenario.drops.includes(p.pid);
              const added = scenario.adds.includes(p.pid);
              const wks = Array.from({ length: Math.max(0, last - cur) }, (_, i) => cur + 1 + i).filter((w) => scope.hasGame(p, w));
              const mavg = wks.length ? wks.reduce((s, w) => s + (p.mu[w] || 0), 0) / wks.length : 0;
              return (
                <tr key={p.pid} className={`${added ? 'added' : ''}${dropped ? ' dropped' : ''}`.trim() || undefined}>
                  <td><PlayerLink pid={p.pid} name={p.name} /> <span className="dim">{p.pos}</span><PlayerTags p={p} /></td>
                  <td className="keep">
                    <select
                      aria-label={`Out until for ${p.name}`} value={o.returnWeek ? String(o.returnWeek) : ''}
                      onChange={(e) => setScenario((s) => setOverride(s, p.pid, { returnWeek: e.target.value ? Number(e.target.value) : undefined }))}
                    >
                      <option value="">model</option>
                      {Array.from({ length: maxWeek - cur }, (_, i) => cur + 1 + i).map((w) => <option key={w} value={w}>{`week ${w}`}</option>)}
                    </select>
                  </td>
                  <td className="n keep">
                    <input
                      type="number" min={0} max={60} step={0.5} placeholder="model" aria-label={`Points per game for ${p.name}`}
                      defaultValue={o.ppg ?? ''} key={`${p.pid}-${o.ppg ?? ''}`}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={(e) => {
                        const v = e.target.value === '' ? undefined : Math.max(0, Math.min(60, Number(e.target.value)));
                        if (v !== o.ppg && (v === undefined || Number.isFinite(v))) setScenario((s) => setOverride(s, p.pid, { ppg: v }));
                      }}
                    />
                  </td>
                  <td className="n dim">{formatPoints1(mavg)}</td>
                  <td className="keep">
                    {added ? (
                      <button type="button" className="tog" aria-label={`Remove ${p.name}`} onClick={() => remove(p.pid)}>remove</button>
                    ) : (
                      <input
                        type="checkbox" checked={dropped} aria-label={`Drop ${p.name}`} style={{ accentColor: 'var(--red)' }}
                        onChange={() => setScenario((s) => ({ ...toggleIn(s, 'drops', p.pid), pins: s.pins.filter((x) => x !== p.pid) }))}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sidebyside">
        <div className="stack">
          <label className="ctl">
            add a free agent
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search by name, team or position" />
          </label>
          <div className="sugg" role="group" aria-label="Free agents">
            {freeAgents.length === 0 && <div className="note" style={{ padding: 8 }}>no free agent matches that search.</div>}
            {freeAgents.map(({ p, perWeek }) => (
              <button key={p.pid} type="button"
                onClick={() => { setScenario((s) => (s.adds.includes(p.pid) ? s : { ...s, adds: [...s.adds, p.pid] })); setQuery(''); }}>
                {/* no aria-label: the name comes from the visible text, so it always contains it (WCAG 2.5.3) */}
                <span className="sr-only">add</span>{' '}<span className="dim">{p.pos}</span>{' '}<span>{p.name} · {p.nfl ?? 'fa'}</span>{' '}<span className="dim">{formatPoints1(perWeek)}/wk</span>
              </button>
            ))}
          </div>
        </div>
        <div className="stack">
          <label className="ctl">
            weekly swing: {formatNum(scenario.volatility, 2)}×
            <input
              type="range" min={0.5} max={1.5} step={0.05} value={scenario.volatility}
              onChange={(e) => setScenario((s) => ({ ...s, volatility: Number(e.target.value) }))}
            />
          </label>
          <div className="row">
            <button type="button" className="btn warn" onClick={reset} disabled={!active}>reset what-if</button>
          </div>
        </div>
      </div>

      <Disclosure title="saved what-ifs" level={3} hint={saved.list.length ? `${saved.list.length} saved` : undefined}>
        <div className="form-row">
          <label className="ctl">
            name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="scenario name" />
          </label>
          <button type="button" className="btn" onClick={save} disabled={!live}>save this what-if</button>
        </div>
        <div className="tw">
          <table>
            <caption className="sr-only">Saved what-ifs</caption>
            <thead>
              <tr><th scope="col">name</th><th scope="col" className="n">playoffs</th><th scope="col" className="n">exp wins</th><th scope="col" className="n hide-sm">playoff wk pts</th><th scope="col" className="n"><span className="sr-only">actions</span></th></tr>
            </thead>
            <tbody>
              {saved.list.length === 0 && <tr><td className="note" colSpan={5}>nothing saved yet. set up a what-if and save it to compare.</td></tr>}
              {saved.list.map((s, i) => (
                <tr key={`${s.name}-${i}`}>
                  <td className="pname">{s.name}</td>
                  <td className={`n${s.odds === bestOdds && saved.list.length > 1 ? ' pos-c' : ''}`}>{formatOdds(s.odds)}</td>
                  <td className="n">{formatPoints1(s.expW)}</td>
                  <td className="n hide-sm">{formatPoints1(s.po)}</td>
                  <td className="n">
                    <button type="button" className="tog" aria-label={`Load ${s.name}`} onClick={() => setScenario(() => s.scenario)}>load</button>{' '}
                    <button type="button" className="tog" aria-label={`Delete ${s.name}`} onClick={() => saved.update((l) => l.filter((_, j) => j !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </section>
  );
}
