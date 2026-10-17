import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { formatOdds, formatPoints1, signed, signedPct } from '../app/format';
import { useScenario } from '../app/modelContext';
import { FEATURE } from '../app/names';
import { teamResult } from '../app/results';
import { useSimulation } from '../app/useSimulation';
import { CountUp } from '../components/CountUp';
import { Kpi } from '../components/Kpi';
import { PlayerLink } from '../components/PlayerLink';
import type { Engine, ModelPlayer, TradeIdea, TradeProposal } from '../engine';
import { PlayerTags } from './team/PlayerTags';

function PickList({ title, ids, checked, onToggle, value, idx }: {
  title: string;
  ids: string[];
  checked: string[];
  onToggle: (pid: string) => void;
  value: (p: ModelPlayer) => number;
  idx: Record<string, ModelPlayer>;
}) {
  const rows = ids.map((id) => idx[id]).filter((p): p is ModelPlayer => !!p).map((p) => ({ p, v: value(p) })).sort((a, b) => b.v - a.v);
  return (
    <div className="stack">
      <h3>{title}</h3>
      <div className="picklist" role="group" aria-label={title}>
        {rows.map(({ p, v }) => (
          <label key={p.pid}>
            <input type="checkbox" checked={checked.includes(p.pid)} onChange={() => onToggle(p.pid)} aria-label={`${title}: ${p.name}`} />
            <span><span className="dim">{p.pos} </span>{p.name}<PlayerTags p={p} /></span>
            <span className="dim" title="expected points, rest of regular season">{formatPoints1(v)}</span>
            <PlayerLink pid={p.pid} name="↗" className="dim" aria-label={`Scouting report for ${p.name}`} />
          </label>
        ))}
      </div>
    </div>
  );
}

