import { Fragment, useId, useMemo, useState } from 'react';
import { PlayerLink } from '../../components/PlayerLink';
import { SectionHeader } from '../../components/SectionHeader';
import { MoreColumns } from '../../components/MoreColumns';
import { Segmented } from '../../components/Segmented';
import { DetailRow, ExpandCell } from '../../components/RowExpand';
import { onOwnControl, useExpanded } from '../../components/expandState';
import { usePhone } from '../../components/useMediaQuery';
import { useMoreColumns } from '../../components/useMoreColumns';
import { useSort } from '../../components/useSort';
import type { Column } from '../../components/useSort';
import { POS_ORDER } from '../../engine';
import type { DraftPick } from '../../data';
import type { RankedPlayer } from '../../engine';
import { TierBadge, WatchStar } from './BestAvailable';
import type { DraftRoom } from './model';
import { formatCount, formatNum, formatPoints1 } from '../../app/format';

const PAGE = 25;
/** a phone keeps these in the row; the rest open under it */
const PHONE_KEEPS: ReadonlySet<string> = new Set(['rank', 'name', 'points', 'value', 'watch']);

interface Props {
  room: DraftRoom;
  /** the picks made so far, for "hide drafted" */
  picks: readonly Pick<DraftPick, 'player_id'>[];
}

