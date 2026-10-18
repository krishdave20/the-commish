import { useMemo } from 'react';
import { formatPoints1 } from '../../app/format';
import { useScenario } from '../../app/modelContext';
import { PAGES } from '../../app/names';
import { AvatarName } from '../../components/Avatar';
import { PlayerLink } from '../../components/PlayerLink';
import { MatchupGrade } from '../../components/MatchupGrade';
import { SectionHeader } from '../../components/SectionHeader';
import { SortableTable } from '../../components/SortableTable';
import type { Column } from '../../components/useSort';
import type { Engine, ModelPlayer } from '../../engine';
import { PlayerTags } from './PlayerTags';

interface Row {
  p: ModelPlayer;
  next: number;
  lo: number;
  hi: number;
  ros: number;
  added: boolean;
}

export function RosterCard({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const { currentWeek: cur, lastRegularWeek: last } = engine.model.meta;

  const rows = useMemo<Row[]>(() => {
    const scope = engine.scope(scenario);
    const adds = new Set(scenario.adds);
    return scope.myRoster().map((id) => scope.idx.P[id]).filter((p): p is ModelPlayer => !!p).map((p) => {
      const [lo, hi] = scope.range(p, cur + 1, true);
      let ros = 0;
      for (let w = cur + 1; w <= last; w++) ros += scope.val(p, w, true);
      return { p, next: scope.val(p, cur + 1, true), lo, hi, ros, added: adds.has(p.pid) };
    });
  }, [engine, scenario, cur, last]);

  const columns: Column<Row>[] = [
    {
      key: 'player', header: 'player', value: (r) => r.p.name, className: 'sticky-col',
      render: (r) => <AvatarName pid={r.p.pid} name={r.p.name} pos={r.p.pos} team={r.p.nfl ?? undefined} size={28}><PlayerLink pid={r.p.pid} name={r.p.name} /><PlayerTags p={r.p} added={r.added} /></AvatarName>,
    },
    { key: 'pos', header: 'pos', value: (r) => r.p.pos },
    { key: 'nfl', header: 'team', value: (r) => r.p.nfl ?? '', more: true },
    { key: 'avg', header: 'avg', more: true, numeric: true, value: (r) => r.p.seasonAvg, render: (r) => (r.p.seasonAvg == null ? '—' : formatPoints1(r.p.seasonAvg)) },
    {
      key: 'next', header: `wk ${cur + 1} proj`, numeric: true, value: (r) => r.next,
      render: (r) => (
        <span title={`floor ${formatPoints1(r.lo)} · expected ${formatPoints1(r.next)} · ceiling ${formatPoints1(r.hi)}`}>
          {formatPoints1(r.next)} <span className="dim">{formatPoints1(r.lo)}–{formatPoints1(r.hi)}</span>
        </span>
      ),
    },
    { key: 'ros', header: 'rest of season', numeric: true, value: (r) => r.ros, render: (r) => formatPoints1(r.ros) },
    {
      key: 'opp', header: `wk ${cur + 1} opp`, more: true,
      render: (r) => <MatchupGrade opponent={r.p.opp[cur + 1]} dvp={r.p.dvp[cur + 1]} />,
    },
  ];

  return (
    <section className="card" aria-labelledby="roster-title">
      <SectionHeader
        id="roster-title" title="roster"
        tip={`who you have. open a name on the ${PAGES.players.name} for usage, trade value and takes. projections are sleeper’s, scored with your league’s settings.`}
      />
      <SortableTable caption="Roster" columns={columns} rows={rows} rowKey={(r) => r.p.pid} initialSort={{ key: 'ros', dir: 'desc' }} tableId="roster" />
    </section>
  );
}
