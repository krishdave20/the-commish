import { formatKickoff } from '../../app/live/format';
import { useModel } from '../../app/modelContext';
import { NFL_COPY } from '../../app/names';
import { Avatar } from '../../components/Avatar';
import { Drawer } from '../../components/Drawer';
import { FieldSituation } from '../../components/field';
import { PageTabs } from '../../components/PageTabs';
import { PlayerLink } from '../../components/PlayerLink';
import { SectionHeader } from '../../components/SectionHeader';
import { LiveDot } from '../../components/ticker/LiveDot';
import { usePlayersFile } from '../../app/playersData';
import { cityOf, gameLeaders, playerInfo, slotDate, timeSlot } from '../../engine/nfl';
import type { DetailPlayer, GameLeader, NfGame } from '../../engine/nfl';
import { statusText, winnerOf } from './format';
import { RedZoneBadge } from './RedZoneBadge';
import { useGameDetail } from './useGameDetail';
import { useGameStats } from './useGameStats';
import { useMemo } from 'react';
import type { WeekStats } from '../../data';

interface Props {
  game: NfGame;
  week: number;
  currentWeek: number;
  season: string;
  /** false for "nfl only": no owners, no fantasy sections */
  fantasy: boolean;
  onClose: () => void;
}

function Linescore({ g }: { g: NfGame }) {
  const l = g.line;
  if (g.state === 'pre') return null;
  return (
    <section className="card" aria-labelledby="nf-q-title">
      <SectionHeader id="nf-q-title" level={3} title={NFL_COPY.byQuarter} tip="points in each quarter, from sleeper’s scores feed. it shows only when the quarters add up to the score on the board." />
      {l ? (
        <div className="tw">
          <table>
            <caption className="sr-only">points by quarter</caption>
            <thead><tr><th scope="col">team</th>{l.labels.map((q) => <th key={q} scope="col" className="n">{q}</th>)}<th scope="col" className="n">final</th></tr></thead>
            <tbody>
              {(['away', 'home'] as const).map((s) => (
                <tr key={s}>
                  <td className="pname">{s === 'away' ? g.away : g.home}</td>
                  {(s === 'away' ? l.away : l.home).map((p, i) => <td key={i} className="n">{p}</td>)}
                  <td className="n pname">{s === 'away' ? g.awayScore : g.homeScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="note">the quarter scores are not available for this game right now.</p>}
    </section>
  );
}

function Owner({ p }: { p: DetailPlayer }) {
  if (!p.owner) return <span className="dim">free agent</span>;
  return p.owner.isMe ? <span className="gold-c">you</span> : <span>{p.owner.team}</span>;
}

function Rows({ players, state, empty, id }: { players: DetailPlayer[]; state: NfGame['state']; empty: string; id: string }) {
  if (players.length === 0) return <p className="note">{empty}</p>;
  return (
    <ul className="nf-players" aria-label={id}>
      {players.map((p) => (
        <li key={p.pid} className="nf-player" data-me={p.owner?.isMe ? 'true' : undefined}>
          <span className="nf-pwho">
            <Avatar pid={p.pid} name={p.name} pos={p.pos} team={p.team} size={28} />
            <span className="nf-pwho-text">
              {p.pos === 'DEF' ? <span className="pname">{p.name}</span> : <PlayerLink pid={p.pid} name={p.name} />}
              {p.injury && <> <span className="chip down">{p.injury.toLowerCase()}</span></>}
              <span className="nf-meta">{p.pos} · {p.team}</span>
            </span>
          </span>
          <span className="nf-powner"><Owner p={p} /></span>
          <span className="nf-ppts" aria-label={p.points === null ? 'no points yet' : `${p.points.toFixed(1)} points`}>{p.points === null ? '–' : p.points.toFixed(1)}</span>
          {state !== 'final' && <span className="nf-pproj" aria-label={p.projection === null ? 'no projection' : `projected ${p.projection.toFixed(1)}`}>{p.projection === null ? '' : `proj ${p.projection.toFixed(1)}`}</span>}
        </li>
      ))}
    </ul>
  );
}

type Tab = 'mine' | 'league' | 'top' | 'waiver';

function FantasyMix({ g, week, currentWeek, stats }: { g: NfGame; week: number; currentWeek: number; stats: WeekStats | null }) {
  const { model } = useModel();
  const { detail, loading, fileError } = useGameDetail(g, week, currentWeek, stats);
  if (!model) return <p className="note" role="status">your league is still loading; the fantasy view for this game follows.</p>;
  if (!detail) return <p className="note" role="status">{loading ? 'loading who owns whom in your league…' : 'owners are not available right now.'}</p>;
  const rank = detail.rankedBy === 'points' ? 'by fantasy points' : 'by projection (the game has not started)';
  const first: Tab = detail.mine.length > 0 ? 'mine' : 'top';
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'mine', label: `your players ${detail.mine.length}` },
    { value: 'league', label: `your league ${detail.league.length}` },
    { value: 'top', label: 'top performers' },
    { value: 'waiver', label: 'waiver watch' },
  ];
  return (
    <section className="card" aria-labelledby="nf-fx-title">
      <SectionHeader
        id="nf-fx-title" level={3} title="the fantasy mix"
        tip={<>
          <p>points are your league’s scoring: from the matchups when a player is rostered, from the week’s stat lines when he is a free agent. projections are sleeper’s, scored with your league’s settings. owners are who held each player that week.</p>
          {fileError && <p>the player list could not be read, so only rostered players are shown.</p>}
        </>}
      />
      <PageTabs tabs={tabs} label="fantasy view" defaultTab={first} param="gt">
        {(tab) => (
          <div className="nf-mix">
            {tab === 'mine' && (
              <>
                <h4 className="nf-sub-h">{NFL_COPY.yourPlayers}</h4>
                <Rows id={NFL_COPY.yourPlayers} players={detail.mine} state={g.state} empty="none of your players are in this game." />
              </>
            )}
            {tab === 'league' && (
              <>
                <h4 className="nf-sub-h">{NFL_COPY.yourLeague}</h4>
                <Rows id={NFL_COPY.yourLeague} players={detail.league} state={g.state} empty="no other team in your league has a player in this game." />
                <p className="note">players on your team are in the first tab.</p>
              </>
            )}
            {tab === 'top' && (
              <>
                <h4 className="nf-sub-h">{NFL_COPY.topPerformers} · {rank}</h4>
                <Rows id={NFL_COPY.topPerformers} players={detail.top} state={g.state} empty={g.state === 'pre' ? 'no projections for this game yet.' : 'nobody has scored yet.'} />
              </>
            )}
            {tab === 'waiver' && (
              <>
                <h4 className="nf-sub-h">{NFL_COPY.waiverWatch} · free agents {detail.rankedBy === 'points' ? 'who scored' : 'projected best'}</h4>
                <Rows id={NFL_COPY.waiverWatch} players={detail.waiver} state={g.state} empty="no free agents stand out in this game." />
              </>
            )}
          </div>
        )}
      </PageTabs>
    </section>
  );
}

function LeaderLine({ label, l, team }: { label: string; l: GameLeader | null; team: string }) {
  return (
    <div className="nf-ldr">
      <dt>{label}</dt>
      <dd>
        {l
          ? (
            <>
              <Avatar pid={l.pid} name={l.name} pos={l.pos} team={team} size={28} />
              <span className="nf-ldr-who"><PlayerLink pid={l.pid} name={l.name} /> <span className="nf-meta">{l.pos}</span><span className="nf-ldr-line">{l.line}</span></span>
            </>
          )
          : <span className="dim">—</span>}
      </dd>
    </div>
  );
}

/** The box score's leaders: each team's best passer, rusher and receiver, from the week's stat lines for the two teams. */
function BoxLeaders({ g, stats, loading }: { g: NfGame; stats: WeekStats | null; loading: boolean }) {
  const file = usePlayersFile();
  const info = useMemo(() => playerInfo(file.data), [file.data]);
  const leaders = useMemo(() => gameLeaders(stats, info, [g.away, g.home]), [stats, info, g.away, g.home]);
  if (g.state === 'pre') return null;
  return (
    <section className="card" aria-labelledby="nf-ldr-title">
      <SectionHeader
        id="nf-ldr-title" level={3} title="team leaders"
        tip="the best passer, rusher and receiver of each team in this game, from sleeper’s stat lines for the week. a player counts for the team the player list gives him now."
      />
      {loading || file.loading ? <p className="note" role="status">loading the box score…</p> : (
        <div className="nf-ldrs">
          {leaders.map((t) => (
            <div key={t.team} className="nf-ldr-team">
              <h4 className="nf-sub-h">{cityOf(t.team)}</h4>
              <dl className="nf-ldr-list">
                <LeaderLine label="passing" l={t.passing} team={t.team} />
                <LeaderLine label="rushing" l={t.rushing} team={t.team} />
                <LeaderLine label="receiving" l={t.receiving} team={t.team} />
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A game opened from the scoreboard (or the ticker): the score, the quarters and the leaders (pure nfl), then, below a divider, the fantasy mix
    for your league (hidden by "nfl only"). */
export function GameDrawer({ game: g, week, currentWeek, season, fantasy, onClose }: Props) {
  const slot = timeSlot(g.kickoff);
  const w = winnerOf(g);
  const scoreLine = g.homeScore === null || g.awayScore === null ? null : `${g.away} ${g.awayScore}, ${g.home} ${g.homeScore}`;
  const { stats, loading } = useGameStats(season, g, week, currentWeek);
  return (
    <Drawer open onClose={onClose} title={`${cityOf(g.away)} at ${cityOf(g.home)}`} kicker={`week ${week} · ${slot.label}${g.kickoff ? ` · ${slotDate(g.kickoff)}` : ''}`}>
      <div className="nf-hero" data-state={g.state}>
        <div className="nf-hero-score">
          {(['away', 'home'] as const).map((s) => (
            <div key={s} className="nf-hero-side" data-win={w === s ? 'true' : undefined}>
              <span className="nf-abbr">{s === 'away' ? g.away : g.home}</span>
              <span className="nf-hero-pts">{(s === 'away' ? g.awayScore : g.homeScore) ?? '–'}</span>
              <span className="nf-meta">{s === 'away' ? g.awayRecord : g.homeRecord}</span>
            </div>
          ))}
        </div>
        <p className="nf-hero-line">
          <span className="nf-status" data-state={g.state}>{g.state === 'live' && <LiveDot />}{g.state === 'pre' && g.kickoff ? `kickoff ${formatKickoff(g.kickoff)}` : statusText(g)}</span>
          {[g.channel, g.stadiumCity].filter(Boolean).map((x) => <span key={x} className="nf-meta"> · {x}</span>)}
        </p>
        {scoreLine && <span className="sr-only">{scoreLine}</span>}
        {g.state === 'live' && <RedZoneBadge game={g} compact />}
        {g.state === 'live' && g.situation && <div className="nf-field"><FieldSituation game={g} variant="drawer" /></div>}
      </div>
      <Linescore g={g} />
      <BoxLeaders g={g} stats={stats} loading={loading} />
      {fantasy && (
        <>
          <hr className="nf-divider" />
          <p className="nf-fantasy-label">fantasy · your league</p>
          <FantasyMix g={g} week={week} currentWeek={currentWeek} stats={stats} />
        </>
      )}
    </Drawer>
  );
}
