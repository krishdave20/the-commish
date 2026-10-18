import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { formatOdds, formatPoints1, signed, signedPct } from '../app/format';
import { useModel, useScenario } from '../app/modelContext';
import { FEATURE } from '../app/names';
import { teamResult } from '../app/results';
import { useSimulation } from '../app/useSimulation';
import { CountUp } from '../components/CountUp';
import { PageTabs } from '../components/PageTabs';
import { SectionHeader } from '../components/SectionHeader';
import { SortableTable } from '../components/SortableTable';
import type { Column } from '../components/useSort';
import { Kpi } from '../components/Kpi';
import { PlayerLink } from '../components/PlayerLink';
import type { Engine, ModelPlayer, TradeIdea, TradeProposal } from '../engine';
import { evaluateDynastyTrade } from '../engine/dynasty/index.ts';
import { PlayerTags } from './team/PlayerTags';
import { DynastyReadout } from './trades/DynastyReadout';
import { LensCard } from './trades/LensCard';
import { PickPicker } from './trades/PickPicker';
import { PicksCard } from './trades/PicksCard';
import { useDynasty } from './trades/useDynasty';
import type { DynastyView } from './trades/useDynasty';

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

type SetList = (f: (l: string[]) => string[]) => void;

function Analyzer({ engine, analyzerRef, state, dyn }: {
  engine: Engine;
  analyzerRef: React.RefObject<HTMLElement | null>;
  state: {
    partner: number; send: string[]; get: string[]; sendPicks: string[]; getPicks: string[];
    setPartner: (r: number) => void; setSend: SetList; setGet: SetList; setSendPicks: SetList; setGetPicks: SetList;
  };
  /** dynasty mode (null in a redraft league that is not being explored) */
  dyn: DynastyView | null;
}) {
  const { scenario } = useScenario();
  const { model, meRid } = engine;
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const { partner, send, get, sendPicks, getPicks } = state;
  const scope = useMemo(() => engine.scope(scenario), [engine, scenario]);
  const others = useMemo(() => model.teams.filter((t) => t.rid !== meRid).sort((a, b) => a.team.localeCompare(b.team)), [model, meRid]);

  const rosterValue = (mine: boolean) => (p: ModelPlayer) => { let s = 0; for (let w = cur + 1; w <= last; w++) s += scope.val(p, w, mine); return s; };
  const myIds = useMemo(() => scope.myRoster(), [scope]);
  const theirIds = useMemo(() => model.players.filter((p) => p.ownerRid === partner).map((p) => p.pid), [model, partner]);

  // a deal can be picks alone: the lineup then does not move, but the value does
  const any = send.length + get.length + sendPicks.length + getPicks.length > 0;
  const proposal: TradeProposal | null = any ? { partnerRid: partner, send, get } : null;
  const ev = useMemo(() => (proposal ? engine.evaluateTrade(scenario, proposal) : null), [engine, scenario, partner, send, get, any]); // eslint-disable-line react-hooks/exhaustive-deps
  const inputs = useMemo(() => (proposal ? engine.tradeSimInputs(scenario, proposal) : null), [engine, scenario, partner, send, get, any]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useSimulation(inputs?.before ?? null, 'trade', 80);
  const after = useSimulation(inputs?.after ?? null, 'trade-after', 80);
  const ready = before.fresh && after.fresh && before.result && after.result;
  const b0 = ready ? teamResult(model, before.result, meRid).playoff : 0;
  const b1 = ready ? teamResult(model, after.result, meRid).playoff : 0;
  const partnerName = model.teams.find((t) => t.rid === partner)?.team ?? '';

  const toggle = (set: SetList) => (pid: string) =>
    set((l) => (l.includes(pid) ? l.filter((x) => x !== pid) : [...l, pid]));

  // dynasty: value out and in, and a verdict for your contender-or-rebuilder lens
  const dynEval = useMemo(() => {
    if (!dyn?.data || !dyn.fc?.ok || !ev) return null;
    const mine = dyn.data.picks[meRid] ?? [], theirs = dyn.data.picks[partner] ?? [];
    return evaluateDynastyTrade({
      give: [...send.map(dyn.playerAsset), ...mine.filter((p) => sendPicks.includes(p.key)).map(dyn.pickAsset)],
      get: [...get.map(dyn.playerAsset), ...theirs.filter((p) => getPicks.includes(p.key)).map(dyn.pickAsset)],
      lens: dyn.lensByRid[meRid]?.label ?? null, redraft: ev, oddsDelta: ready ? b1 - b0 : null,
    });
  }, [dyn, ev, send, get, sendPicks, getPicks, meRid, partner, ready, b0, b1]);

  return (
    <section className="card" aria-labelledby="analyzer-title" ref={analyzerRef}>
      <SectionHeader id="analyzer-title" title="the analyzer" tip="tick players on both sides of a deal; it scores your lineup, theirs, your playoff weeks and your playoff odds live." />
      <div className="form-row">
        <label className="ctl">
          trade partner
          <select value={partner} onChange={(e) => state.setPartner(Number(e.target.value))}>
            {others.map((t) => <option key={t.rid} value={t.rid}>{t.team}</option>)}
          </select>
        </label>
        <button type="button" className="btn quiet" onClick={() => { state.setSend(() => []); state.setGet(() => []); state.setSendPicks(() => []); state.setGetPicks(() => []); }}>clear</button>
      </div>
      <div className="sidebyside">
        <div className="stack">
          <PickList title="you send" ids={myIds} checked={send} onToggle={toggle(state.setSend)} value={rosterValue(true)} idx={scope.idx.P} />
          {dyn?.data && <PickPicker title="you send: picks" picks={dyn.data.picks[meRid] ?? []} checked={sendPicks} onToggle={toggle(state.setSendPicks)} dyn={dyn} />}
        </div>
        <div className="stack">
          <PickList title={`you get from ${partnerName}`} ids={theirIds} checked={get} onToggle={toggle(state.setGet)} value={rosterValue(false)} idx={scope.idx.P} />
          {dyn?.data && <PickPicker title={`you get from ${partnerName}: picks`} picks={dyn.data.picks[partner] ?? []} checked={getPicks} onToggle={toggle(state.setGetPicks)} dyn={dyn} />}
        </div>
      </div>
      {!ev ? (
        <p className="note">{dyn?.data ? 'tick players and picks on both sides to score a deal, or load one of the handshake deals below.' : 'tick players on both sides to score a deal, or load one of the handshake deals below.'}</p>
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
          {dynEval ? (
            <DynastyReadout ev={dynEval} me={dyn!.lensByRid[meRid]} partner={dyn!.lensByRid[partner]} partnerName={partnerName} />
          ) : dyn?.fc && !dyn.fc.ok ? (
            <p className="note" role="status">dynasty values are unavailable right now, so only this season is scored. {dyn.fc.reason}</p>
          ) : dyn ? <p className="note" role="status">loading dynasty values…</p> : null}
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

/** Win-win one-for-one ideas, ranked. "load" puts one into the analyzer. */
function HandshakeDeals({ engine, own, onLoad }: { engine: Engine; own: boolean; onLoad: (x: TradeIdea) => void }) {
  const { model } = engine;
  const columns: Column<TradeIdea>[] = [
    { key: 'idea', header: '#', more: true, numeric: true, value: (x) => x.idea, className: 'dim' },
    { key: 'give', header: 'you send', value: (x) => x.give, render: (x) => <PlayerLink pid={x.givePid} name={x.give} /> },
    { key: 'get', header: 'you get', value: (x) => x.get, render: (x) => <PlayerLink pid={x.getPid} name={x.get} /> },
    { key: 'partner', header: 'partner', value: (x) => x.partner, className: 'dim' },
    { key: 'mine', header: `your ${FEATURE.lift}`, numeric: true, value: (x) => x.myGain, render: (x) => <span className="pos-c">{signed(x.myGain)}</span> },
    { key: 'theirs', header: `their ${FEATURE.lift}`, more: true, numeric: true, value: (x) => x.theirGain, render: (x) => <span className="pos-c">{signed(x.theirGain)}</span> },
    { key: 'starts', header: 'starts for you', more: true, numeric: true, value: (x) => x.startsForMe },
    { key: 'load', header: 'load', sortable: false, render: (x) => <button type="button" className="btn" aria-label={`Load ${x.give} for ${x.get}`} onClick={() => onLoad(x)}>load</button> },
  ];
  return (
    <section className="card" aria-labelledby="ideas-title">
      <SectionHeader id="ideas-title" title={FEATURE.handshake} tip="trades both managers should take: one for one, each side better off." />
      {!own ? (
        <p className="note">
          deal ideas are worked out for your own team. you are looking at {engine.me.team}, so build deals in the analyzer; it scores any trade live.
        </p>
      ) : model.ideas.length === 0 ? (
        <p className="note">no win-win one-for-one ideas right now.</p>
      ) : (
        <SortableTable caption="Handshake deals" columns={columns} rows={model.ideas} rowKey={(x) => x.idea} tableId="handshake" />
      )}
    </section>
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
  const [sendPicks, setSendPicks] = useState<string[]>([]);
  const [getPicks, setGetPicks] = useState<string[]>([]);
  // dynasty mode is on in dynasty leagues; in a redraft league it is an opt-in "explore"
  const { extras } = useModel();
  const league = extras?.league ?? null;
  const redraft = !!league && league.settings?.type !== 2;
  const [explore, setExplore] = useState(false);
  const dyn = useDynasty(engine, league, !!league && (!redraft || explore));
  const analyzerRef = useRef<HTMLElement | null>(null);
  const own = engine.me.ownerId === model.meta.userId;

  function load(x: TradeIdea) {
    setPartner(x.partnerRid);
    setSend([x.givePid]);
    setGet([x.getPid]);
    analyzerRef.current?.scrollIntoView?.({ block: 'start' });
  }

  const changePartner = (r: number) => { setPartner(r); setGet([]); setGetPicks([]); };

  return (
    <>
      <ScenarioBar />
      <PageTabs
        label="Trade block sections" defaultTab="analyzer"
        tabs={[{ value: 'analyzer', label: 'analyzer' }, { value: 'deals', label: FEATURE.handshake }, ...(league ? [{ value: 'dynasty', label: 'dynasty' }] : [])]}
      >
        {(tab, setTab) => tab === 'analyzer' ? (
          <Analyzer engine={engine} analyzerRef={analyzerRef} dyn={dyn}
            state={{ partner, send, get, sendPicks: dyn ? sendPicks : [], getPicks: dyn ? getPicks : [], setPartner: changePartner, setSend, setGet, setSendPicks, setGetPicks }}
          />
        ) : tab === 'deals' ? (
          <HandshakeDeals engine={engine} own={own} onLoad={(x) => { load(x); setTab('analyzer'); }} />
        ) : (
          <>
            {league && <LensCard engine={engine} dyn={dyn} redraft={redraft} explore={explore} setExplore={setExplore} />}
            {dyn && <PicksCard engine={engine} dyn={dyn} />}
          </>
        )}
      </PageTabs>
    </>
  );
}
