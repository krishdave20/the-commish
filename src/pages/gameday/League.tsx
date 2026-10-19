import { formatPoints1, signed } from '../../app/format';
import { Avatar } from '../../components/Avatar';
import { useGrown } from '../../components/motion';
import type { BenchRow, GameBall } from '../../engine/live';

/* ---------- game balls ---------- */

export function GameBalls({ balls }: { balls: GameBall[] }) {
  if (!balls.length) return <p className="note">no points yet. the top five starters of the week land here.</p>;
  return (
    <ol className="gd-balls">
      {balls.map((b, i) => (
        <li key={b.pid + b.rid} data-me={b.isMe ? 'true' : undefined}>
          <span className="gd-rank">{i + 1}</span>
          <Avatar pid={b.pid} name={b.name} pos={b.pos} team={b.nfl ?? undefined} size={40} />
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
        <li key={r.rid} data-me={r.isMe ? 'true' : undefined} data-photo={r.top?.pid ? 'true' : undefined}>
          {r.top?.pid && <Avatar pid={r.top.pid} name={r.top.name} pos={r.top.pos} team={r.top.nfl ?? undefined} size={28} />}
          <span className="gd-pname">{r.team}</span>
          <span className="gd-meta">{r.top ? `${r.top.name} sat for ${formatPoints1(r.top.points)}` : 'best lineup started'}</span>
          <span className="gd-side-bar" aria-hidden="true"><i style={{ width: `${grown ? (r.left / top) * 100 : 0}%` }} /></span>
          <span className="gd-side-pts" title={`started ${formatPoints1(r.started)}, best lineup ${formatPoints1(r.best)}`}>{r.left > 0 ? signed(r.left) : '0.0'}</span>
        </li>
      ))}
    </ul>
  );
}
