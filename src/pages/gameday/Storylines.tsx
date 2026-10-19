import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { moved, recordText } from '../../engine/live';
import type { StandingsMove, Storyline } from '../../engine/live';

interface StripProps {
  stories: readonly Storyline[];
  /** opens the matchup a story is about */
  onOpen?: (matchupId: number) => void;
}

/** The week's storylines as a strip of short cards you swipe (it snaps card by card). A story about one matchup is a button that opens it. */
export function Storylines({ stories, onOpen }: StripProps) {
  if (!stories.length) return null;
  return (
    <ul className="gd-stories" aria-label="storylines">
      {stories.map((s) => {
        const lead = (
          <>
            <span className="gd-story-label">{s.label}</span>{' '}
            <span className="gd-story-head">{s.headline}</span>
          </>
        );
        // a story about one player leads with his headshot beside the number
        const body = (
          <>
            {s.player
              ? (
                <span className="gd-story-top">
                  <span className="gd-story-lead">{lead}</span>
                  <Avatar pid={s.player.pid} name={s.player.name} pos={s.player.pos} team={s.player.nfl ?? undefined} size={40} />
                </span>
              )
              : lead}{' '}
            <span className="gd-story-text">{s.text}</span>
          </>
        );
        return (
          <li key={s.kind} className="gd-story" data-tone={s.tone}>
            {s.matchupId !== undefined && onOpen
              ? <button type="button" className="gd-story-btn" onClick={() => onOpen(s.matchupId!)}>{body}{' '}<span className="sr-only">open the matchup</span></button>
              : <div className="gd-story-btn" data-static="true">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

const LIMIT = 6;
const RESULT = { W: 'won', L: 'lost', T: 'tied' } as const;
const arrow = (d: number) => (d > 0 ? `up ${d}` : d < 0 ? `down ${-d}` : 'same');

/** Who moved in the standings: the teams whose place (or playoff status) changes, with the record before and after. Live: if the results hold. */
export function StandingsMoves({ moves, playoffTeams, past, week }: { moves: readonly StandingsMove[]; playoffTeams: number; past: boolean; week: number }) {
  const [all, setAll] = useState(false);
  const changed = moved(moves);
  if (!moves.length) return null;
  // the teams that cross the playoff line first, then the biggest movers; the rest behind a button
  const ranked = [...changed].sort((p, q) => Number(q.line !== null) - Number(p.line !== null) || Math.abs(q.delta) - Math.abs(p.delta) || p.after.rank - q.after.rank);
  const list = all ? changed : ranked.slice(0, LIMIT).sort((p, q) => p.after.rank - q.after.rank);
  return (
    <section className="gd-moves" aria-label={past ? `who moved after week ${week}` : 'standings if the results hold'}>
      <h3 className="gd-h3">{past ? `who moved after week ${week}` : 'standings if the results hold'}</h3>
      {changed.length === 0 ? <p className="note">nobody changes places{past ? '' : ' if it holds'}.</p> : (
        <ol className="gd-move-list">
          {list.map((m) => (
            <li key={m.rid} data-me={m.isMe ? 'true' : undefined} data-dir={m.delta > 0 ? 'up' : m.delta < 0 ? 'down' : 'same'}>
              <span className="gd-move-rank">{m.after.rank}</span>
              <span className="gd-move-who">
                <span className="gd-pname">{m.name}</span>
                <span className="gd-meta">{recordText(m.before)} → {recordText(m.after)}{m.result ? ` · ${RESULT[m.result]}` : ''}</span>
              </span>
              <span className="gd-move-delta">
                <span aria-hidden="true">{m.delta > 0 ? '▲' : m.delta < 0 ? '▼' : '–'}{m.delta !== 0 ? Math.abs(m.delta) : ''}</span>
                <span className="sr-only">{arrow(m.delta)}</span>
              </span>
              <span className="gd-move-line" data-line={m.line ?? undefined}>{m.line === 'in' ? `into the top ${playoffTeams}` : m.line === 'out' ? `out of the top ${playoffTeams}` : ''}</span>
            </li>
          ))}
        </ol>
      )}
      {changed.length > LIMIT && (
        <button type="button" className="btn quiet gd-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? 'show fewer' : `show all ${changed.length}`}</button>
      )}
    </section>
  );
}
