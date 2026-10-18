import { useMemo } from 'react';
import { signed, formatCount } from '../../app/format';
import { FEATURE } from '../../app/names';
import { useFantasyCalc } from '../../app/playersData';
import { PlayerLink } from '../../components/PlayerLink';
import { SectionHeader } from '../../components/SectionHeader';
import { isDynasty } from '../../engine';
import type { FcEntry } from '../../engine';
import type { LeagueBundle } from '../../data';

const N = 5;

function Table({ caption, rows, mine }: { caption: string; rows: FcEntry[]; mine: Set<string> }) {
  return (
    <div className="stack">
      <h3>{caption}</h3>
      {rows.length === 0 ? <p className="note">none this month.</p> : (
        <div className="tw">
          <table>
            <caption className="sr-only">{caption}</caption>
            <thead><tr><th scope="col">player</th><th scope="col">pos</th><th scope="col" className="n">value</th><th scope="col" className="n">30 days</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.sleeperId} className={mine.has(e.sleeperId) ? 'me' : undefined}>
                  <td className="nowrap"><PlayerLink pid={e.sleeperId} name={e.name} />{mine.has(e.sleeperId) && <span className="you">you</span>}</td>
                  <td className="dim">{e.position}</td>
                  <td className="n">{formatCount(e.value)}</td>
                  <td className={`n ${(e.trend30Day ?? 0) > 0 ? 'pos-c' : 'neg-c'}`}>{signed(e.trend30Day ?? 0, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** FantasyCalc's 30-day value movers among players rostered in this league: the top and bottom five. */
export function Movers({ bundle, userId }: { bundle: LeagueBundle; userId: string | null }) {
  const fc = useFantasyCalc(bundle.league);
  const dynasty = isDynasty(bundle.league);
  const { up, down, mine } = useMemo(() => {
    const rostered = new Set<string>(), mineSet = new Set<string>();
    for (const r of bundle.rosters) {
      const isMine = !!userId && (r.owner_id === userId || !!r.co_owners?.includes(userId));
      for (const id of r.players ?? []) { rostered.add(id); if (isMine) mineSet.add(id); }
    }
    const rows = fc?.ok
      ? Object.values(fc.byId).filter((e) => e.position !== 'PICK' && rostered.has(e.sleeperId) && e.trend30Day !== null && e.trend30Day !== 0)
      : [];
    const sorted = rows.slice().sort((a, b) => (b.trend30Day ?? 0) - (a.trend30Day ?? 0));
    return {
      up: sorted.filter((e) => (e.trend30Day ?? 0) > 0).slice(0, N),
      down: sorted.filter((e) => (e.trend30Day ?? 0) < 0).slice(-N).reverse(),
      mine: mineSet,
    };
  }, [fc, bundle.rosters, userId]);

  return (
    <section className="card" aria-labelledby="movers-title">
      <SectionHeader id="movers-title" title={FEATURE.movers} tip="fantasycalc trade value, change over 30 days, for players rostered in your league." />
      {!dynasty && <p className="note" role="status">this league is not dynasty, so these are redraft trade values. the 30-day move matters most in dynasty leagues.</p>}
      {!fc ? <p className="note" role="status">loading values…</p>
        : !fc.ok ? <p className="note" role="status">values are unavailable right now. {fc.reason}</p>
        : (
          <div className="mvgrid">
            <Table caption="biggest risers" rows={up} mine={mine} />
            <Table caption="biggest fallers" rows={down} mine={mine} />
          </div>
        )}
    </section>
  );
}
