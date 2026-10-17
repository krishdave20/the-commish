import { ageOf, str } from '../../app/playersIndex';
import { useWatchlist } from '../../app/useWatchlist';
import type { PlayerRecord } from '../../data';
import type { ModelPlayer } from '../../engine';

function height(rec: PlayerRecord): string {
  const h = str(rec.height);
  if (!h) return '';
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    return `${Math.floor(n / 12)}′${n % 12}″`;
  }
  return h.replace(/"/g, '″').replace(/'/g, '′');
}

function experience(rec: PlayerRecord): string {
  const y = rec.years_exp;
  if (typeof y !== 'number') return '';
  return y === 0 ? 'rookie' : `${y} ${y === 1 ? 'year' : 'years'}`;
}

interface Props {
  pid: string;
  name: string;
  rec: PlayerRecord | undefined;
  mp: ModelPlayer | undefined;
  /** who owns him in the followed league, when known */
  owner: string | null;
}

/** The facts from Sleeper's players file, plus the watchlist button. */
export function HeaderCard({ pid, name, rec, mp, owner }: Props) {
  const watch = useWatchlist();
  const watching = watch.has(pid);
  const injury = rec?.injury_status || mp?.injury || '';
  const body = str(rec?.injury_body_part) || mp?.body || '';
  const depthPos = str(rec?.depth_chart_position);
  const depth = typeof rec?.depth_chart_order === 'number' ? `${depthPos || rec.position} ${rec.depth_chart_order}` : '';
  const age = rec ? ageOf(rec) : null;
  const facts: Array<[string, string]> = [
    ['age', age === null ? '' : String(age)],
    ['experience', rec ? experience(rec) : ''],
    ['injury', injury ? `${injury}${body ? `, ${body}` : ''}` : rec ? 'healthy' : ''],
    ['depth chart', depth],
    ['height', rec ? height(rec) : ''],
    ['weight', rec && str(rec.weight) ? `${str(rec.weight)} lb` : ''],
    ['college', rec ? str(rec.college) : ''],
    ['in your league', owner ?? ''],
  ];
  return (
    <section className="card" aria-labelledby="bio-title">
      <header>
        <div className="row between">
          <div>
            <div className="micro">the facts</div>
            <h2 id="bio-title">{name}</h2>
          </div>
          <button type="button" className={`btn${watching ? '' : ' solid'}`} aria-pressed={watching} onClick={() => watch.toggle(pid)}>
            {watching ? 'on your watchlist' : 'add to watchlist'}
          </button>
        </div>
      </header>
      {rec || mp ? (
        <dl className="defs">
          {facts.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : <p className="note">no player on file with that id.</p>}
    </section>
  );
}
