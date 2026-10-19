import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatOdds, formatPoints, formatPoints1, ordinal, signed } from '../../app/format';
import { useScenario } from '../../app/modelContext';
import { LOSERS_COPY, PAGES } from '../../app/names';
import { useLosersSetting } from '../../components/bracket/useBracketData';
import { OddsCell } from '../../components/OddsCell';
import { SectionHeader } from '../../components/SectionHeader';
import { SortableTable } from '../../components/SortableTable';
import type { Column } from '../../components/useSort';
import type { Engine } from '../../engine';
import { weightsFor } from '../../engine/power';
import { benchLeft, streakLabel } from '../../engine/table';
import { usePastViews } from '../gameday/scout/useScoutData';
import { formatNote } from '../race/formatNote';
import { Movement } from '../race/power/RankingList';
import '../race/power/power.css';
import type { BoardRow, LeagueBoard } from './useLeagueBoard';

interface Props {
  engine: Engine;
  board: LeagueBoard;
  onOpen: (rid: number) => void;
}

const record = (w: number, l: number, t: number) => `${w}–${l}${t ? `–${t}` : ''}`;
const teamCol = (sticky = true): Column<BoardRow> => ({
  key: 'team', header: 'team', essential: true, value: (r) => r.team, className: sticky ? 'nowrap sticky-col' : 'nowrap',
  render: (r) => <><span className="pname">{r.team}</span>{r.isMe && <span className="you">you</span>}</>,
});
const meRow = (r: BoardRow) => (r.isMe ? 'me' : undefined);

/** odds are still simming when the model has none of its own and no what-if run has landed */
function usePending(engine: Engine) {
  const { live } = useScenario();
  return engine.model.oddsPending && !live;
}

/* ---------- standings ---------- */

export function StandingsTable({ engine, board, onOpen }: Props) {
  const divisions = engine.model.meta.divisions;
  const columns: Column<BoardRow>[] = [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.rank, className: 'dim' },
    teamCol(),
    { key: 'record', header: 'record', essential: true, numeric: true, value: (r) => r.t.wins + r.t.ties / 2, render: (r) => record(r.t.wins, r.t.losses, r.t.ties) },
    { key: 'pf', header: 'pf', essential: true, numeric: true, value: (r) => r.t.pf, render: (r) => formatPoints(r.t.pf) },
    { key: 'pa', header: 'pa', numeric: true, value: (r) => r.t.pa, render: (r) => formatPoints(r.t.pa), className: 'hide-sm' },
    {
      key: 'streak', header: 'streak', essential: true, value: (r) => (r.streak ? (r.streak.kind === 'W' ? r.streak.n : r.streak.kind === 'L' ? -r.streak.n : 0) : null),
      render: (r) => <span className={r.streak?.kind === 'W' ? 'pos-c' : r.streak?.kind === 'L' ? 'neg-c' : 'dim'}>{streakLabel(r.streak)}</span>,
    },
    ...(divisions > 0 ? [{ key: 'division', header: 'division', value: (r: BoardRow) => r.t.division, className: 'dim hide-sm' }] : []),
  ];
  return (
    <section className="card" aria-labelledby="atl-standings">
      <SectionHeader id="atl-standings" title="standings" tip={<>{formatNote(engine.model.meta)} ordered by wins (a tie counts half), then points for. the streak is the current run of wins or losses. click a team for its details.</>} />
      <SortableTable caption="League standings" columns={columns} rows={board.rows} rowKey={(r) => r.rid} tableId="atl-standings"
        initialSort={{ key: 'rank', dir: 'asc' }} onRowActivate={(r) => onOpen(r.rid)} rowClassName={meRow} />
    </section>
  );
}

/* ---------- after this week ---------- */