/** Season projections scored with the league's settings: VOR from the starting slots, tiers by natural gaps, ADP and value vs ADP. */
export function RankingsTab({ room, picks }: Props) {
  const { rankings, mode, fcUsed } = room;
  const [pos, setPos] = useState('all');
  const [query, setQuery] = useState('');
  const [rookiesOnly, setRookiesOnly] = useState(false);
  const [hideDrafted, setHideDrafted] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const more = useMoreColumns('rankings');
  const phone = usePhone();
  const open = useExpanded();
  const base = useId();

  const positions = useMemo(() => {
    const have = new Set(rankings.rows.map((r) => r.pos));
    return POS_ORDER.filter((p) => have.has(p));
  }, [rankings]);
  const drafted = useMemo(() => new Set(picks.map((p) => p.player_id)), [picks]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rankings.rows.filter((r) =>
      (pos === 'all' || r.pos === pos)
      && (!rookiesOnly || r.rookie)
      && (!hideDrafted || !drafted.has(r.pid))
      && (!q || r.name.toLowerCase().includes(q) || (r.team ?? '').toLowerCase().includes(q)));
  }, [rankings, pos, query, rookiesOnly, hideDrafted, drafted]);

  const showFc = fcUsed && mode !== 'redraft';
  const columns = useMemo<Column<RankedPlayer>[]>(() => [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.rank, className: 'dim' },
    { key: 'name', header: 'player', value: (r) => r.name, render: (r) => <><PlayerLink pid={r.pid} name={r.name} />{r.rookie && <> <span className="pill mute">rookie</span></>}</>, className: 'nowrap' },
    { key: 'pos', header: 'pos', value: (r) => `${r.pos}${String(r.posRank).padStart(3, '0')}`, render: (r) => <>{r.pos.toLowerCase()}{r.posRank}</>, className: 'dim' },
    { key: 'team', header: 'team', more: true, value: (r) => r.team ?? '', render: (r) => r.team ?? 'fa', className: 'dim' },
    { key: 'points', header: 'proj pts', numeric: true, value: (r) => r.points, render: (r) => formatPoints1(r.points) },
    { key: 'vor', header: 'vor', more: true, numeric: true, value: (r) => r.vor, render: (r) => formatPoints1(r.vor) },
    { key: 'tier', header: 'tier', more: true, value: (r) => r.tier, render: (r) => <TierBadge tier={r.tier} /> },
    { key: 'adp', header: 'adp', numeric: true, value: (r) => r.adp, render: (r) => (r.adp == null ? '—' : formatNum(r.adp)), className: 'dim' },
    {
      key: 'value', header: 'vs adp', numeric: true, value: (r) => r.valueVsAdp,
      render: (r) => (r.valueVsAdp == null ? '—' : <span className={r.valueVsAdp > 0 ? 'pos-c' : r.valueVsAdp < 0 ? 'neg-c' : 'dim'}>{r.valueVsAdp > 0 ? '+' : r.valueVsAdp < 0 ? '−' : ''}{formatNum(Math.abs(r.valueVsAdp))}</span>),
    },
    ...(showFc ? [{ key: 'fc', header: 'fc value', more: true, numeric: true, value: (r: RankedPlayer) => r.fc?.value ?? null, render: (r: RankedPlayer) => (r.fc ? formatCount(r.fc.value) : '—'), className: 'dim' } satisfies Column<RankedPlayer>] : []),
    { key: 'watch', header: 'watch', sortable: false, render: (r) => <WatchStar pid={r.pid} name={r.name} /> },
  ], [showFc]);

  const { sorted, sort, toggle, ariaSort } = useSort(rows, columns, { key: 'rank', dir: 'asc' });
  // tier rules only make sense in rank order
  const byRank = !sort || (sort.key === 'rank' && sort.dir === 'asc');
  const visible = sorted.slice(0, shown);

  const seen = new Set<string>();
  const lines = visible.map((r) => {
    const k = `${r.pos}:${r.tier}`;
    const first = !seen.has(k);
    seen.add(k);
    // one position: a rule before every tier; all positions: before each position's tier 2 and later
    const label = byRank && first && (pos !== 'all' || r.tier > 1) ? `${r.pos.toLowerCase()} tier ${r.tier}` : null;
    return { r, label };
  });
  const shownCols = phone ? columns.filter((c) => PHONE_KEEPS.has(c.key)) : more.on ? columns : columns.filter((c) => !c.more);
  const tucked = phone ? columns.filter((c) => !PHONE_KEEPS.has(c.key)) : [];
  const colSpan = shownCols.length + (phone ? 1 : 0);
  const repl = POS_ORDER.filter((p) => rankings.replacement[p] != null);

  return (
    <div className="stack">
      <section className="card" aria-labelledby="rank-title">
        <SectionHeader
          id="rank-title" title="rankings"
          tip={<>
            {formatCount(rankings.rows.length)} players · projections scored with your league’s settings. replacement level by position:{' '}
            {repl.map((p, i) => (
              <span key={p}>{i > 0 && ', '}<span title={`${rankings.starters[p] ?? 0} ${p.toLowerCase()} start across the league`}>replacement: {p.toLowerCase()} {formatPoints1(rankings.replacement[p]!)} pts</span></span>
            ))}.
          </>}
        />

        <div className="form-row">
          <label className="ctl">
            search rankings
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} placeholder="name or team" autoComplete="off" />
          </label>
          <label className="check"><input type="checkbox" checked={rookiesOnly} disabled={mode === 'rookie'} onChange={(e) => { setRookiesOnly(e.target.checked); setShown(PAGE); }} /> rookies only</label>
          {picks.length > 0 && (
            <label className="check"><input type="checkbox" checked={hideDrafted} onChange={(e) => { setHideDrafted(e.target.checked); setShown(PAGE); }} /> hide drafted ({picks.length})</label>
          )}
        </div>
        <div className="row between">
          <Segmented label="Position filter" value={pos} onChange={(p) => { setPos(p); setShown(PAGE); }} options={[{ value: 'all', label: 'all' }, ...positions.map((p) => ({ value: p, label: p.toLowerCase() }))]} />
          {!phone && <MoreColumns on={more.on} onToggle={more.toggle} label="rankings" />}
        </div>

        {rows.length === 0 ? <p className="note" role="status">{rankings.rows.length === 0 ? 'no projections yet: sleeper has not published this season’s numbers.' : 'nobody matches those filters.'}</p> : (
          <div className="tw" data-compact={phone ? 'true' : undefined}>
            <table className="rank-table">
              <caption className="sr-only">Draft rankings</caption>
              <thead>
                <tr>
                  {shownCols.map((c) => {
                    const sortable = c.sortable !== false && !!c.value;
                    return (
                      <th key={c.key} scope="col" className={c.numeric ? 'n' : undefined} aria-sort={sortable ? ariaSort(c.key) : undefined}>
                        {sortable ? (
                          <button type="button" className="th-btn" onClick={() => toggle(c.key)}>
                            {c.header}<span className="sort-ind" aria-hidden="true">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                          </button>
                        ) : c.header}
                      </th>
                    );
                  })}
                  {phone && <th scope="col" className="xc"><span className="sr-only">details</span></th>}
                </tr>
              </thead>
              <tbody>
                {lines.map(({ r, label }) => [
                  label && (
                    <tr key={`${r.pid}-break`} className="tier-break" data-testid="tier-break">
                      <td colSpan={colSpan}><span className="micro">{label}</span></td>
                    </tr>
                  ),
                  <Fragment key={r.pid}>
                    <tr
                      data-pid={r.pid} className={phone ? (open.isOpen(r.pid) ? 'click xopen' : 'click') : undefined}
                      onClick={phone ? (e) => { if (!onOwnControl(e)) open.toggle(r.pid); } : undefined}
                    >
                      {shownCols.map((c) => {
                        const cls = [c.numeric ? 'n' : '', c.className ?? ''].filter(Boolean).join(' ') || undefined;
                        return <td key={c.key} className={cls}>{c.render ? c.render(r) : (c.value?.(r) ?? '')}</td>;
                      })}
                      {phone && <ExpandCell open={open.isOpen(r.pid)} controls={`${base}-${r.pid}`} label={`${open.isOpen(r.pid) ? 'hide' : 'show'} details for ${r.name}`} onToggle={() => open.toggle(r.pid)} />}
                    </tr>
                    {phone && open.isOpen(r.pid) && (
                      <DetailRow id={`${base}-${r.pid}`} colSpan={colSpan} items={tucked.map((c) => ({ label: c.header, value: c.render ? c.render(r) : (c.value?.(r) ?? '') }))} />
                    )}
                  </Fragment>,
                ])}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > shown && (
          <div className="row">
            <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>show {Math.min(PAGE, rows.length - shown)} more</button>
            <span className="note">{shown} of {rows.length}</span>
          </div>
        )}
      </section>
    </div>
  );
}
