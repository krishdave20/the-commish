import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EnginePage } from '../app/EnginePage';
import { ScenarioBar } from '../app/ScenarioBar';
import { compact, formatPoints1, signed } from '../app/format';
import { useScenario } from '../app/modelContext';
import { FEATURE } from '../app/names';
import { useComputed } from '../app/useComputed';
import { useDebounced } from '../app/useSimulation';
import { MatchupGrade } from '../components/MatchupGrade';
import { Segmented } from '../components/Segmented';
import { SortableTable } from '../components/SortableTable';
import type { Column } from '../components/useSort';
import { POS_ORDER, WAIVER_WINDOWS } from '../engine';
import type { Engine, WaiverEntry, WaiverWindow } from '../engine';
import { PlayerTags } from './team/PlayerTags';

const NONE: WaiverEntry[] = [];

function Board({ engine }: { engine: Engine }) {
  const { scenario, setScenario } = useScenario();
  const navigate = useNavigate();
  const settled = useDebounced(scenario, 250);
  const [win, setWin] = useState<WaiverWindow>('reg');
  const [pos, setPos] = useState('all');
  const cur = engine.model.meta.currentWeek;

  const board = useComputed(() => engine.waivers(settled, win), [engine, settled, win]);
  const full = board.value?.list ?? NONE;
  const positions = useMemo(() => POS_ORDER.filter((x) => full.some((w) => w.player.pos === x)), [full]);
  const list = useMemo(
    () => full.filter((w) => pos === 'all' || w.player.pos === pos).slice(0, 60),
    [full, pos],
  );
  const weeks = board.value?.weeks ?? [];

  function tryIt(w: WaiverEntry) {
    setScenario((s) => ({
      ...s,
      adds: s.adds.includes(w.pid) ? s.adds : [...s.adds, w.pid],
      drops: s.drops.includes(w.drop.pid) ? s.drops : [...s.drops, w.drop.pid],
      pins: s.pins.filter((x) => x !== w.drop.pid),
    }));
    navigate('/team');
  }

  const columns: Column<WaiverEntry>[] = [
    {
      key: 'player', header: 'player', value: (w) => w.player.name, className: 'nowrap',
      render: (w) => <><span className="pname">{w.player.name}</span> <span className="dim">{w.player.nfl ?? ''}</span><PlayerTags p={w.player} /></>,
    },
    { key: 'pos', header: 'pos', value: (w) => w.player.pos, className: 'dim' },
    { key: 'gain', header: FEATURE.lift, numeric: true, value: (w) => w.gain, render: (w) => <span className="pos-c">{signed(w.gain)}</span> },
    { key: 'starts', header: 'starts', numeric: true, value: (w) => w.starts, render: (w) => `${w.starts}/${w.nweeks}`, className: 'hide-sm' },
    { key: 'drop', header: 'drop', value: (w) => w.drop.name, className: 'dim nowrap' },
    { key: 'bid', header: 'faab bid', numeric: true, value: (w) => w.bid, render: (w) => `$${w.bid.toLocaleString('en-US')}` },
    { key: 'next', header: `wk ${cur + 1} proj`, numeric: true, value: (w) => w.next, render: (w) => formatPoints1(w.next), className: 'hide-sm' },
    { key: 'ceil', header: 'ceiling', numeric: true, value: (w) => w.ceil, render: (w) => formatPoints1(w.ceil), className: 'hide-sm' },
    {
      key: 'opp', header: 'next matchup', className: 'hide-sm',
      render: (w) => <MatchupGrade opponent={w.player.opp[cur + 1]} dvp={w.player.dvp[cur + 1]} />,
    },
    { key: 'trend', header: 'trending adds', numeric: true, value: (w) => w.trend, render: (w) => (w.trend ? compact(w.trend) : ''), className: 'hide-sm dim' },
    {
      key: 'try', header: 'try', sortable: false,
      render: (w) => (
        <button type="button" className="tog" aria-label={`Try adding ${w.player.name} and dropping ${w.drop.name}`}
          title="add him in the what-if lab" onClick={() => tryIt(w)}>try</button>
      ),
    },
  ];

  return (
    <>
      <ScenarioBar />
      <section className="card" aria-labelledby="wire-title">
        <header>
          <div className="micro">{`${FEATURE.lift}: points added to your best lineup`}</div>
          <h2 id="wire-title">the wire</h2>
        </header>
        <div className="row">
          <Segmented
            label="Waiver window" value={win} onChange={setWin}
            options={WAIVER_WINDOWS.map((w) => ({ value: w.id, label: w.label.toLowerCase() }))}
          />
          {positions.length > 0 && (
            <Segmented label="Position filter" value={pos} onChange={setPos} options={[{ value: 'all', label: 'all' }, ...positions.map((p) => ({ value: p as string, label: p }))]} />
          )}
        </div>
        <p className="note" role="status">
          {board.pending ? 'working out lineup lift for every free agent…'
            : weeks.length ? `weeks ${weeks[0]}${weeks.length > 1 ? `–${weeks[weeks.length - 1]}` : ''}, after dropping the cheapest bench option. bids scale with your remaining faab.` : ''}
        </p>
        {board.value === null ? null : !board.pending && list.length === 0 ? (
          <p className="take">nobody on the wire beats your bench this window.</p>
        ) : (
          <SortableTable caption="Waiver wire" columns={columns} rows={list} rowKey={(w) => w.pid} initialSort={{ key: 'gain', dir: 'desc' }} />
        )}
      </section>
      <section className="card" aria-labelledby="risers-title">
        <header>
          <div className="micro">who is gaining snaps</div>
          <h2 id="risers-title">usage risers</h2>
        </header>
        <p className="note">snap and target share trends arrive with nflverse data in milestone 3.</p>
      </section>
    </>
  );
}

export default function Waivers() {
  return <EnginePage page="waivers">{(engine) => <Board engine={engine} />}</EnginePage>;
}
