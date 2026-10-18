import { Link } from 'react-router-dom';
import { signed, formatMoney } from '../../app/format';
import { useScenario } from '../../app/modelContext';
import { FEATURE, PAGES } from '../../app/names';
import { useTryWaiver } from '../../app/tryWaiver';
import { useComputed } from '../../app/useComputed';
import { useDebounced } from '../../app/useSimulation';
import { PlayerLink } from '../../components/PlayerLink';
import { SectionHeader } from '../../components/SectionHeader';
import type { Engine } from '../../engine';
import { PlayerTags } from '../team/PlayerTags';

/** The three best adds for the rest of the season (the waiver wire's top of the board). */
export function WaiversCard({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const tryIt = useTryWaiver();
  const settled = useDebounced(scenario, 250);
  const board = useComputed(() => engine.waivers(settled, 'reg').list.slice(0, 3), [engine, settled]);

  return (
    <section className="card" aria-labelledby="home-waivers-title">
      <SectionHeader
        id="home-waivers-title" title={FEATURE.waiverAdds} tip={`${FEATURE.lift}: the points an add brings to your best lineup, rest of season.`}
        action={<Link to={PAGES.waivers.path}>open the {PAGES.waivers.name} →</Link>}
      />
      {board.value === null ? <p className="note" role="status">working out lineup lift for every free agent…</p>
        : board.value.length === 0 ? <p className="note">nobody on the wire beats your bench right now.</p>
        : (
          <ol className="plain" aria-label="Top waiver adds">
            {board.value.map((w) => (
              <li key={w.pid} className="row between">
                <span>
                  <PlayerLink pid={w.player.pid} name={w.player.name} /> <span className="dim">{w.player.pos} {w.player.nfl ?? ''}</span><PlayerTags p={w.player} />
                  <br /><span className="note">drop {w.drop.name} · bid {formatMoney(w.bid)}</span>
                </span>
                <span className="row">
                  <span className="pos-c">{signed(w.gain)}</span>
                  <button type="button" className="tog" aria-label={`try adding ${w.player.name} and dropping ${w.drop.name}`} onClick={() => tryIt(w)}>try</button>
                </span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
