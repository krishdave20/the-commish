import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AvatarName } from '../../components/Avatar';
import { PlayerLink } from '../../components/PlayerLink';
import { SectionHeader } from '../../components/SectionHeader';
import { Segmented } from '../../components/Segmented';
import { SortableTable } from '../../components/SortableTable';
import type { Column } from '../../components/useSort';
import { CATEGORIES, CATEGORY_ORDER, aggregateStats, leaders, teamScoring } from '../../engine/nfl';
import type { CategoryId, LeaderRow, PlayerInfo, StatCol, TeamScoring, WeekOfStats } from '../../engine/nfl';
import { TeamCell } from './TeamCell';
import { signedDiff } from './format';

interface Props {
  weeks: WeekOfStats[];
  info: ReadonlyMap<string, PlayerInfo>;
  /** the standings' records, for the team table */
  records: ReadonlyMap<string, { abbr: string; pf: number; pa: number; games: readonly unknown[] }>;
  currentWeek: number;
  loading: boolean;
}

const fmt = (c: StatCol, v: number | null | undefined) => (v === null || v === undefined ? '—' : c.digits ? v.toFixed(c.digits) : String(Math.round(v)));
const dec = (v: number | null) => (v === null ? '—' : v.toFixed(1));

/** Is there a played row in this week? (Before the week's first kickoff its stat lines are empty.) */
const hasGames = (w: WeekOfStats) => Object.values(w.stats).some((l) => (l.gp ?? 0) > 0 || (l.gms_active ?? 0) > 0);

