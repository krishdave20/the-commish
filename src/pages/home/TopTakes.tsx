import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FEATURE, PAGES } from '../../app/names';
import { useTakes } from '../../app/useTakes';
import { SectionHeader } from '../../components/SectionHeader';
import { TakeCard } from '../takes/TakeCard';

const SHOWN = 3;

/** The top three hot takes about my own players, with a link to the full feed. */
export function TopTakes() {
  const t = useTakes();
  const mine = useMemo(() => t.takes.filter((x) => x.relevance === 'mine'), [t.takes]);
  return (
    <section className="card" aria-labelledby="home-takes-title">
      <SectionHeader
        id="home-takes-title" title={FEATURE.yourTakes}
        tip={<>{PAGES.takes.kicker}{t.throughWeek !== null ? `, data through week ${t.throughWeek}` : ''}.</>}
        action={<Link to={PAGES.takes.path}>all {t.takes.length} takes →</Link>}
      />
      {!t.ready ? <p className="note" role="status">building the model…</p>
        : mine.length === 0 ? <p className="empty-take" role="status">quiet week. no takes on your players clear the bar.</p>
        : <div className="take-feed">{mine.slice(0, SHOWN).map((x) => <div key={x.id} className="take-item"><TakeCard take={x} lean /></div>)}</div>}
    </section>
  );
}
