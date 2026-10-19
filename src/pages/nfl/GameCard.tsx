import { cityOf } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';
import { FieldSituation } from '../../components/field';
import { LiveDot } from '../../components/ticker/LiveDot';
import { statusText, winnerOf } from './format';

interface Props {
  g: NfGame;
  /** how many of my starters play in this game (this week only) */
  mine: number;
  onOpen: (id: string) => void;
}

function Team({ g, side }: { g: NfGame; side: 'home' | 'away' }) {
  const abbr = side === 'home' ? g.home : g.away;
  const score = side === 'home' ? g.homeScore : g.awayScore;
  const rec = side === 'home' ? g.homeRecord : g.awayRecord;
  const w = winnerOf(g);
  return (
    <span className="nf-team" data-win={w === side ? 'true' : undefined} data-lose={w !== null && w !== side ? 'true' : undefined}>
      <span className="nf-abbr">{abbr}</span>{' '}
      <span className="nf-city">{cityOf(abbr)}{rec && <span className="nf-rec"> {rec}</span>}</span>{' '}
      <span className="nf-score">{score ?? '–'}</span>
    </span>
  );
}

/** One game: away over home, the score, the status and a thin bar of game time played. A button that opens the game's drawer.
    The visible text is its name; the little extra context is in trailing screen-reader text. */
export function GameCard({ g, mine, onOpen }: Props) {
  const pct = g.state === 'final' ? 100 : g.state === 'pre' ? 0 : g.elapsed === null ? null : Math.round(g.elapsed * 100);
  return (
    <button type="button" className="nf-card" data-state={g.state} data-mine={mine > 0 ? 'true' : undefined} onClick={() => onOpen(g.id)}>
      <span className="nf-top">
        <span className="nf-status" data-state={g.state}>{g.state === 'live' && <LiveDot />}{statusText(g)}</span>{' '}
        {g.channel && <span className="nf-chan">{g.channel}</span>}
      </span>
      <span className="nf-teams">
        <Team g={g} side="away" />
        <span className="sr-only"> at </span>
        <Team g={g} side="home" />
      </span>
      {g.state === 'live' && g.situation && <FieldSituation game={g} variant="card" />}
      <span className="nf-bar" aria-hidden="true" data-unknown={pct === null ? 'true' : undefined}><i style={{ width: `${pct ?? 0}%` }} /></span>
      {mine > 0 && <span className="nf-mine">{mine === 1 ? '1 of your starters' : `${mine} of your starters`}</span>}
      <span className="sr-only">{g.state === 'live' ? ', live' : ''}{', open game details'}</span>
    </button>
  );
}