export function AfterWeekTable({ engine, board, onOpen }: Props) {
  const pending = usePending(engine);
  if (board.week === null) {
    return (
      <section className="card" aria-labelledby="atl-after">
        <SectionHeader id="atl-after" title="after this week" />
        <p className="note">the regular season is over: the standings are final. the brackets are on the <Link to={`${PAGES.race.path}?tab=brackets`}>{PAGES.race.name}</Link>.</p>
      </section>
    );
  }
  const columns: Column<BoardRow>[] = [
    { key: 'proj', header: '#', numeric: true, value: (r) => r.week.projRank, render: (r) => <>{r.week.projRank} <Movement m={r.week.move} /></> },
    teamCol(),
    {
      key: 'game', header: 'this week', essential: true, value: (r) => r.week.winP ?? -1,
      render: (r) => (r.week.winP === null ? <span className="dim">bye</span> : <><span className="dim">vs {r.oppName} · </span>{formatOdds(r.week.winP)}</>),
    },
    {
      key: 'record', header: 'proj record', essential: true, numeric: true, value: (r) => r.week.expWins,
      render: (r) => <span title={`${formatPoints1(r.week.expWins)} expected wins`}>{record(r.week.likely.w, r.week.likely.l, r.week.likely.t)}</span>,
    },
    { key: 'pf', header: 'proj pf', numeric: true, value: (r) => r.week.projPf, render: (r) => formatPoints1(r.week.projPf), className: 'hide-sm' },
    { key: 'expw', header: 'exp wins', more: true, numeric: true, value: (r) => r.week.expWins, render: (r) => formatPoints1(r.week.expWins) },
    { key: 'now', header: 'now', more: true, numeric: true, value: (r) => r.rank, render: (r) => ordinal(r.rank), className: 'dim' },
    { key: 'odds', header: 'playoffs', more: true, value: (r) => r.race.playoff, render: (r) => <OddsCell value={r.race.playoff} pending={pending} /> },
  ];
  return (
    <section className="card" aria-labelledby="atl-after">
      <SectionHeader
        id="atl-after" title={`after week ${board.week}`}
        tip={<>
          each game this week resolves to its win chance: the model’s expected lineup points for both teams and the league’s weekly spread.
          {' '}the projected record gives the game to the favourite; the order uses expected wins (wins plus the win chance), then points for plus
          {' '}this week’s expected points. once a game kicks off, its live win chance and projection take over, as on {PAGES.gameday.name}.
          {' '}the arrow is places gained against the standings now. what-ifs from the scenario bar apply to games not yet started.
        </>}
      />
      <SortableTable caption="Projected standings after this week" columns={columns} rows={board.rows} rowKey={(r) => r.rid} tableId="atl-after"
        initialSort={{ key: 'proj', dir: 'asc' }} onRowActivate={(r) => onOpen(r.rid)} rowClassName={meRow} />
    </section>
  );
}

/* ---------- power ---------- */

export function PowerTable({ engine, board, onOpen }: Props) {
  const pending = usePending(engine);
  const { mode } = useLosersSetting();
  const lc = LOSERS_COPY[mode];
  const maxTitle = Math.max(0.01, ...board.rows.map((r) => r.race.title));
  const p = board.power;
  const w = weightsFor(p?.hasRos ?? false);
  const pc = (x: number) => Math.round(x * 100);
  const columns: Column<BoardRow>[] = [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.power?.rank ?? null, className: 'dim' },
    teamCol(),
    { key: 'index', header: 'power', essential: true, numeric: true, value: (r) => r.power?.index ?? null, render: (r) => (r.power ? Math.round(r.power.index) : '—') },
    {
      key: 'ros', header: 'ros pts/wk', essential: true, numeric: true, value: (r) => r.ros.perWeek,
      render: (r) => <span title={`${formatPoints1(r.ros.total)} expected over ${r.ros.weeks} weeks`}>{r.ros.weeks ? formatPoints1(r.ros.perWeek) : '—'}</span>,
    },
    { key: 'pfpg', header: 'pf/g', numeric: true, value: (r) => r.power?.raw.pfpg ?? null, render: (r) => (r.power ? formatPoints1(r.power.raw.pfpg) : '—'), className: 'hide-sm' },
    { key: 'ap', header: 'all-play', numeric: true, value: (r) => r.race.allPlay.pct, render: (r) => r.race.allPlay.record, className: 'hide-sm' },
    { key: 'odds', header: 'playoffs', essential: true, value: (r) => r.race.playoff, render: (r) => <OddsCell value={r.race.playoff} pending={pending} /> },
    {
      key: 'luck', header: 'luck', more: true, numeric: true, value: (r) => r.race.luck,
      render: (r) => <span className={r.race.luck > 0.4 ? 'pos-c' : r.race.luck < -0.4 ? 'neg-c' : 'dim'}>{signed(r.race.luck)}</span>,
    },
    { key: 'title', header: 'title', more: true, value: (r) => r.race.title, render: (r) => (pending ? <span className="dim">…</span> : <OddsCell value={r.race.title} tone="scale" max={maxTitle} />) },
    {
      key: 'field', header: lc.odds, more: true, value: (r) => r.race.field,
      render: (r) => <span title={`${lc.oddsHeader}: chance of being crowned ${lc.champ}`}>{pending ? <span className="dim">…</span> : <OddsCell value={r.race.field} invert={mode === 'toilet'} />}</span>,
    },
  ];
  return (
    <section className="card" aria-labelledby="atl-power">
      <SectionHeader
        id="atl-power" title="team ratings"
        action={<Link to={`${PAGES.league.path}?tab=power`}>week by week →</Link>}
        tip={<>
          power is the week’s power-rankings index, 0 to 100 across the league: all-play win rate {pc(w.allPlay)}, points per game {pc(w.pf)},
          {' '}the last 3 weeks against the league average {pc(w.form)}{p?.hasRos ? `, and roster strength for the rest of the season ${pc(w.ros)}` : ''}.
          {p ? ` results through week ${p.through}.` : ' the first rankings arrive once week 1 is final.'}
          {' '}ros pts/wk is each lineup’s expected points a week from now to the end of the regular season. all-play is the record against every team every week;
          {' '}luck is wins minus all-play wins. the odds come from the same season simulation as the {PAGES.race.name}.
        </>}
      />
      <SortableTable caption="Team ratings and power rankings" columns={columns} rows={board.rows} rowKey={(r) => r.rid} tableId="atl-power"
        initialSort={{ key: p ? 'rank' : 'ros', dir: p ? 'asc' : 'desc' }} onRowActivate={(r) => onOpen(r.rid)} rowClassName={meRow} />
    </section>
  );
}