function Analyzer({ engine, analyzerRef, state }: {
  engine: Engine;
  analyzerRef: React.RefObject<HTMLElement | null>;
  state: { partner: number; send: string[]; get: string[]; setPartner: (r: number) => void; setSend: (f: (l: string[]) => string[]) => void; setGet: (f: (l: string[]) => string[]) => void };
}) {
  const { scenario } = useScenario();
  const { model, meRid } = engine;
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const { partner, send, get } = state;
  const scope = useMemo(() => engine.scope(scenario), [engine, scenario]);
  const others = useMemo(() => model.teams.filter((t) => t.rid !== meRid).sort((a, b) => a.team.localeCompare(b.team)), [model, meRid]);

  const rosterValue = (mine: boolean) => (p: ModelPlayer) => { let s = 0; for (let w = cur + 1; w <= last; w++) s += scope.val(p, w, mine); return s; };
  const myIds = useMemo(() => scope.myRoster(), [scope]);
  const theirIds = useMemo(() => model.players.filter((p) => p.ownerRid === partner).map((p) => p.pid), [model, partner]);

  const proposal: TradeProposal | null = send.length || get.length ? { partnerRid: partner, send, get } : null;
  const ev = useMemo(() => (proposal ? engine.evaluateTrade(scenario, proposal) : null), [engine, scenario, partner, send, get]); // eslint-disable-line react-hooks/exhaustive-deps
  const inputs = useMemo(() => (proposal ? engine.tradeSimInputs(scenario, proposal) : null), [engine, scenario, partner, send, get]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useSimulation(inputs?.before ?? null, 'trade', 80);
  const after = useSimulation(inputs?.after ?? null, 'trade-after', 80);
  const ready = before.fresh && after.fresh && before.result && after.result;
  const b0 = ready ? teamResult(model, before.result, meRid).playoff : 0;
  const b1 = ready ? teamResult(model, after.result, meRid).playoff : 0;
  const partnerName = model.teams.find((t) => t.rid === partner)?.team ?? '';

  const toggle = (set: (f: (l: string[]) => string[]) => void) => (pid: string) =>
    set((l) => (l.includes(pid) ? l.filter((x) => x !== pid) : [...l, pid]));

  return (
    <section className="card" aria-labelledby="analyzer-title" ref={analyzerRef}>
      <header>
        <div className="micro">tick players on both sides</div>
        <h2 id="analyzer-title">the analyzer</h2>
      </header>
      <div className="form-row">
        <label className="ctl">
          trade partner
          <select value={partner} onChange={(e) => state.setPartner(Number(e.target.value))}>
            {others.map((t) => <option key={t.rid} value={t.rid}>{t.team}</option>)}
          </select>
        </label>
        <button type="button" className="btn quiet" onClick={() => { state.setSend(() => []); state.setGet(() => []); }}>clear</button>
      </div>
      <div className="sidebyside">
        <PickList title="you send" ids={myIds} checked={send} onToggle={toggle(state.setSend)} value={rosterValue(true)} idx={scope.idx.P} />
        <PickList title={`you get from ${partnerName}`} ids={theirIds} checked={get} onToggle={toggle(state.setGet)} value={rosterValue(false)} idx={scope.idx.P} />
      </div>
      {!ev ? (
        <p className="note">tick players on both sides to score a deal, or load one of the handshake deals below.</p>
      ) : (
        <div className="stack" aria-live="polite">
          <div className="kpis">
            <Kpi label={`your lineup, wks ${ev.weeks[0]}–${ev.weeks[1]}`} sub="expected points">
              <span className={ev.myReg >= 0 ? 'pos-c' : 'neg-c'}>{signed(ev.myReg)}</span>
            </Kpi>
            <Kpi label="their lineup" sub="expected points">
              <span className={ev.theirReg >= 0 ? 'pos-c' : 'neg-c'}>{signed(ev.theirReg)}</span>
            </Kpi>
            <Kpi label="your playoff weeks" sub={`weeks ${ev.playoffWeeks[0]}–${ev.playoffWeeks[ev.playoffWeeks.length - 1]}`}>
              <span className={ev.myPo >= 0 ? 'pos-c' : 'neg-c'}>{signed(ev.myPo)}</span>
            </Kpi>
            <Kpi label="your playoff odds" sub={ready ? `from ${formatOdds(b0)} (${signedPct(b1 - b0)})` : 'simulating'}>
              {ready ? <span className={b1 >= b0 ? 'pos-c' : 'neg-c'}><CountUp value={Math.round(b1 * 100)} />%</span> : <span>…</span>}
            </Kpi>
          </div>
          <p className="take">{ev.message}</p>
        </div>
      )}
    </section>
  );
}

export default function Trades() {
  return (
    <EnginePage page="trades">
      {(engine) => <TradeBlock engine={engine} />}
    </EnginePage>
  );
}

function TradeBlock({ engine }: { engine: Engine }) {
  const { model, meRid } = engine;
  const others = useMemo(() => model.teams.filter((t) => t.rid !== meRid).sort((a, b) => a.team.localeCompare(b.team)), [model, meRid]);
  // /trades?player=<pid> (the hot takes' "trade block" button) starts with that player ticked on his side of the deal
  const [params] = useSearchParams();
  const [preset] = useState(() => {
    const mp = model.players.find((p) => p.pid === params.get('player'));
    if (!mp || mp.ownerRid === 0) return null;
    return mp.ownerRid === meRid ? { partner: null, send: [mp.pid], get: [] as string[] } : { partner: mp.ownerRid, send: [] as string[], get: [mp.pid] };
  });
  const [partner, setPartner] = useState(preset?.partner ?? others[0]?.rid ?? meRid);
  const [send, setSend] = useState<string[]>(preset?.send ?? []);
  const [get, setGet] = useState<string[]>(preset?.get ?? []);
  const analyzerRef = useRef<HTMLElement | null>(null);
  const own = engine.me.ownerId === model.meta.userId;

  function load(x: TradeIdea) {
    setPartner(x.partnerRid);
    setSend([x.givePid]);
    setGet([x.getPid]);
    analyzerRef.current?.scrollIntoView?.({ block: 'start' });
  }

  const changePartner = (r: number) => { setPartner(r); setGet([]); };

  return (
    <>
      <ScenarioBar />
      <Analyzer engine={engine} analyzerRef={analyzerRef} state={{ partner, send, get, setPartner: changePartner, setSend, setGet }} />
      <section className="card" aria-labelledby="ideas-title">
        <header>
          <div className="micro">trades both managers should take</div>
          <h2 id="ideas-title">{FEATURE.handshake}</h2>
        </header>
        {!own ? (
          <p className="note">
            deal ideas are worked out for your own team. you are looking at {engine.me.team}, so build deals in the analyzer above; it scores any trade live.
          </p>
        ) : model.ideas.length === 0 ? (
          <p className="note">no win-win one-for-one ideas right now.</p>
        ) : (
          <div className="tw">
            <table>
              <caption className="sr-only">Handshake deals</caption>
              <thead>
                <tr>
                  <th scope="col" className="n">#</th><th scope="col">you send</th><th scope="col">you get</th><th scope="col">partner</th>
                  <th scope="col" className="n">your gain</th><th scope="col" className="n">their gain</th>
                  <th scope="col" className="n hide-sm">starts for you</th><th scope="col"><span className="sr-only">load</span></th>
                </tr>
              </thead>
              <tbody>
                {model.ideas.map((x) => (
                  <tr key={x.idea}>
                    <td className="n dim">{x.idea}</td><td><PlayerLink pid={x.givePid} name={x.give} /></td><td><PlayerLink pid={x.getPid} name={x.get} /></td><td className="dim">{x.partner}</td>
                    <td className="n pos-c">{signed(x.myGain)}</td><td className="n pos-c">{signed(x.theirGain)}</td>
                    <td className="n hide-sm">{x.startsForMe}</td>
                    <td><button type="button" className="btn" aria-label={`Load ${x.give} for ${x.get}`} onClick={() => load(x)}>load</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card" aria-labelledby="dynasty-title">
        <header>
          <div className="micro">dynasty mode</div>
          <h2 id="dynasty-title">{FEATURE.contender}</h2>
          <span className="pill mute milestone">milestone 5</span>
        </header>
        <p className="note">fantasycalc values, future picks and a contender versus rebuilder lens arrive in milestone 5.</p>
      </section>
    </>
  );
}
