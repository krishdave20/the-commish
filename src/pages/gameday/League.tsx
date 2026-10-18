import { useMemo } from 'react';
import { formatOdds, formatPoints1, signed } from '../../app/format';
import { formatClockTime } from '../../app/live/format';
import { DriveField } from '../../components/art/DriveField';
import type { DriveMark } from '../../components/art/drive';
import { useGrown } from '../../components/motion';
import type { BenchRow, GameBall, LiveCtx, LiveSnapshot, MatchupLive, RawChange, Tag } from '../../engine/live';
import { gameText, gamesByTeam, metaOf } from '../../engine/live';

const TAG_CLASS: Record<Tag, string> = { 'upset alert': 'warn', 'nail-biter': 'ok', blowout: 'mute' };

export function Tags({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return <span className="gd-tags">{tags.map((t) => <span key={t} className={`pill ${TAG_CLASS[t]}`}>{t}</span>)}</span>;
}

/* ---------- around the league ---------- */

function Card({ m, projected, onOpen }: { m: MatchupLive; projected: boolean; onOpen: (id: number) => void }) {
  const grown = useGrown();
  const decided = m.final && !projected;
  const ls = projected ? m.a.projection : m.a.actual, rs = projected ? m.b.projection : m.b.actual;
  const p = Math.max(0, Math.min(1, m.winA));
  return (
    <li>
      <button
        type="button" className="gd-card" onClick={() => onOpen(m.id)} data-mine={m.a.isMe || m.b.isMe ? 'true' : undefined}
      >
        {/* no aria-label: the visible text is the accessible name (WCAG 2.5.3); plain-text spaces keep words apart */}
        <span className="gd-card-row" data-lead={ls > rs ? 'true' : undefined}><span className="gd-card-name">{m.a.name}</span>{' '}<span className="gd-card-pts">{formatPoints1(ls)}</span></span>
        {' '}<span className="gd-card-row" data-lead={rs > ls ? 'true' : undefined}><span className="gd-card-name">{m.b.name}</span>{' '}<span className="gd-card-pts">{formatPoints1(rs)}</span></span>
        <span className="gd-card-meter" aria-hidden="true"><i style={{ width: `${grown ? p * 100 : 50}%` }} /></span>
        {' '}<span className="gd-card-foot">
          <span>{decided ? 'final' : `${formatOdds(Math.max(p, 1 - p))} ${p >= 0.5 ? m.a.name : m.b.name}`}</span>{!decided && <>{' '}<span className="sr-only">to win</span></>}
          {' '}<span>{projected ? 'projected' : decided ? '' : `${m.left} left`}</span>
        </span>
        {' '}<Tags tags={m.tags} />{' '}<span className="sr-only">open as the main event</span>
      </button>
    </li>
  );
}

export function AroundLeague({ matchups, focusId, projected, onOpen }: { matchups: MatchupLive[]; focusId: number; projected: boolean; onOpen: (id: number) => void }) {
  const rest = matchups.filter((m) => m.id !== focusId);
  if (!rest.length) return <p className="note">no other matchups this week.</p>;
  return <ul className="gd-cards">{rest.map((m) => <Card key={m.id} m={m} projected={projected} onOpen={onOpen} />)}</ul>;
}

/* ---------- game balls ---------- */

export function GameBalls({ balls }: { balls: GameBall[] }) {
  if (!balls.length) return <p className="note">no points yet. the top five starters of the week land here.</p>;
  return (
    <ol className="gd-balls">
      {balls.map((b, i) => (
        <li key={b.pid + b.rid} data-me={b.isMe ? 'true' : undefined}>
          <span className="gd-rank">{i + 1}</span>
          <span className="gd-ball-who">
            <span className="gd-pname">{b.name}</span>
            <span className="gd-meta">{b.pos}{b.nfl ? ` · ${b.nfl}` : ''} · {b.team}{b.state === 'live' ? ' · live' : ''}</span>
          </span>
          <span className="gd-ball-pts">{formatPoints1(b.points)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- left on the sideline ---------- */

export function Sideline({ rows }: { rows: BenchRow[] }) {
  const grown = useGrown();
  const top = Math.max(1, ...rows.map((r) => r.left));
  if (!rows.length) return <p className="note">no rosters yet.</p>;
  return (
    <ul className="gd-side-rows">
      {rows.map((r) => (
        <li key={r.rid} data-me={r.isMe ? 'true' : undefined}>
          <span className="gd-pname">{r.team}</span>
          <span className="gd-meta">{r.top ? `${r.top.name} sat for ${formatPoints1(r.top.points)}` : 'best lineup started'}</span>
          <span className="gd-side-bar" aria-hidden="true"><i style={{ width: `${grown ? (r.left / top) * 100 : 0}%` }} /></span>
          <span className="gd-side-pts" title={`started ${formatPoints1(r.started)}, best lineup ${formatPoints1(r.best)}`}>{r.left > 0 ? signed(r.left) : '0.0'}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- the drive chart ---------- */

export function DriveChart({ changes, ctx, snapshot, empty, oppRid = null }: { changes: RawChange[]; ctx: LiveCtx; snapshot: LiveSnapshot | null; empty: string; oppRid?: number | null }) {
  const byTeam = useMemo(() => (snapshot ? gamesByTeam(snapshot.games) : new Map()), [snapshot]);
  const shown = useMemo(() => changes.slice(0, 60), [changes]);
  // one mark per play on the field strip: green for your team, warm red for your opponent, grey for everyone else
  const marks = useMemo<DriveMark[]>(() => shown.map((c) => ({
    id: c.id, t: c.clock, points: c.delta,
    side: c.rid === ctx.meRid ? 'me' : c.rid === oppRid ? 'opp' : 'other',
    text: `${signed(c.delta)} ${metaOf(ctx, c.pid).name.toLowerCase()}`,
  })), [shown, ctx, oppRid]);
  if (!changes.length) return <p className="note">{empty}</p>;
  return (
    <>
    <DriveField marks={marks} meName={ctx.teams[ctx.meRid]?.name ?? 'you'} oppName={oppRid !== null ? ctx.teams[oppRid]?.name ?? 'your opponent' : 'your opponent'} />
    <ol className="gd-feed" aria-label="scoring updates, newest first">
      {shown.map((c) => {
        const meta = metaOf(ctx, c.pid);
        const where = gameText(meta.nfl ? byTeam.get(meta.nfl) : null, meta.nfl);
        return (
          <li key={c.id} data-me={c.rid === ctx.meRid ? 'true' : undefined} data-neg={c.delta < 0 ? 'true' : undefined}>
            <span className="gd-feed-delta">{signed(c.delta)}</span>
            <span className="gd-feed-what">
              <span className="gd-pname">{meta.name.toLowerCase()}</span>
              {where && <span className="gd-meta"> · {where.toLowerCase()}</span>}
            </span>
            <span className="gd-feed-team">{ctx.teams[c.rid]?.name ?? ''}</span>
            <span className="gd-feed-time">{formatClockTime(c.clock)}</span>
          </li>
        );
      })}
    </ol>
    </>
  );
}
