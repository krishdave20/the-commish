import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePlayersFile } from '../../app/playersData';
import { formatPoints, formatPoints1 } from '../../app/format';
import { Avatar } from '../../components/Avatar';
import { Disclosure } from '../../components/Disclosure';
import { SectionHeader } from '../../components/SectionHeader';
import type { Almanac, GameEntry, PlayerWeek, ScoreEntry, SeasonEntry, StreakEntry } from '../../engine/almanac';
import { managerName, pctText, recordText, when } from './text';

/** One holder of a record: the figure, who has it, and the season and week. */
interface Line { key: string; value: string; who: ReactNode; sub: string; avatar?: ReactNode }

/** One record: its holder at a glance, and the top five behind a "top 5" link. */
function RecordCard({ id, title, tip, lines }: { id: string; title: string; tip?: string; lines: Line[] }) {
  const [first] = lines;
  return (
    <section className="card rec" aria-labelledby={id}>
      <SectionHeader id={id} title={title} level={3} tip={tip} />
      {first ? (
        <>
          <div className="rec-head">
            {first.avatar}
            <span className="rec-big">{first.value}</span>
          </div>
          <p className="rec-who">{first.who}</p>
          <p className="note">{first.sub}</p>
          {lines.length > 1 && (
            <Disclosure title="top 5" inline>
              <ol className="rec-top">
                {lines.map((l) => (
                  <li key={l.key}><span><b>{l.value}</b> {l.who}</span><span className="dim sub-note">{l.sub}</span></li>
                ))}
              </ol>
            </Disclosure>
          )}
        </>
      ) : <p className="note">nothing yet</p>}
    </section>
  );
}

const scoreLines = (es: ScoreEntry[]): Line[] => es.map((e) => ({
  key: `${e.season}-${e.week}-${e.mgr}`, value: formatPoints1(e.pts), who: e.team,
  sub: `${e.won ? 'beat' : e.pts === e.oppPts ? 'tied' : 'lost to'} ${e.oppTeam} ${formatPoints1(e.oppPts)} · ${when(e)}`,
}));
const gameLines = (gs: GameEntry[]): Line[] => gs.map((g) => ({
  key: `${g.season}-${g.week}-${g.winner.mgr}`, value: formatPoints1(g.margin), who: g.margin === 0 ? `${g.winner.team} and ${g.loser.team}` : `${g.winner.team} over ${g.loser.team}`,
  sub: `${formatPoints1(g.winner.pts)} to ${formatPoints1(g.loser.pts)} · ${when(g)}`,
}));
const seasonLines = (es: SeasonEntry[], stat: 'pf' | 'record'): Line[] => es.map((e) => ({
  key: `${e.season}-${e.mgr}`, value: stat === 'pf' ? formatPoints1(e.pf) : recordText(e.w, e.l, e.t), who: e.team,
  sub: `${e.season}${e.partial ? ' so far' : ''} · ${stat === 'pf' ? recordText(e.w, e.l, e.t) : `${pctText(e.pct)} · ${formatPoints(e.pf)} points`}`,
}));
const streakLines = (a: Almanac, es: StreakEntry[], noun: string): Line[] => es.map((e) => ({
  key: `${e.mgr}-${e.from.season}-${e.from.week}`, value: String(e.length), who: `${managerName(a, e.mgr)}, ${noun} in a row`,
  sub: `${when(e.from)} to ${when(e.to)}${e.ongoing && !a.current.complete ? ' · still going' : ''}`,
}));

const isPlayerId = (pid: string) => /^\d+$/.test(pid);

/** The best single-player week, with a headshot. Names come from the players file, which loads on its own. */
function PlayerRecord({ rows }: { rows: PlayerWeek[] }) {
  const players = usePlayersFile().data;
  const name = (pid: string) => {
    const p = players?.[pid];
    if (p) return p.position === 'DEF' ? `${p.team ?? pid} defense` : [p.first_name, p.last_name].filter(Boolean).join(' ') || pid;
    return isPlayerId(pid) ? 'a starter' : `${pid} defense`;
  };
  const who = (r: PlayerWeek): ReactNode => (isPlayerId(r.pid) && players?.[r.pid]
    ? <Link className="pname plink" to={`/players/${r.pid}`}>{name(r.pid)}</Link> : name(r.pid));
  const lines: Line[] = rows.map((r) => ({
    key: `${r.season}-${r.week}-${r.pid}`, value: formatPoints1(r.pts), who: who(r), sub: `for ${r.team} · ${when(r)}`,
    avatar: <Avatar pid={r.pid} name={name(r.pid)} size={40} pos={isPlayerId(r.pid) ? players?.[r.pid]?.position ?? undefined : 'DEF'} team={players?.[r.pid]?.team ?? undefined} />,
  }));
  return (
    <RecordCard id="rec-player" title="best player week" tip="the most points one starter scored in one week, with your league’s scoring. bench players never count." lines={lines} />
  );
}

/** The record book: the best and worst of everything, with the season and week. */
export function RecordsTab({ almanac: a }: { almanac: Almanac }) {
  const r = a.records;
  if (a.empty) return <p className="note">no games have been played yet. the record book grows every week.</p>;
  const partial = r.seasonRecordsPartial;
  return (
    <>
      <h2 className="sr-only">records</h2>
      <div className="rec-grid">
        <RecordCard id="rec-hi" title="highest score" lines={scoreLines(r.highestScore)} />
        <RecordCard id="rec-lo" title="lowest score" lines={scoreLines(r.lowestScore)} />
        <RecordCard id="rec-blow" title="biggest blowout" lines={gameLines(r.biggestBlowout)} />
        <RecordCard id="rec-close" title="closest game" tip="the smallest margin of any regular-season game. a tie counts as zero." lines={gameLines(r.closestGame)} />
        <RecordCard id="rec-loss" title="most points in a loss" lines={scoreLines(r.mostPointsInLoss)} />
        <RecordCard id="rec-win" title="fewest points in a win" lines={scoreLines(r.fewestPointsInWin)} />
        <RecordCard
          id="rec-season-pf" title={partial ? 'most points, season so far' : 'most points in a season'}
          tip="regular-season points for. a season still being played is left out until it is over." lines={seasonLines(r.mostPointsInSeason, 'pf')}
        />
        <RecordCard id="rec-best" title={partial ? 'best record so far' : 'best record'} lines={seasonLines(r.bestRecord, 'record')} />
        <RecordCard id="rec-worst" title={partial ? 'worst record so far' : 'worst record'} lines={seasonLines(r.worstRecord, 'record')} />
        <RecordCard id="rec-wstreak" title="longest win streak" tip="regular-season games, running across seasons. a tie ends a streak." lines={streakLines(a, r.longestWinStreak, 'wins')} />
        <RecordCard id="rec-lstreak" title="longest losing streak" lines={streakLines(a, r.longestLossStreak, 'losses')} />
        <PlayerRecord rows={r.topPlayerWeek} />
      </div>
      <p className="note">regular-season games only. playoff games count toward head-to-head series, not these records.</p>
    </>
  );
}
