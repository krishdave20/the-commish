import { useMemo, useState } from 'react';
import { formatOdds, formatPoints1 } from '../../app/format';
import { formatKickoff, leadText } from '../../app/live/format';
import { FEATURE } from '../../app/names';
import { Whistle } from '../../components/art/Whistle';
import { Avatar } from '../../components/Avatar';
import { FieldSituation } from '../../components/field';
import { CountUp } from '../../components/CountUp';
import { Segmented } from '../../components/Segmented';
import { SectionHeader } from '../../components/SectionHeader';
import { LiveDot } from '../../components/ticker/LiveDot';
import { SLOT_LABEL } from '../../engine';
import type { LiveCtx, LiveSnapshot, MatchupLive, StarterLive, TeamLive } from '../../engine/live';
import { gameStatusText, winSeries } from '../../engine/live';
import { WinLine } from './WinLine';
import { WinMeter } from './WinMeter';

type Filter = 'all' | 'live' | 'pre' | 'done';

interface Props {
  m: MatchupLive;
  ctx: LiveCtx;
  frames: readonly LiveSnapshot[];
  /** nothing has been scored anywhere: the big numbers are projections */
  projected: boolean;
  /** the status chip beside the title: "live", "replay", "final", "kickoff sun 1:00 pm" */
  status: { label: string; live: boolean; replay?: boolean };
  /** the clock of any live game could not be read */
  assumed: boolean;
  /** shown when the page is focused on someone else's matchup */
  onBackToMine?: () => void;
}

function Side({ t, projected, lead }: { t: TeamLive; projected: boolean; lead: boolean }) {
  const big = projected ? t.projection : t.actual;
  return (
    <div className="gd-side" data-me={t.isMe ? 'true' : undefined} data-lead={lead ? 'true' : undefined}>
      <span className="gd-name">{t.name}{t.isMe && <span className="gd-you">you</span>}</span>
      <span className="gd-big" aria-label={`${t.name} ${projected ? 'projected ' : ''}${formatPoints1(big)}`}>
        <CountUp value={big} decimals={1} duration={350} />
      </span>
      <span className="gd-sub">
        {projected ? 'projected' : <>projected <b>{formatPoints1(t.projection)}</b></>}
        {' · '}
        {t.live + t.yet === 0 ? 'all done' : `${t.live + t.yet} left`}
      </span>
    </div>
  );
}

function StatusCell({ p }: { p: StarterLive }) {
  if (p.state === 'final') return <span className="gd-status" data-state="final">final</span>;
  if (p.state === 'idle') return <span className="gd-status" data-state="idle">no game</span>;
  if (p.state === 'live') {
    return (
      <span className="gd-status" data-state="live">
        <LiveDot />{p.game ? gameStatusText(p.game) || 'live' : 'live'}
      </span>
    );
  }
  return <span className="gd-status" data-state="pre">{p.game?.kickoff ? formatKickoff(p.game.kickoff) : 'on deck'}</span>;
}

