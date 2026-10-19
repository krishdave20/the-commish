import { useMemo, useState } from 'react';
import { EnginePage } from '../app/EnginePage';
import { Goalposts } from '../components/art/Goalposts';
import { ScenarioBar } from '../app/ScenarioBar';
import { MomentBanner } from '../components/MomentBanner';
import { compact, formatPoints1, signed, formatMoney } from '../app/format';
import { useModel, useScenario } from '../app/modelContext';
import { useNflverse } from '../app/nflverseData';
import { usePlayersFile } from '../app/playersData';
import { displayName } from '../app/playersIndex';
import { FEATURE } from '../app/names';
import { useTryWaiver } from '../app/tryWaiver';
import { useComputed } from '../app/useComputed';
import { useDebounced } from '../app/useSimulation';
import { MatchupGrade } from '../components/MatchupGrade';
import { AvatarName } from '../components/Avatar';
import { PlayerLink } from '../components/PlayerLink';
import { HeadlineStrip } from '../components/HeadlineStrip';
import { PageTabs } from '../components/PageTabs';
import { SectionHeader } from '../components/SectionHeader';
import { Segmented } from '../components/Segmented';
import { SortableTable } from '../components/SortableTable';
import type { Column } from '../components/useSort';
import { POS_ORDER, WAIVER_WINDOWS } from '../engine';
import type { Engine, WaiverEntry, WaiverWindow } from '../engine';
import { PlayerTags } from './team/PlayerTags';
import { UsageRisers } from './waivers/UsageRisers';
import { Streamers } from './waivers/streamers/Streamers';
import type { RiserPlayer } from './waivers/UsageRisers';

const NONE: WaiverEntry[] = [];
/** rows drawn at first; the rest of the wire is one tap away */
const PAGE = 15;

/** The trending and risers tab. It alone needs the players file (about 12,000 entries) and the nflverse bundle, so the wire and the streamers
    never download, unzip or parse either one. */
function RisersTab() {
  const nv = useNflverse();
  const file = usePlayersFile();
  const { model } = useModel();
  const freeAgents = useMemo(() => {
    const out = new Map<string, RiserPlayer>();
    if (!nv.bundle || !model) return out;
    const rostered = new Set(model.players.filter((p) => p.ownerRid > 0).map((p) => p.pid));
    const known = new Map(model.players.map((p) => [p.pid, p]));
    for (const w of nv.bundle.weekly) {
      if (out.has(w.pid) || rostered.has(w.pid)) continue;
      const rec = file.data?.[w.pid];
      const mp = known.get(w.pid);
      out.set(w.pid, { name: rec ? displayName({ ...rec, player_id: w.pid }) : (mp?.name ?? w.pid), pos: rec?.position ?? mp?.pos ?? '' });
    }
    return out;
  }, [nv.bundle, model, file.data]);
  return <UsageRisers weeks={nv.bundle?.weekly ?? null} through={nv.bundle?.manifest.throughWeek ?? null} freeAgents={freeAgents} loading={nv.loading} />;
}

