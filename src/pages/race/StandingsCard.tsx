import { useMemo, useState } from 'react';
import { useRaceRows } from './useRaceRows';
import type { RaceRow } from './useRaceRows';
import { formatOdds, formatPoints, formatPoints1, signed } from '../../app/format';
import { ClinchMark, MarkLegend } from '../../components/ClinchMark';
import { OddsCell } from '../../components/OddsCell';
import { Segmented } from '../../components/Segmented';
import { useLosersSetting } from '../../components/bracket/useBracketData';
import { LOSERS_COPY } from '../../app/names';
import { SortableTable } from '../../components/SortableTable';
import { TierPill } from '../../components/TierPill';
import type { Column } from '../../components/useSort';
import type { Engine } from '../../engine';

interface Props {
  engine: Engine;
  onOpen: (rid: number) => void;
}

export function StandingsCard({ engine, onOpen }: Props) {
  const rows = useRaceRows(engine);
  const pending = engine.model.oddsPending;
  const { mode } = useLosersSetting();
  const lc = LOSERS_COPY[mode];
  const { divisions, playoffTeams } = engine.model.meta;
  const [pick, setPick] = useState('all');
  const divNames = useMemo(() => [...new Set(rows.map((r) => r.division))], [rows]);
  const list = rows.filter((r) => pick === 'all' || r.division === pick);
  const clinched = rows.filter((r) => r.clinch).length;
  const out = rows.filter((r) => r.elim).length;

  const columns: Column<RaceRow>[] = [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.rank, className: 'dim' },
    {
      key: 'team', header: 'team', value: (r) => r.team, className: 'nowrap',
      render: (r) => <><ClinchMark mark={r.mark} /><span className="pname">{r.team}</span>{r.isMe && <span className="you">you</span>}</>,
    },
    ...(divisions > 0 ? [{ key: 'division', header: 'division', value: (r: RaceRow) => r.division, className: 'hide-sm dim' }] : []),
    { key: 'w', header: 'w', numeric: true, value: (r) => r.wins },
    { key: 'l', header: 'l', numeric: true, value: (r) => r.losses },
    { key: 'pf', header: 'pf', numeric: true, value: (r) => r.pf, render: (r) => formatPoints(r.pf) },
    { key: 'ap', header: 'all-play', numeric: true, value: (r) => r.allPlay.pct, render: (r) => r.allPlay.record, className: 'hide-sm dim' },
    {
      key: 'luck', header: 'luck', numeric: true, value: (r) => r.luck, className: 'hide-sm',
      render: (r) => <span className={r.luck > 0.4 ? 'pos-c' : r.luck < -0.4 ? 'neg-c' : 'dim'}>{signed(r.luck)}</span>,
    },
    { key: 'odds', header: 'playoffs', value: (r) => r.playoff, render: (r) => <OddsCell value={r.playoff} pending={pending} /> },
    ...(divisions > 0 ? [{ key: 'div', header: 'division %', numeric: true, value: (r: RaceRow) => r.div, render: (r: RaceRow) => (pending ? '…' : formatOdds(r.div)), className: 'hide-sm' }] : []),
    {
      key: 'title', header: 'title', value: (r) => r.title, className: 'hide-sm',
      render: (r) => (pending ? <span className="dim">…</span> : <OddsCell value={r.title} />),
    },
    {
      key: 'field', header: lc.odds, value: (r) => r.field, className: 'hide-sm',
      render: (r) => <span title={`${lc.oddsHeader}: chance of being crowned ${lc.champ}`}>{pending ? <span className="dim">…</span> : <OddsCell value={r.field} invert={mode === 'toilet'} />}</span>,
    },
    {
      key: 'expw', header: 'exp wins', numeric: true, value: (r) => r.expW,
      render: (r) => (pending ? <span className="dim">…</span> : <span title={`10th to 90th percentile: ${r.p10.toFixed(0)} to ${r.p90.toFixed(0)} wins`}>{formatPoints1(r.expW)} <span className="dim">{r.p10.toFixed(0)}–{r.p90.toFixed(0)}</span></span>),
    },
    {
      key: 'status', header: 'status', sortable: false,
      render: (r) => <TierPill p={r.playoff} pending={pending} status={r.clinch ? 'clinched' : r.elim ? 'eliminated' : undefined} />,
    },
  ];

  return (
    <section className="card" aria-labelledby="standings-title">
      <header>
        <div className="micro">click a team for its details</div>
        <h2 id="standings-title">standings</h2>
      </header>
      {divisions > 0 && (
        <Segmented label="Division filter" value={pick} onChange={setPick} options={[{ value: 'all', label: 'all teams' }, ...divNames.map((d) => ({ value: d, label: d }))]} />
      )}
      <SortableTable
        caption="Playoff picture standings" columns={columns} rows={list} rowKey={(r) => r.rid}
        initialSort={{ key: 'odds', dir: 'desc' }} onRowActivate={(r) => onOpen(r.rid)}
        rowClassName={(r) => [r.isMe ? 'me' : '', pick === 'all' && r.rank === playoffTeams ? 'cut' : ''].filter(Boolean).join(' ') || undefined}
      />
      <MarkLegend />
      <p className="note">
        {clinched + out === 0 ? 'no team has clinched or been eliminated yet.' : `${clinched} clinched · ${out} eliminated`}
        {' '}marks come from strict math on the remaining schedule, never from the simulation.
      </p>
    </section>
  );
}
