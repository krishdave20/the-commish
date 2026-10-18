import { useMemo, useState } from 'react';
import { formatNote } from './formatNote';
import { useRaceRows } from './useRaceRows';
import type { RaceRow } from './useRaceRows';
import { formatOdds, formatPoints, formatPoints1, signed, formatCount } from '../../app/format';
import { ClinchMark, MarkLegend } from '../../components/ClinchMark';
import { OddsCell } from '../../components/OddsCell';
import { SectionHeader } from '../../components/SectionHeader';
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
  const maxTitle = Math.max(0.01, ...rows.map((r) => r.title));
  const clinched = rows.filter((r) => r.clinch).length;
  const out = rows.filter((r) => r.elim).length;

  // the answer: rank, team, record, points for, playoff odds, title odds. Everything else is under "more columns".
  const columns: Column<RaceRow>[] = [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.rank, className: 'dim hide-sm' },
    {
      key: 'team', header: 'team', value: (r) => r.team, className: 'nowrap sticky-col',
      render: (r) => <><ClinchMark mark={r.mark} /><span className="pname">{r.team}</span>{r.isMe && <span className="you">you</span>}</>,
    },
    { key: 'record', header: 'record', numeric: true, value: (r) => r.wins + r.ties / 2, render: (r) => `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}` },
    { key: 'pf', header: 'pf', numeric: true, value: (r) => r.pf, render: (r) => formatPoints(r.pf), className: 'hide-sm' },
    { key: 'odds', header: 'playoffs', value: (r) => r.playoff, render: (r) => <OddsCell value={r.playoff} pending={pending} /> },
    {
      key: 'title', header: 'title', value: (r) => r.title, className: 'hide-sm',
      render: (r) => (pending ? <span className="dim">…</span> : <OddsCell value={r.title} tone="scale" max={maxTitle} />),
    },
    ...(divisions > 0 ? [{ key: 'division', header: 'division', more: true, value: (r: RaceRow) => r.division, className: 'dim' }] : []),
    ...(divisions > 0 ? [{ key: 'div', header: 'division %', more: true, numeric: true, value: (r: RaceRow) => r.div, render: (r: RaceRow) => (pending ? '…' : formatOdds(r.div)) }] : []),
    { key: 'ap', header: 'all-play', more: true, numeric: true, value: (r) => r.allPlay.pct, render: (r) => r.allPlay.record, className: 'dim' },
    {
      key: 'luck', header: 'luck', more: true, numeric: true, value: (r) => r.luck,
      render: (r) => <span className={r.luck > 0.4 ? 'pos-c' : r.luck < -0.4 ? 'neg-c' : 'dim'}>{signed(r.luck)}</span>,
    },
    {
      key: 'field', header: lc.odds, more: true, value: (r) => r.field,
      render: (r) => <span title={`${lc.oddsHeader}: chance of being crowned ${lc.champ}`}>{pending ? <span className="dim">…</span> : <OddsCell value={r.field} invert={mode === 'toilet'} />}</span>,
    },
    {
      key: 'expw', header: 'exp wins', more: true, numeric: true, value: (r) => r.expW,
      render: (r) => (pending ? <span className="dim">…</span> : <span title={`10th to 90th percentile: ${formatCount(r.p10)} to ${formatCount(r.p90)} wins`}>{formatPoints1(r.expW)} <span className="dim">{formatCount(r.p10)}–{formatCount(r.p90)}</span></span>),
    },
    {
      key: 'status', header: 'status', more: true, sortable: false,
      render: (r) => <TierPill p={r.playoff} pending={pending} status={r.clinch ? 'clinched' : r.elim ? 'eliminated' : undefined} />,
    },
  ];

  return (
    <section className="card" aria-labelledby="standings-title">
      <SectionHeader
        id="standings-title" title="standings"
        tip={<>
          {formatNote(engine.model.meta)} click a team for its details. {clinched + out === 0 ? 'no team has clinched or been eliminated yet.' : `${clinched} clinched · ${out} eliminated.`}
          {' '}marks come from strict math on the remaining schedule, never from the simulation.
          <MarkLegend />
        </>}
      />
      {divisions > 0 && (
        <Segmented label="Division filter" value={pick} onChange={setPick} options={[{ value: 'all', label: 'all teams' }, ...divNames.map((d) => ({ value: d, label: d }))]} />
      )}
      <SortableTable
        caption="Playoff picture standings" columns={columns} rows={list} rowKey={(r) => r.rid} tableId="standings"
        initialSort={{ key: 'odds', dir: 'desc' }} onRowActivate={(r) => onOpen(r.rid)}
        rowClassName={(r) => [r.isMe ? 'me' : '', pick === 'all' && r.rank === playoffTeams ? 'cut' : ''].filter(Boolean).join(' ') || undefined}
      />
    </section>
  );
}
