import { useMemo, useState } from 'react';
import { formatCount, formatPoints1, ordinal, signed } from '../../../app/format';
import { AvatarStack } from '../../../components/Avatar';
import { HeadlineStrip } from '../../../components/HeadlineStrip';
import type { HeadlineItem } from '../../../components/HeadlineStrip';
import { PlayerLink } from '../../../components/PlayerLink';
import { SectionHeader } from '../../../components/SectionHeader';
import { SortableTable } from '../../../components/SortableTable';
import type { Column } from '../../../components/useSort';
import { showLetter } from '../../../engine/draft/grades.ts';
import type { DraftGrades, PickGrade, TeamGrade } from '../../../engine/draft/grades.ts';
import { teamLabel } from '../model';
import type { DraftRoom } from '../model';
import { Highlights } from './Highlights';
import { LetterChip } from './LetterChip';
import { TeamGradeDrawer } from './TeamGradeDrawer';
import { useGradesView } from './useGrades';
import './grades.css';

/** The draft-day grade is only as good as today's projections and ADP: this label is the honest name for it. */
export const DRAFT_DAY_LABEL = 'draft day (approximate, using current projections and adp)';

interface Row {
  g: TeamGrade;
  team: string;
  mine: boolean;
}

const pts = (n: number) => signed(n, 0);

/** The league's real draft, graded: how it looked on draft day, and how it has turned out. */
export function GradesTab({ room }: { room: DraftRoom }) {
  const view = useGradesView(room);
  if (view.kind === 'ready') return <Ready room={room} grades={view.grades} />;
  return (
    <section className="card" aria-labelledby="grades-wait">
      <SectionHeader id="grades-wait" title="draft grades" />
      {view.kind === 'loading' && <p className={`note${view.error ? ' neg-c' : ''}`} role="status">{view.error ? `could not build the season model. ${view.error}` : 'pulling points so far and rosters…'}</p>}
      {view.kind === 'unfinished' && (
        <p className="note" role="status">
          {view.status === 'drafting' || view.status === 'paused' ? 'the draft is still on. grades appear when the last pick is made.'
            : view.status === 'complete' ? 'this draft has no picks to grade.'
              : 'grades appear once the draft is done: how each team’s picks looked on draft day and how they have turned out since.'}
        </p>
      )}
      {view.kind === 'mode' && (
        <div className="stack">
          <p className="note" role="status">the rankings on screen are for another draft mode, so they cannot grade your league’s {view.draftMode} draft.</p>
          <div><button type="button" className="btn solid" onClick={() => room.setMode(view.draftMode)}>show {view.draftMode} values</button></div>
        </div>
      )}
    </section>
  );
}

function pickLine(p: PickGrade) {
  return `${p.pos.toLowerCase()} · pick ${p.pickNo} · ${pts(p.overExp)} pts vs expected`;
}

