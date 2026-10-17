import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FEATURE, PAGES } from '../../app/names';
import { useTakes } from '../../app/useTakes';
import { TakeCard } from '../takes/TakeCard';

const SHOWN = 4;

/** The top hot takes about my own players. */
export function TopTakes() {
  const t = useTakes();
  const mine = useMemo(() => t.takes.filter((x) => x.relevance === 'mine'), [t.takes]);
  return (
    <section className="section" aria-labelledby="home-takes-title">
      <header className="row between">
        <div>
          <div className="micro">{PAGES.takes.kicker}{t.throughWeek !== null ? `, data through week ${t.throughWeek}` : ''}</div>
          <h2 id="home-takes-title">{FEATURE.yourTakes}</h2>
        </div>
        <Link to={PAGES.takes.path}>all {t.takes.length} takes →</Link>
      </header>
      {!t.ready ? <p className="note" role="status">building the model…</p>
        : mine.length === 0 ? <p className="empty-take" role="status">quiet week. no takes on your players clear the bar.</p>
        : <div className="take-feed">{mine.slice(0, SHOWN).map((x) => <div key={x.id} className="take-item"><TakeCard take={x} /></div>)}</div>}
    </section>
  );
}