function Board({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
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

  const tryIt = useTryWaiver();

  const columns: Column<WaiverEntry>[] = [
    {
      key: 'player', header: 'player', essential: true, value: (w) => w.player.name, className: 'nowrap sticky-col',
      render: (w) => <AvatarName pid={w.player.pid} name={w.player.name} pos={w.player.pos} team={w.player.nfl ?? undefined} size={28}><PlayerLink pid={w.player.pid} name={w.player.name} /> <span className="dim">{w.player.nfl ?? ''}</span><PlayerTags p={w.player} /></AvatarName>,
    },
    { key: 'pos', header: 'pos', value: (w) => w.player.pos, className: 'dim' },
    { key: 'gain', header: FEATURE.lift, essential: true, numeric: true, value: (w) => w.gain, render: (w) => <span className="pos-c">{signed(w.gain)}</span> },
    { key: 'bid', header: 'faab bid', essential: true, numeric: true, value: (w) => w.bid, render: (w) => formatMoney(w.bid) },
    { key: 'drop', header: 'drop', value: (w) => w.drop.name, className: 'dim nowrap' },
    { key: 'starts', header: 'starts', more: true, numeric: true, value: (w) => w.starts, render: (w) => `${w.starts}/${w.nweeks}` },
    { key: 'next', header: `wk ${cur + 1} proj`, more: true, numeric: true, value: (w) => w.next, render: (w) => formatPoints1(w.next) },
    { key: 'ceil', header: 'ceiling', more: true, numeric: true, value: (w) => w.ceil, render: (w) => formatPoints1(w.ceil) },
    {
      key: 'opp', header: 'next matchup', more: true,
      render: (w) => <MatchupGrade opponent={w.player.opp[cur + 1]} dvp={w.player.dvp[cur + 1]} />,
    },
    { key: 'trend', header: 'trending adds', more: true, numeric: true, value: (w) => w.trend, render: (w) => (w.trend ? compact(w.trend) : ''), className: 'dim' },
    {
      key: 'try', header: 'try', sortable: false,
      render: (w) => (
        <button type="button" className="tog" aria-label={`try adding ${w.player.name} and dropping ${w.drop.name}`}
          title="add him in the what-if lab" onClick={() => tryIt(w)}>try</button>
      ),
    },
  ];

  const best = full[0] ?? null;
  const range = weeks.length ? `weeks ${weeks[0]}${weeks.length > 1 ? `–${weeks[weeks.length - 1]}` : ''}` : '';

  return (
    <>
      <MomentBanner page="waivers" />
      <ScenarioBar />
      <HeadlineStrip label="Best add" items={[
        { label: 'best add', value: <span className="strip-name">{best ? best.player.name : board.pending ? '…' : '—'}</span>, sub: best ? `${best.player.pos} ${best.player.nfl ?? ''}, drop ${best.drop.name}` : board.pending ? 'working it out…' : 'nobody beats your bench' },
        { label: FEATURE.lift, value: <span className="pos-c">{best ? signed(best.gain) : '—'}</span>, sub: range ? `${range} points added to your best lineup` : 'points added to your best lineup' },
        { label: 'faab bid', value: <span>{best ? formatMoney(best.bid) : '—'}</span>, sub: 'scales with your remaining faab' },
      ]} />
      <PageTabs label="Waiver wire sections" defaultTab="wire" tabs={[{ value: 'wire', label: 'the wire' }, { value: 'streamers', label: 'streamers' }, { value: 'risers', label: 'trending & risers' }]}>
        {(tab) => tab === 'wire' ? (
          <section className="card" aria-labelledby="wire-title">
            <SectionHeader
              id="wire-title" title="the wire"
              tip={`${FEATURE.lift}: points added to your best lineup, ${weeks.length ? `${range}, ` : ''}after dropping the cheapest bench option. bids scale with your remaining faab.`}
            />
            <div className="row">
              <Segmented
                label="Waiver window" value={win} onChange={setWin}
                options={WAIVER_WINDOWS.map((w) => ({ value: w.id, label: w.label.toLowerCase() }))}
              />
              {positions.length > 0 && (
                <Segmented label="Position filter" value={pos} onChange={setPos} options={[{ value: 'all', label: 'all' }, ...positions.map((p) => ({ value: p as string, label: p }))]} />
              )}
            </div>
            <p className="note" role="status">{board.pending ? 'working out lineup lift for every free agent…' : ''}</p>
            {board.value === null ? null : !board.pending && list.length === 0 ? (
              <div className="art-empty">
                <Goalposts size={36} />
                <p className="take">nobody on the wire beats your bench this window.</p>
              </div>
            ) : (
              <SortableTable caption="Waiver wire" columns={columns} rows={list} rowKey={(w) => w.pid} initialSort={{ key: 'gain', dir: 'desc' }} tableId="waivers" pageSize={PAGE} />
            )}
          </section>
        ) : tab === 'streamers' ? (
          <Streamers engine={engine} />
        ) : (
          <RisersTab />
        )}
      </PageTabs>
    </>
  );
}

export default function Waivers() {
  return <EnginePage page="waivers">{(engine) => <Board engine={engine} />}</EnginePage>;
}
