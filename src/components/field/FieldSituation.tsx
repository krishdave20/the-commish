import { useId, useState } from 'react';
import { formatKickoff } from '../../app/live/format';
import { fieldLabel, fieldRole, gameStatusText, situationText } from '../../engine/live';
import type { NflGame } from '../../engine/live';
import { MiniField } from './MiniField';
import './field.css';

/** Three dots for the timeouts a team has left. Decorative: the count is in the text beside it. */
export function TimeoutDots({ left }: { left: number | null }) {
  if (left === null) return null;
  return (
    <span className="fs-dots" aria-hidden="true">
      {[0, 1, 2].map((i) => <i key={i} data-on={i < left ? 'true' : undefined} />)}
    </span>
  );
}

function Timeouts({ game }: { game: NflGame }) {
  const s = game.situation;
  if (!s || (s.awayTimeouts === null && s.homeTimeouts === null)) return null;
  const one = (code: string, left: number | null) => left === null ? null : (
    <span className="fs-to" key={code}>
      <span aria-hidden="true">{code.toLowerCase()}</span><TimeoutDots left={left} /><span className="sr-only">{`${code.toLowerCase()} ${left} timeout${left === 1 ? '' : 's'} left`}</span>
    </span>
  );
  return <span className="fs-tos">{one(game.away, s.awayTimeouts)}{one(game.home, s.homeTimeouts)}</span>;
}

/** The quarter-by-quarter score of a game, a small table. */
export function LineScoreTable({ game }: { game: NflGame }) {
  const l = game.line;
  if (!l) return <p className="fs-note">the quarter scores are not available right now.</p>;
  return (
    <table className="fs-line">
      <caption className="sr-only">{`${game.away.toLowerCase()} at ${game.home.toLowerCase()}, points by quarter`}</caption>
      <thead>
        <tr><th scope="col"><span className="sr-only">team</span></th>{l.labels.map((q) => <th key={q} scope="col">{q}</th>)}<th scope="col">T</th></tr>
      </thead>
      <tbody>
        {(['away', 'home'] as const).map((side) => (
          <tr key={side}>
            <th scope="row">{(side === 'away' ? game.away : game.home).toLowerCase()}</th>
            {(side === 'away' ? l.away : l.home).map((p, i) => <td key={i}>{p}</td>)}
            <td>{side === 'away' ? game.awayScore : game.homeScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Props {
  game: NflGame;
  /** the player's NFL team and position: tells offense from defense. Leave out for the game as a whole. */
  team?: string | null;
  pos?: string;
  /** row: under a starter; card: on an NFL scoreboard card (no buttons inside); drawer: the game drawer, larger */
  variant?: 'row' | 'card' | 'drawer';
  /** a button opens the quarter-by-quarter score */
  quarters?: boolean;
}

/** What is going on in one NFL game, in the words a fantasy player wants: offense or defense, the down, the spot, the red zone, the quarter and clock, the
    timeouts, and a mini field. Not started: the kickoff time. Final: the score. Halftime: "halftime". Without a ball position (a kickoff, a break) it
    shows the quarter and clock alone. */
export function FieldSituation({ game, team, pos = '', variant = 'row', quarters = false }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const status = gameStatusText(game);
  const live = game.state === 'live';
  const s = game.situation;
  const role = live && s ? fieldRole(pos, team, s.possession) : null;
  const half = live && /^(h|half|halftime)$/i.test(game.quarter);
  const text = live && s && !half ? situationText(s) : '';
  const score = game.awayScore !== null && game.homeScore !== null ? `${game.away.toLowerCase()} ${game.awayScore}, ${game.home.toLowerCase()} ${game.homeScore}` : '';
  const cue = game.state === 'pre'
    ? `${game.away.toLowerCase()} at ${game.home.toLowerCase()}${game.kickoff !== null ? ` · ${formatKickoff(game.kickoff)}` : ''}`
    : game.state === 'final' ? `${score}${score ? ' · ' : ''}${status}` : half ? 'halftime' : '';
  const showField = live && !!s && !half;
  return (
    <div className="fs" data-variant={variant} data-state={game.state} data-red={live && s?.redZone ? 'true' : undefined}>
      <div className="fs-main">
        {role && <span className="fs-role" data-on={role.onField ? 'true' : undefined}>{role.label}</span>}
        {text && <span className="fs-text">{text}</span>}
        {live && s?.redZone && <span className="fs-rz">red zone</span>}
        {cue && <span className="fs-cue">{cue}</span>}
        {live && !half && status && variant !== 'card' && <span className="fs-clock">{status}</span>}
              </div>
      {showField && s && (
        <div className="fs-field">
          <MiniField game={game} situation={s} decorative={variant === 'card'} />
          {variant === 'card' && <span className="sr-only">{fieldLabel(game, s)}</span>}
        </div>
      )}
      {live && s && <Timeouts game={game} />}
      {quarters && game.state !== 'pre' && (
        <div className="fs-q">
          <button type="button" className="fs-q-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
            {open ? 'hide quarters' : 'quarters'}
          </button>
          {open && <div id={id} className="fs-q-body"><LineScoreTable game={game} /></div>}
        </div>
      )}
    </div>
  );
}
