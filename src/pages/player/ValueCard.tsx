import { ordinal, signed } from '../../app/format';
import { useFantasyCalc } from '../../app/playersData';
import type { SleeperLeague } from '../../data';

/** FantasyCalc trade value with its 30-day change. Never fails loudly: when the service is down, a quiet reason. */
export function ValueCard({ pid, league }: { pid: string; league: SleeperLeague | null }) {
  const fc = useFantasyCalc(league);
  const row = fc?.ok ? fc.byId[pid] : undefined;
  const kind = fc?.params.isDynasty ? 'dynasty' : 'redraft';
  return (
    <section className="card" aria-labelledby="value-title">
      <header>
        <div className="micro">{fc ? `trade value, ${kind} league settings` : 'trade value'}</div>
        <h2 id="value-title">{fc?.params.isDynasty ? 'dynasty value' : 'trade value'}</h2>
      </header>
      {!league ? <p className="note">follow a league to see values for its format.</p>
        : !fc ? <p className="note" role="status">loading values…</p>
        : !fc.ok ? <p className="note" role="status">values are unavailable right now. {fc.reason}</p>
        : !row ? <p className="note">fantasycalc has no value for this player.</p>
        : (
          <div className="stats">
            <div className="stat"><span className="micro">value</span><span className="v">{Math.round(row.value).toLocaleString('en-US')}</span>
              <span className="note">{row.overallRank !== null ? `${ordinal(row.overallRank)} overall` : ''}{row.positionRank !== null ? ` · ${row.position}${row.positionRank}` : ''}</span></div>
            <div className="stat"><span className="micro">30-day change</span>
              <span className={`v ${row.trend30Day === null ? '' : row.trend30Day > 0 ? 'pos-c' : row.trend30Day < 0 ? 'neg-c' : ''}`}>
                {row.trend30Day === null ? '—' : signed(row.trend30Day, 0)}
              </span>
              <span className="note">{row.trend30Day === null ? 'fantasycalc gives no trend for him' : 'change in trade value over the last 30 days'}</span></div>
          </div>
        )}
      <p className="note">Values: FantasyCalc.</p>
    </section>
  );
}
