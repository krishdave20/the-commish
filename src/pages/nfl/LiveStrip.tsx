import { Link } from 'react-router-dom';
import { LiveDot } from '../../components/ticker/LiveDot';
import type { NfGame } from '../../engine/nfl';
import { gameSentence, statusText } from './format';
import { byCloseness, redZoneTeam } from './liveLogic';
import { RedZoneBadge } from './RedZoneBadge';

/** "live now": a slim row at the top of the scoreboard, one small card for each game in progress, scrolling sideways, each a link to the live tab.
    Nothing when no game is on. */
export function LiveStrip({ games }: { games: readonly NfGame[] }) {
  if (games.length === 0) return null;
  const sorted = [...games].sort(byCloseness);
  return (
    <section className="nf-ls" aria-labelledby="nf-ls-h">
      <div className="nf-ls-head">
        <h3 id="nf-ls-h" className="nf-sub-h"><LiveDot /> live now · {games.length}</h3>
        <Link className="nf-ls-all" to={{ search: '?tab=live' }}>see all live games</Link>
      </div>
      <ul className="nf-ls-row">
        {sorted.map((g) => (
          <li key={g.id}>
            <Link className="nf-ls-card" to={{ search: '?tab=live' }} data-red={redZoneTeam(g) ? 'true' : undefined}>
              <span className="sr-only">{gameSentence(g)}, open the live tab. </span>
              <span className="nf-ls-status" aria-hidden="true">{statusText(g)}</span>
              <span className="nf-ls-teams" aria-hidden="true">
                <span><b>{g.away}</b> <i>{g.awayScore ?? '–'}</i></span>
                <span><b>{g.home}</b> <i>{g.homeScore ?? '–'}</i></span>
              </span>
              <RedZoneBadge game={g} compact />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
