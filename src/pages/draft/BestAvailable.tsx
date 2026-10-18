import { PlayerLink } from '../../components/PlayerLink';
import type { RankedPlayer } from '../../engine';
import { useWatchlist } from '../../app/useWatchlist';
import { formatCount, formatNum, formatPoints1 } from '../../app/format';

interface Props {
  rows: readonly RankedPlayer[];
  caption: string;
  showFc: boolean;
  /** makes each row draftable */
  onPick?: (p: RankedPlayer) => void;
}

export function WatchStar({ pid, name }: { pid: string; name: string }) {
  const watch = useWatchlist();
  const on = watch.has(pid);
  return (
    <button type="button" className="tog star" aria-pressed={on} aria-label={`${on ? 'watching' : 'watch'} ${name}`} onClick={() => watch.toggle(pid)}>
      {on ? '★' : '☆'}
    </button>
  );
}

export function TierBadge({ tier }: { tier: number }) {
  return <span className={`pill ${tier === 1 ? 'ok' : 'mute'}`}>t{tier}</span>;
}

/** The best players left, by value over replacement, with tier. */
export function BestAvailable({ rows, caption, showFc, onPick }: Props) {
  return (
    <div className="tw">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="n">#</th><th scope="col">player</th><th scope="col">pos</th><th scope="col">tier</th>
            <th scope="col" className="n">vor</th><th scope="col" className="n">adp</th>
            {showFc && <th scope="col" className="n">fc value</th>}
            <th scope="col"><span className="sr-only">watch</span></th>
            {onPick && <th scope="col"><span className="sr-only">draft</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.pid}>
              <td className="n dim">{r.rank}</td>
              <td className="nowrap"><PlayerLink pid={r.pid} name={r.name} /> <span className="dim">{r.team ?? 'fa'}</span></td>
              <td className="dim">{r.pos.toLowerCase()}{r.posRank}</td>
              <td><TierBadge tier={r.tier} /></td>
              <td className="n">{formatPoints1(r.vor)}</td>
              <td className="n dim">{r.adp == null ? '—' : formatNum(r.adp)}</td>
              {showFc && <td className="n dim">{r.fc ? formatCount(r.fc.value) : '—'}</td>}
              <td><WatchStar pid={r.pid} name={r.name} /></td>
              {onPick && <td><button type="button" className="btn solid" aria-label={`Draft ${r.name}`} onClick={() => onPick(r)}>draft</button></td>}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="dim">nobody left at this position.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
