import { useId, useMemo, useState } from 'react';
import { formatOdds, formatPoints1 } from '../../../app/format';
import { AvatarName } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import { SectionHeader } from '../../../components/SectionHeader';
import { Segmented } from '../../../components/Segmented';
import { SortableTable } from '../../../components/SortableTable';
import type { Column } from '../../../components/useSort';
import { SLOT_LABEL } from '../../../engine';
import { hingesOf } from '../../../engine/hinges';
import type { HingeRow, HingesResult } from '../../../engine/hinges';
import { opponentText, statusText } from './format';
import { useMatchupData } from './useMatchupData';
import './matchup.css';

export const HINGES_TITLE = 'who this week hinges on';

const TIP = (
  <>
    for each starter, your win chance now minus your win chance if a typical free agent at his position played instead. “typical” is the
    median of the 12 best free agents there this week. points already scored stay: only what is still to play is swapped, so a finished game
    is worth 0. with games on, it uses the live win chance. the number is percentage points; a minus means a free agent would do better.
  </>
);

type View = 'mine' | 'theirs';

/** "12" for 12 percentage points, "−2" for a starter a free agent would beat, "0" for nothing. */
function pts(x: number): string {
  const r = Math.round(x);
  return r === 0 ? '0' : r < 0 ? `−${Math.abs(r)}` : `${r}`;
}

interface TableProps {
  result: HingesResult;
  /** the largest at-stake figure on screen, so the little bars share a scale */
  scale: number;
}

/** The table itself: one row per starter, biggest at stake first. Presentational (the data comes in as a `HingesResult`). */
export function HingesTable({ result, scale }: TableProps) {
  const columns = useMemo<Column<HingeRow>[]>(() => [
    { key: 'slot', header: 'slot', value: (r) => r.slot, render: (r) => <span className="micro">{SLOT_LABEL[r.slot] ?? r.slot}</span> },
    {
      key: 'player', header: 'player', value: (r) => r.name, className: 'sticky-col',
      render: (r) => (
        <AvatarName pid={r.pid} name={r.name} pos={r.pos} team={r.nfl ?? undefined} size={28}>
          <PlayerLink pid={r.pid} name={r.name} /> <span className="dim hinge-pos">{r.pos}{r.nfl && <span className="hide-sm">{` · ${r.nfl.toLowerCase()}`}</span>}</span>
        </AvatarName>
      ),
    },
    {
      key: 'opp', header: 'opponent', value: (r) => r.opp ?? '', className: 'hide-sm',
      render: (r) => <span className="hinge-opp">{opponentText(r)}<span className="dim"> · {statusText(r)}</span></span>,
    },
    { key: 'pg', header: 'per game', numeric: true, className: 'hide-sm', value: (r) => r.perGame, render: (r) => (r.perGame == null ? '—' : formatPoints1(r.perGame)) },
    {
      key: 'snaps', header: 'snaps', numeric: true, className: 'hide-sm', value: (r) => r.snapPct,
      render: (r) => (r.snapPct == null ? '—' : `${Math.round(r.snapPct * 100)}%`),
    },
    {
      key: 'stake', header: 'at stake', numeric: true, value: (r) => r.atStake,
      render: (r) => (
        <span className="hinge-stake" data-sign={r.atStake < -0.5 ? 'neg' : r.atStake < 0.5 ? 'zero' : 'pos'}>
          <span className="hinge-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, r.atStake / (scale || 1))) * 100}%` }} /></span>
          <b>{pts(r.atStake)}</b>
        </span>
      ),
    },
  ], [scale]);

  return (
    <SortableTable
      caption={`${result.isMe ? 'Your' : `${result.name}’s`} starters ranked by win chance at stake`}
      columns={columns} rows={result.rows} rowKey={(r) => r.pid} initialSort={{ key: 'stake', dir: 'desc' }} tableId={`hinges-${result.isMe ? 'mine' : 'theirs'}`}
    />
  );
}

/** "Who this week hinges on": your starters ranked by how much of your win chance rides on each, with a toggle for the opponent's. */
export function Hinges() {
  const data = useMatchupData();
  const [view, setView] = useState<View>('mine');
  const id = useId();

  const both = useMemo(() => (data ? { mine: hingesOf(data.mine, data.theirs, data.opts), theirs: hingesOf(data.theirs, data.mine, data.opts) } : null), [data]);
  if (!data || !both) return null;
  const result = both[view];
  const scale = Math.max(1, ...both.mine.rows.map((r) => r.atStake), ...both.theirs.rows.map((r) => r.atStake));
  const top = result.rows[0];

  return (
    <section className="card" aria-labelledby={`${id}-t`}>
      <SectionHeader id={`${id}-t`} title={HINGES_TITLE} tip={TIP} />
      <div className="row between">
        <Segmented
          label="Whose starters" value={view} onChange={setView}
          options={[{ value: 'mine', label: 'you' }, { value: 'theirs', label: 'opponent' }]}
        />
        <p className="note hinge-line">
          {view === 'mine' ? 'your' : `${result.name}’s`} win chance <b>{formatOdds(result.winNow)}</b>
          {data.source === 'live' ? ' · live' : ' · before kickoff'}
          {top && top.atStake >= 0.5 && <> · most on <b>{top.name}</b> ({pts(top.atStake)})</>}
        </p>
      </div>
      <HingesTable result={result} scale={scale} />
    </section>
  );
}