/* ---------- form & schedule ---------- */

export function FormTable({ engine, board, onOpen }: Props) {
  const { currentWeek: cur, lastRegularWeek: last } = engine.model.meta;
  const past = usePastViews(Math.min(cur, last + 1), true);
  const bench = useMemo(() => benchLeft(past.views.map((v) => v.view)), [past.views]);
  const benchOf = (rid: number) => bench[rid] ?? null;
  const columns: Column<BoardRow>[] = [
    teamCol(),
    {
      key: 'form', header: 'last 3', essential: true, numeric: true, value: (r) => r.power?.raw.form ?? null,
      render: (r) => (r.power ? <span className={r.power.raw.form > 0 ? 'pos-c' : r.power.raw.form < 0 ? 'neg-c' : 'dim'}>{signed(r.power.raw.form)}</span> : '—'),
    },
    {
      key: 'sos', header: 'schedule left', essential: true, numeric: true, value: (r) => r.sched.vsLeague,
      render: (r) => (r.sched.vsLeague === null ? <span className="dim">done</span> : (
        <span title={`opponents average ${formatPoints1(r.sched.oppAvg!)} expected points over ${r.sched.games} games`}>
          {signed(r.sched.vsLeague)} <span className="dim">{ordinal(r.sched.rank!)}</span>
        </span>
      )),
    },
    {
      key: 'bench', header: 'bench pts/wk', essential: true, numeric: true, value: (r) => benchOf(r.rid)?.perWeek ?? null,
      render: (r) => (past.loading ? <span className="dim">…</span> : benchOf(r.rid) ? formatPoints1(benchOf(r.rid)!.perWeek) : '—'),
    },
    { key: 'benchTotal', header: 'bench total', more: true, numeric: true, value: (r) => benchOf(r.rid)?.total ?? null, render: (r) => (benchOf(r.rid) ? formatPoints1(benchOf(r.rid)!.total) : '—') },
    { key: 'games', header: 'games left', more: true, numeric: true, value: (r) => r.sched.games, className: 'dim' },
  ];
  return (
    <section className="card" aria-labelledby="atl-form">
      <SectionHeader
        id="atl-form" title="form and schedule"
        tip={<>
          last 3 is the average over the last 3 finished weeks minus the league average of those weeks, in points per game.
          {' '}schedule left is the expected points of the opponents still to play against the league average for the same weeks: positive is harder,
          {' '}and 1st is the hardest. bench pts/wk is what each team left on its bench in finished weeks: its best possible lineup minus the one it started.
        </>}
      />
      <SortableTable caption="Form, schedule left and bench points" columns={columns} rows={board.rows} rowKey={(r) => r.rid} tableId="atl-form"
        initialSort={{ key: 'form', dir: 'desc' }} onRowActivate={(r) => onOpen(r.rid)} rowClassName={meRow} />
    </section>
  );
}
