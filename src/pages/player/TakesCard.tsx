import { useMemo } from 'react';
import { FEATURE } from '../../app/names';
import { useTakes } from '../../app/useTakes';
import { SectionHeader } from '../../components/SectionHeader';
import { TakeCard } from '../takes/TakeCard';

/** The hot takes about this one player (the same ranked feed, filtered). */
export function PlayerTakes({ pid }: { pid: string }) {
  const t = useTakes();
  const mine = useMemo(() => t.takes.filter((x) => x.pid === pid), [t.takes, pid]);
  return (
    <section className="card" aria-labelledby="player-takes-title">
      <SectionHeader
        id="player-takes-title" title={FEATURE.takesForPlayer}
        tip={`rule-based reads from real numbers${t.throughWeek !== null ? `, data through week ${t.throughWeek}` : ''}.`}
      />
      {!t.ready ? <p className="note" role="status">the takes need your league’s model, which is still loading.</p>
        : mine.length === 0 ? <p className="note">quiet week. no takes on him clear the bar.</p>
        : <div className="stack">{mine.map((x) => <TakeCard key={x.id} take={x} compact />)}</div>}
    </section>
  );
}
