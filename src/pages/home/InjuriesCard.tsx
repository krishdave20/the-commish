import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FEATURE, PAGES } from '../../app/names';
import { PlayerLink } from '../../components/PlayerLink';
import type { Engine, ModelPlayer } from '../../engine';
import { PlayerTags } from '../team/PlayerTags';

/** Injury flags on the starters set in Sleeper (questionable, doubtful, out, IR). */
export function InjuriesCard({ engine }: { engine: Engine }) {
  const flagged = useMemo(() => {
    const idx = engine.scope().idx.P;
    return engine.me.starters
      .filter((id) => id && id !== '0')
      .map((id) => idx[id])
      .filter((p): p is ModelPlayer => !!p && (!!p.injury || p.onIr));
  }, [engine]);
  return (
    <section className="card" aria-labelledby="injuries-title">
      <header>
        <div className="micro">your starters in sleeper</div>
        <h2 id="injuries-title">{FEATURE.injuries}</h2>
      </header>
      {flagged.length === 0 ? <p className="note">no injury flags on your starters.</p> : (
        <ul className="plain" aria-label="Injury flags">
          {flagged.map((p) => (
            <li key={p.pid} className="flag-line"><PlayerLink pid={p.pid} name={p.name} /><span className="dim">{p.pos} {p.nfl ?? ''}</span><PlayerTags p={p} />{p.body ? <span className="note">{p.body}</span> : null}</li>
          ))}
        </ul>
      )}
      <p><Link to={PAGES.team.path}>open the {PAGES.team.name} →</Link></p>
    </section>
  );
}
