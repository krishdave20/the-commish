import { AvatarStack } from '../../../components/Avatar';
import { ordinal } from '../../../app/format';
import type { PowerPlayer, PowerTeamWeek } from '../../../engine/power';

/** The movement mark: "↑3" in green, "↓1" in red, "—" when level. The words are for screen readers. */
export function Movement({ m }: { m: number | null }) {
  const dir = m === null ? 'none' : m > 0 ? 'up' : m < 0 ? 'down' : 'flat';
  const glyph = m === null || m === 0 ? '—' : m > 0 ? `↑${m}` : `↓${-m}`;
  const words = m === null ? 'first rankings' : m === 0 ? 'no change' : m > 0 ? `up ${m}` : `down ${-m}`;
  return (
    <span className="pw-move" data-dir={dir}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

interface Props {
  teams: PowerTeamWeek[];
  players: Record<number, PowerPlayer[]>;
  activeRid: number | null;
  onHover: (rid: number | null) => void;
  onPick: (rid: number) => void;
}

/** Rank, movement, team, index with a thin bar, record and the line. Rows are rows on a wide screen and cards on a phone. */
export function RankingList({ teams, players, activeRid, onHover, onPick }: Props) {
  return (
    <ol className="pw-list" aria-label="power rankings">
      {teams.map((t) => {
        const pct = Math.round(t.index);
        return (
          <li
            key={t.rid} className="pw-row" data-me={t.isMe || undefined} data-active={activeRid === t.rid || undefined} data-rid={t.rid}
            onMouseEnter={() => onHover(t.rid)} onMouseLeave={() => onHover(null)}
          >
            <span className="pw-rank"><span className="sr-only">rank </span>{t.rank}</span>
            <Movement m={t.movement} />
            <span className="pw-who">
              <AvatarStack players={players[t.rid] ?? []} size={28} max={2} />
              <button type="button" className="pw-team" aria-pressed={activeRid === t.rid} onClick={() => onPick(t.rid)} title={`show ${t.team} on the chart`}>
                <span className="pw-tname">{t.team}</span>
              </button>
              {t.isMe && <span className="you">you</span>}
            </span>
            <span className="pw-index">
              <span className="pw-num"><span className="sr-only">power index </span>{t.index.toFixed(1)}</span>
              <span className="pw-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></span>
            </span>
            <span className="pw-rec"><span className="sr-only">record </span>{t.record.w}–{t.record.l}{t.record.t ? `–${t.record.t}` : ''}</span>
            <span className="pw-line-text">{t.line}<span className="sr-only">. {ordinal(t.rank)} of {teams.length}.</span></span>
          </li>
        );
      })}
    </ol>
  );
}
