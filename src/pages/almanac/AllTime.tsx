import { formatPoints1 } from '../../app/format';
import { SectionHeader } from '../../components/SectionHeader';
import { SortableTable } from '../../components/SortableTable';
import type { Column } from '../../components/useSort';
import type { AllTimeRow, Almanac } from '../../engine/almanac';
import { managerName, pctText, recordText } from './text';

/** All-time standings: one row per manager, across every season. */
export function AllTime({ almanac: a, userId }: { almanac: Almanac; userId: string | null }) {
  const team = (r: AllTimeRow) => a.managers.get(r.mgr)?.team ?? '';
  const columns: Column<AllTimeRow>[] = [
    {
      key: 'mgr', header: 'manager', essential: true, value: (r) => managerName(a, r.mgr), className: 'nowrap sticky-col',
      render: (r) => (
        <>
          <span className="pname">{managerName(a, r.mgr)}</span>{userId === r.mgr && <span className="you">you</span>}
          {team(r) && team(r) !== managerName(a, r.mgr) && <span className="dim sub-note">{team(r)}</span>}
        </>
      ),
    },
    { key: 'seasons', header: 'seasons', numeric: true, value: (r) => r.seasons, className: 'hide-sm' },
    { key: 'record', header: 'record', numeric: true, essential: true, value: (r) => r.w + r.t / 2, render: (r) => recordText(r.w, r.l, r.t) },
    { key: 'pct', header: 'win %', numeric: true, essential: true, value: (r) => r.pct, render: (r) => pctText(r.pct) },
    { key: 'titles', header: 'titles', numeric: true, essential: true, value: (r) => r.titles, render: (r) => r.titles || '·' },
    { key: 'playoffs', header: 'playoffs', numeric: true, value: (r) => r.playoffs, render: (r) => r.playoffs || '·' },
    { key: 'pf', header: 'points for', numeric: true, value: (r) => r.pf, render: (r) => formatPoints1(r.pf), more: true },
    { key: 'pa', header: 'points against', numeric: true, value: (r) => r.pa, render: (r) => formatPoints1(r.pa), more: true },
    { key: 'toilets', header: 'toilet bowls', numeric: true, value: (r) => r.toilets, render: (r) => r.toilets || '·', more: true },
  ];
  return (
    <section className="card" aria-labelledby="alltime-title">
      <SectionHeader
        id="alltime-title" title="all-time standings"
        tip="regular-season games across every season, matched by sleeper account, so a manager keeps one line even when the team or roster number changes. titles and playoff trips come from the winners bracket; a toilet bowl is the toilet bowl winner, or the last-place team where the league plays no toilet bowl."
      />
      <SortableTable
        columns={columns} rows={a.allTime} rowKey={(r) => r.mgr} caption="All-time standings" tableId="almanac-alltime" defaultMore
        rowClassName={(r) => (r.mgr === userId ? 'me' : undefined)}
      />
    </section>
  );
}
