import { Avatar, AvatarName } from '../../../components/Avatar';
import { PlayerLink } from '../../../components/PlayerLink';
import type { HingesResult } from '../../../engine/hinges';
import type { HeadToHead, Key, LineupNote, Move, ScoutLabels, ScoutPlayer, Tendencies, Threat } from '../../../engine/scouting';
import { signed1 } from '../../../engine/scouting';
import { opponentText, statusText } from '../matchup/format';

const pts1 = (x: number) => x.toFixed(1);

function Who({ p }: { p: ScoutPlayer | null }) {
  if (!p) return <span className="scout-dot" aria-hidden="true" />;
  return <Avatar pid={p.pid} name={p.name} pos={p.pos} team={p.nfl ?? undefined} size={28} />;
}

export function KeysList({ keys }: { keys: Key[] }) {
  return (
    <ol className="scout-list scout-keys">
      {keys.map((k, i) => (
        <li key={k.kind}>
          <span className="scout-n" aria-hidden="true">{i + 1}</span>
          <Who p={k.player} />
          <span className="scout-text">{k.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function LineupNotes({ notes, review, optimal }: { notes: LineupNote[]; review: boolean; optimal: boolean }) {
  if (!notes.length) {
    return <p className="note">{optimal ? (review ? 'they started the best lineup their roster allowed.' : 'nothing to fix: their lineup is the best their roster allows, and every starter is healthy.') : 'no single swap explains the gap.'}</p>;
  }
  return (
    <ul className="scout-list">
      {notes.map((n, i) => (
        <li key={`${n.kind}-${n.player?.pid ?? i}`} data-severity={n.severity}>
          <span className="scout-mark" aria-hidden="true" />
          <Who p={n.player} />
          <span className="scout-text">{n.text}</span>
          {n.gain > 0 && <span className="scout-num">{signed1(n.gain)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ThreatsBody({ threats, review }: { threats: Threat[]; review: boolean }) {
  if (!threats.length) {
    return <p className="note">{review ? 'no bench player outscored a starter beyond the swaps above.' : 'no healthy bench player is within 3.0 projected points of a starter he could replace.'}</p>;
  }
  return (
    <ul className="scout-list">
      {threats.map((x) => (
        <li key={x.player.pid}>
          <Who p={x.player} />
          <span className="scout-text">{x.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function HingesBody({ result }: { result: HingesResult }) {
  const rows = result.rows.slice(0, 5);
  return (
    <>
      <p className="note">
        their win chance now is {Math.round(result.winNow * 100)}%. each number is the points of win chance that ride on the starter, against a typical free agent.
      </p>
      <ul className="scout-list scout-hinges">
        {rows.map((r) => (
          <li key={r.pid}>
            <AvatarName pid={r.pid} name={r.name} pos={r.pos} team={r.nfl ?? undefined} size={28}>
              <span className="scout-hinge-who">
                <PlayerLink pid={r.pid} name={r.name} />
                <span className="scout-sub">{r.pos.toLowerCase()} · {opponentText(r)} · {statusText(r)} · proj {pts1(r.projection)}</span>
              </span>
            </AvatarName>
            <span className="scout-num" data-sign={r.atStake < -0.5 ? 'neg' : r.atStake < 0.5 ? 'zero' : 'pos'}>
              {Math.abs(Math.round(r.atStake)) === 0 ? '0' : Math.round(r.atStake) < 0 ? `−${Math.abs(Math.round(r.atStake))}` : Math.round(r.atStake)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function TendenciesBody({ t, loading }: { t: Tendencies; loading: boolean }) {
  if (!t.lines.length) return <p className="note">{loading ? 'reading the finished weeks…' : 'no finished weeks yet, so there is no pattern to read.'}</p>;
  return (
    <ul className="scout-list scout-plain">
      {t.lines.map((l) => <li key={l}><span className="scout-text">{l}</span></li>)}
    </ul>
  );
}

const when = (at: number) => (at ? new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(at).replace(/[  ]/g, ' ') : '');

export function MovesBody({ moves, loading }: { moves: Move[]; loading: boolean }) {
  if (!moves.length) return <p className="note">{loading ? 'reading the league’s transactions…' : 'no adds, drops or trades in the last two weeks.'}</p>;
  return (
    <ul className="scout-list">
      {moves.map((m) => {
        const lead = m.adds[0] ?? m.drops[0];
        return (
          <li key={m.id} data-kind={m.kind}>
            {lead ? <Avatar pid={lead.pid} name={lead.name} pos={lead.pos} team={lead.nfl ?? undefined} size={28} /> : <span className="scout-dot" aria-hidden="true" />}
            <span className="scout-text">{m.text}<span className="scout-sub"> · week {m.week}{m.at ? ` · ${when(m.at)}` : ''}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

export function HeadToHeadBody({ h, labels }: { h: HeadToHead; labels: ScoutLabels }) {
  if (!h.meetings.length) return <p className="note">{labels.youObj} and {labels.themObj} have not met yet this season.</p>;
  return (
    <>
      <p className="note">{labels.youObj} {h.summary}.</p>
      <ul className="scout-list scout-plain">
        {h.meetings.map((m) => (
          <li key={m.week}>
            <span className="scout-text">week {m.week}: {labels.youObj} {m.result === 'W' ? 'won' : m.result === 'L' ? 'lost' : 'tied'} {pts1(m.you)}–{pts1(m.them)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