function Ready({ room, grades }: { room: DraftRoom; grades: DraftGrades }) {
  const [open, setOpen] = useState<number | null>(null);
  const mineId = room.myRosterId;
  const me = grades.teams.find((t) => t.rosterId === mineId) ?? null;

  const rows = useMemo<Row[]>(
    () => grades.teams.map((g) => ({ g, team: teamLabel(room.teams, g.rosterId), mine: g.rosterId === mineId })),
    [grades.teams, room.teams, mineId],
  );

  const strip = useMemo<HeadlineItem[]>(() => {
    const name = (rid: number) => teamLabel(room.teams, rid);
    if (me) {
      const best = me.best, miss = me.worst;
      return [
        { label: 'your draft grade', value: <>{showLetter(me.draftDay.letter)} → {showLetter(me.hindsight.letter)}</>, sub: `draft day → hindsight · ${ordinal(me.hindsight.rank)} of ${grades.teamCount}` },
        { label: 'your best pick', value: best ? best.name : '—', sub: best ? pickLine(best) : undefined },
        { label: 'your biggest miss', value: miss && miss.overExp < 0 ? miss.name : '—', sub: miss && miss.overExp < 0 ? pickLine(miss) : 'no pick fell short of its slot' },
      ];
    }
    const top = grades.teams[0];
    return [
      { label: 'best draft so far', value: top ? name(top.rosterId) : '—', sub: top ? `${showLetter(top.draftDay.letter)} → ${showLetter(top.hindsight.letter)}` : undefined },
      { label: 'best pick', value: grades.steals[0]?.name ?? '—', sub: grades.steals[0] ? pickLine(grades.steals[0]) : undefined },
      { label: 'biggest miss', value: grades.busts[0]?.name ?? '—', sub: grades.busts[0] ? pickLine(grades.busts[0]) : undefined },
    ];
  }, [me, grades, room.teams]);

  const columns = useMemo<Column<Row>[]>(() => [
    { key: 'rank', header: '#', numeric: true, value: (r) => r.g.hindsight.rank, className: 'dim' },
    {
      key: 'team', header: 'team', essential: true, value: (r) => r.team, className: 'nowrap',
      render: (r) => (
        <span className="avatar-name">
          <AvatarStack
            size={20} max={2}
            players={r.g.picks.slice().sort((a, b) => b.total - a.total).slice(0, 2).map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }))}
          />
          <span><span className="pname">{r.team}</span>{r.mine && <span className="you">you</span>}</span>
        </span>
      ),
    },
    { key: 'dd', header: 'draft day', essential: true, value: (r) => r.g.draftDay.score, render: (r) => <LetterChip letter={r.g.draftDay.letter} label="draft day grade" /> },
    { key: 'hs', header: 'hindsight', essential: true, value: (r) => r.g.hindsight.overExp, render: (r) => <LetterChip letter={r.g.hindsight.letter} label="hindsight grade" /> },
    {
      key: 'moved', header: 'moved', numeric: true, value: (r) => r.g.rankChange,
      render: (r) => (r.g.rankChange === 0 ? <span className="dim">—</span> : <span className={r.g.rankChange > 0 ? 'pos-c' : 'neg-c'}>{r.g.rankChange > 0 ? '▲' : '▼'} {Math.abs(r.g.rankChange)}</span>),
    },
    {
      key: 'over', header: 'pts over expected', numeric: true, value: (r) => r.g.hindsight.overExp,
      render: (r) => <span className={r.g.hindsight.overExp >= 0 ? 'pos-c' : 'neg-c'}>{pts(r.g.hindsight.overExp)}</span>,
    },
    { key: 'kept', header: 'still rostered', numeric: true, value: (r) => r.g.kept, render: (r) => <>{r.g.kept}<span className="dim">/{r.g.picks.length}</span></> },
    { key: 'vor', header: 'draft vor', more: true, numeric: true, value: (r) => r.g.draftDay.vor, render: (r) => formatPoints1(r.g.draftDay.vor), className: 'dim' },
    { key: 'lineup', header: 'lineup pts', more: true, numeric: true, value: (r) => r.g.draftDay.lineup, render: (r) => formatCount(r.g.draftDay.lineup), className: 'dim' },
    { key: 'adp', header: 'vs adp', more: true, numeric: true, value: (r) => r.g.draftDay.adp, render: (r) => signed(r.g.draftDay.adp, 0), className: 'dim' },
    { key: 'total', header: 'pts so far + ros', more: true, numeric: true, value: (r) => r.g.hindsight.total, render: (r) => formatCount(r.g.hindsight.total), className: 'dim' },
    { key: 'gone', header: 'traded · dropped', more: true, numeric: true, value: (r) => r.g.traded + r.g.dropped, render: (r) => `${r.g.traded} · ${r.g.dropped}`, className: 'dim' },
    {
      key: 'mvp', header: 'mvp pick', more: true, value: (r) => r.g.mvp?.name ?? '',
      render: (r) => (r.g.mvp ? <PlayerLink pid={r.g.mvp.pid} name={r.g.mvp.name} /> : '—'), className: 'nowrap',
    },
  ], []);

  const openTeam = open === null ? null : grades.teams.find((t) => t.rosterId === open) ?? null;

  return (
    <div className="stack">
      <HeadlineStrip label={me ? 'your draft' : 'the draft'} items={strip} />

      <section className="card" aria-labelledby="grades-title">
        <SectionHeader
          id="grades-title" title="draft grades"
          tip={<>
            <strong>{DRAFT_DAY_LABEL}.</strong> sleeper only serves today’s projections and adp, not the numbers on draft day. adp barely moves after a draft;
            projections do. the grade blends the vor of the picks (45%), the projected starting lineup (35%) and how far each pick beat adp (20%, one pick capped at two rounds),
            ranked against the league.{' '}
            <strong>hindsight</strong> adds each pick’s points so far to his projected rest of season and compares that with what a pick in the same slot returned across this draft
            (a smoothed median). it scores the pick, so a player who was later dropped or traded still counts. grades are relative: every league has its A and its F.
          </>}
        />
        <p className="note">draft day grades use today’s projections and adp, so they are approximate. tap a team for every pick.</p>
        <SortableTable
          caption="Draft grades by team" columns={columns} rows={rows} rowKey={(r) => r.g.rosterId} tableId="draft-grades"
          initialSort={{ key: 'hs', dir: 'desc' }} rowClassName={(r) => (r.mine ? 'me' : undefined)} onRowActivate={(r) => setOpen(r.g.rosterId)}
        />
      </section>

      <Highlights grades={grades} teamName={(rid) => teamLabel(room.teams, rid)} />
      <TeamGradeDrawer grade={openTeam} room={room} onClose={() => setOpen(null)} />
    </div>
  );
}
