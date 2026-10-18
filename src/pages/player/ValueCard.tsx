import { ordinal, signed, formatCount } from '../../app/format';
import { useFantasyCalc } from '../../app/playersData';
import { SectionHeader } from '../../components/SectionHeader';
import type { SleeperLeague } from '../../data';

/** FantasyCalc trade value with its 30-day change. Never fails loudly: when the service is down, a quiet reason. */
export function ValueCard({ pid, league }: { pid: string; league: SleeperLeague | null }) {
  const fc = useFantasyCalc(league);
  const row = fc?.ok ? fc.byId[pid] : undefined;
  const kind = fc?.params.isDynasty ? 'dynasty' : 'redraft';
  return (
    <section className="card" aria-labelledby="value-title">
      <SectionHeader
        id="value-title" title={fc?.params.isDynasty ? 'dynasty value' : 'trade value'}
        tip={<>{fc ? `trade value, ${kind} league settings.` : 'trade value.'} Values: FantasyCalc.</>}
      />
      {!league ? <p className="note">follow a league to see values for its format.</p>
        : !fc ? <p className="note" role="status">loading values…</p>
        : !fc.ok ? <p className="note" role="status">values are unavailable right now. {fc.reason}</p>
        : !row ? <p className="note">fantasycalc has no value for this player.</p>
        : (
          <div className="stats">
            <div className="stat"><span className="micro">value</span><span className="v">{formatCount(row.value)}</span>
              <span className="note">{row.overallRank !== null ? `${ordinal(row.overallRank)} overall` : ''}{row.positionRank !== null ? ` · ${row.position}${row.positionRank}` : ''}</span></div>
            <div className="stat"><span className="micro">30-day change</span>
              <span className={`v ${row.trend30Day === null ? '' : row.trend30Day > 0 ? 'pos-c' : row.trend30Day < 0 ? 'neg-c' : ''}`}>
                {row.trend30Day === null ? '—' : signed(row.trend30Day, 0)}
              </span>
              <span className="note">{row.trend30Day === null ? 'fantasycalc gives no trend for him' : 'change in trade value over the last 30 days'}</span></div>
          </div>
        )}
    </section>
  );
}