/** Players or teams: league leaders by category (season or the latest week) and team scoring. */
export function StatsView({ weeks, info, records, currentWeek, loading }: Props) {
  const [params, setParams] = useSearchParams();
  const set = (k: string, v: string | null) => setParams((prev) => {
    const out = new URLSearchParams(prev);
    if (v === null) out.delete(k); else out.set(k, v);
    return out;
  }, { replace: true });

  const view = params.get('view') === 'teams' ? 'teams' : 'players';
  const cat: CategoryId = (CATEGORY_ORDER as string[]).includes(params.get('cat') ?? '') ? (params.get('cat') as CategoryId) : 'passing';
  const category = CATEGORIES[cat];
  const by = category.rankBy.includes(params.get('by') ?? '') ? (params.get('by') as string) : category.rankBy[0]!;
  // "this week" is the latest week with a game played: the current week once a kickoff has happened, else the one before it
  const latest = [...weeks].reverse().find(hasGames) ?? null;
  const scope = params.get('span') === 'week' && latest ? 'week' : 'season';

  const totals = useMemo(() => aggregateStats(scope === 'week' && latest ? [latest] : weeks), [scope, latest, weeks]);
  const rows = useMemo(() => leaders(totals, info, cat, by), [totals, info, cat, by]);
  const teams = useMemo(() => teamScoring(records).filter((t) => t.games > 0), [records]);

  const ranked = category.cols.find((c) => c.key === by)!;
  const columns: Column<LeaderRow>[] = [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.rank, render: (r) => (r.tied ? `t${r.rank}` : r.rank), className: 'dim' },
    {
      key: 'player', header: 'player', value: (r) => r.name, className: 'nowrap sticky-col',
      render: (r) => <AvatarName pid={r.pid} name={r.name} pos={r.pos} team={r.team} size={28}><PlayerLink pid={r.pid} name={r.name} /> <span className="nf-meta">{r.pos}</span></AvatarName>,
    },
    { key: 'team', header: 'team', value: (r) => r.team, render: (r) => <span className="nf-abbr">{r.team}</span> },
    { key: 'gp', header: 'gp', numeric: true, value: (r) => r.games },
    { key: ranked.key, header: ranked.label, numeric: true, value: (r) => r.values[ranked.key] ?? null, render: (r) => <b>{fmt(ranked, r.values[ranked.key])}</b> },
    ...category.cols.filter((c) => c.key !== by).map((c): Column<LeaderRow> => ({
      key: c.key, header: c.label, numeric: true, more: true, value: (r) => r.values[c.key] ?? null, render: (r) => fmt(c, r.values[c.key]),
    })),
  ];

  const teamColumns: Column<TeamScoring>[] = [
    { key: 'team', header: 'team', value: (t) => t.abbr, className: 'nowrap sticky-col', render: (t) => <TeamCell abbr={t.abbr} /> },
    { key: 'gp', header: 'gp', numeric: true, value: (t) => t.games },
    { key: 'ppg', header: 'pts/g', numeric: true, value: (t) => t.ppg, render: (t) => dec(t.ppg) },
    { key: 'papg', header: 'allowed/g', numeric: true, value: (t) => t.papg, render: (t) => dec(t.papg) },
    { key: 'diffpg', header: 'diff/g', numeric: true, value: (t) => t.diffPg, render: (t) => (t.diffPg === null ? '—' : `${t.diffPg > 0 ? '+' : ''}${t.diffPg.toFixed(1)}`) },
    { key: 'pf', header: 'pf', numeric: true, more: true, value: (t) => t.pf },
    { key: 'pa', header: 'pa', numeric: true, more: true, value: (t) => t.pa },
    { key: 'diff', header: 'diff', numeric: true, more: true, value: (t) => t.diff, render: (t) => signedDiff(t.diff) },
  ];

  const span = scope === 'week' && latest ? `week ${latest.week}` : weeks.length ? `weeks 1 to ${weeks[weeks.length - 1]!.week}` : `week ${currentWeek}`;

  return (
    <section className="card" aria-labelledby="nf-stats-title">
      <SectionHeader
        id="nf-stats-title" title="nfl stats"
        tip={<>
          <p>league leaders are sums of sleeper’s weekly stat lines ({span}); a game counts when the player’s row shows him active. players level on the ranked stat share a rank (t2 is a tie for second), and everyone tied at the cut stays in, so the list can run past ten.</p>
          <p>team scoring is points for and against over every final game this season.</p>
        </>}
      />
      <div className="nf-toolbar">
        <Segmented label="stats view" value={view} onChange={(v) => set('view', v === 'players' ? null : v)} options={[{ value: 'players', label: 'players' }, { value: 'teams', label: 'teams' }]} />
        {view === 'players' && (
          <>
            <Segmented label="category" value={cat} onChange={(v) => set('cat', v === 'passing' ? null : v)} options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORIES[c].label }))} />
            <Segmented
              label="rank by" value={by} onChange={(v) => set('by', v === category.rankBy[0] ? null : v)}
              options={category.rankBy.map((k) => ({ value: k, label: category.cols.find((c) => c.key === k)!.label }))}
            />
            <Segmented
              label="span" value={scope} onChange={(v) => set('span', v === 'season' ? null : v)}
              options={[{ value: 'season', label: 'season' }, { value: 'week', label: latest ? `week ${latest.week}` : 'this week' }]}
            />
          </>
        )}
      </div>
      {loading && !weeks.length ? <p className="note" role="status">adding up the season’s stat lines…</p> : view === 'teams' ? (
        teams.length ? (
          <SortableTable caption="nfl team scoring" columns={teamColumns} rows={teams} rowKey={(t) => t.abbr} tableId="nfl-team-stats" initialSort={{ key: 'ppg', dir: 'desc' }} />
        ) : <p className="note" role="status">no games have been played yet.</p>
      ) : rows.length ? (
        <SortableTable key={`${cat}-${by}-${scope}`} caption={`${category.label} leaders by ${ranked.label}, ${span}`} columns={columns} rows={rows} rowKey={(r) => r.pid} tableId={`nfl-leaders-${cat}`} />
      ) : <p className="note" role="status">no {category.label} stats for {span} yet.</p>}
      <p className="note attribution">stats: sleeper public api.</p>
    </section>
  );
}