function Starters({ t, filter }: { t: TeamLive; filter: Filter }) {
  const rows = t.starters.filter((p) => filter === 'all' || (filter === 'live' ? p.state === 'live' : filter === 'pre' ? p.state === 'pre' : p.state === 'final' || p.state === 'idle'));
  return (
    <div className="gd-team" data-me={t.isMe ? 'true' : undefined}>
      <div className="gd-team-head">
        <h3>{t.name}</h3>
        <span className="gd-sub">{t.done} done · {t.live} live · {t.yet} on deck</span>
      </div>
      {rows.length === 0 ? <p className="note">nobody here right now.</p> : (
        <ul className="gd-rows">
          {rows.map((p) => {
            const share = p.state === 'pre' || p.projection <= 0 ? 0 : Math.max(0, Math.min(1, p.actual / p.projection));
            return (
              <li key={p.pid} className="gd-row" data-state={p.state}>
                <span className="gd-slot">{SLOT_LABEL[p.slot] ?? p.slot}</span>
                <span className="gd-who">
                  <Avatar pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={28} />
                  <span className="gd-who-text">
                    <span className="gd-pname">{p.name}</span>
                    <span className="gd-meta">{p.pos}{p.nfl ? ` · ${p.gameText || p.nfl}` : ''}</span>
                  </span>
                </span>
                <StatusCell p={p} />
                <span className="gd-pts">{formatPoints1(p.actual)}</span>
                <span className="gd-proj" title={p.assumed ? 'clock unavailable: half the game is assumed left' : undefined}>
                  {formatPoints1(p.projection)}{p.assumed && <sup>*</sup>}
                </span>
                {p.game && p.game.id !== 'guess' && (p.state === 'live' || p.state === 'final') && (
                  <span className="gd-sit"><FieldSituation game={p.game} team={p.nfl} pos={p.pos} quarters /></span>
                )}
                <span className="gd-bar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The main event: the focused matchup as a big scoreboard, its live win chance, and every starter on both sides. */
export function MainEvent({ m, ctx, frames, projected, status, assumed, onBackToMine }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const left = m.a, right = m.b;
  const decided = m.final && !projected;
  const series = useMemo(() => winSeries(ctx, frames, left.rid).map((d) => ({ clock: d.clock, p: d.p })), [ctx, frames, left.rid]);
  const counts = {
    live: left.live + right.live, pre: left.yet + right.yet, done: left.done + right.done,
  };
  const lead = decided ? m.margin : projected ? left.projection - right.projection : m.margin;
  const noPoints = left.actual === 0 && right.actual === 0;
  const line = projected
    ? `${formatOdds(m.winA)} for ${left.name} before kickoff`
    : noPoints && !decided
      ? `no points yet · ${m.left} starters to play`
      : decided
      ? `final · ${m.margin === 0 ? 'tied' : `${m.margin > 0 ? left.name : right.name} won by ${Math.abs(m.margin).toFixed(1)}`}`
      : `${left.name} ${leadText(m.margin)} · ${m.left} ${m.left === 1 ? 'starter' : 'starters'} left`;
  return (
    <section className="gd-hero" aria-labelledby="gd-main">
      <SectionHeader
        id="gd-main" title={FEATURE.mainEvent}
        kicker={<span className="gd-status-line" data-replay={status.replay ? 'true' : undefined}>{status.live && <LiveDot />}{status.label}{decided && <Whistle size={22} className="art-blow" />}</span>}
        action={onBackToMine ? <button type="button" className="btn quiet" onClick={onBackToMine}>back to my matchup</button> : undefined}
        tip={(
          <>
            <p>each starter counts his points so far plus his projection for the part of his game still to play (from the game clock). a game that has not started counts at the full projection, a finished one at its actual points. the team figure is the sum.</p>
            <p>win chance uses the same model as before kickoff, but its spread shrinks with the starter-minutes left, so a lead matters more late. when every game is over it is 100% or 0%.</p>
          </>
        )}
      />
      <div className="gd-board" role="group" aria-label="scoreboard">
        <Side t={left} projected={projected} lead={lead > 0} />
        <WinMeter leftName={left.name} rightName={right.name} leftIsMe={left.isMe} p={m.winA} pre={m.preWinA} final={decided} projected={projected} />
        <Side t={right} projected={projected} lead={lead < 0} />
      </div>
      <p className="gd-line-text" role="status">{line}</p>
      {assumed && <p className="note">a game clock is missing, so half of each live game is assumed left (marked *).</p>}
      <div className="gd-chart">
        <h3 className="gd-h3">{FEATURE.winOverTime}</h3>
        <WinLine points={series} pre={m.preWinA} name={left.name} />
      </div>
      <div className="gd-starters">
        <div className="row between">
          <h3 className="gd-h3">starters</h3>
          <Segmented
            label="show starters" value={filter} onChange={setFilter}
            options={[
              { value: 'all', label: 'all' },
              { value: 'live', label: `live ${counts.live}` },
              { value: 'pre', label: `${FEATURE.onDeck} ${counts.pre}` },
              { value: 'done', label: `${FEATURE.finalWhistle} ${counts.done}` },
            ]}
          />
        </div>
        <div className="gd-teams">
          <Starters t={left} filter={filter} />
          <Starters t={right} filter={filter} />
        </div>
      </div>
    </section>
  );
}
