import { useMemo } from 'react';
import { HeadlineStrip } from '../../../components/HeadlineStrip';
import { SectionHeader } from '../../../components/SectionHeader';
import { signed } from '../../../app/format';
import type { Engine } from '../../../engine';
import type { DynastyView } from '../useDynasty';
import { HISTORY_TAB } from '../finder/labels';
import { TradeCard } from './TradeCard';
import { ODDS_TRADES, useTradeOdds, useTrades } from './useTrades';
import './history.css';

const GRADE_ORDER = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−', 'D+', 'D', 'D−', 'F'];

interface Props {
  engine: Engine;
  dyn: DynastyView | null;
  /** the empty state points here */
  onFinder: () => void;
}

/** The league's real trades, newest first, each graded for both sides. */
export function HistoryTab({ engine, dyn, onFinder }: Props) {
  const view = useTrades(engine, dyn);
  const { grades } = view;
  const { odds, pending } = useTradeOdds(engine, grades);
  const newest = useMemo(() => [...grades].reverse(), [grades]);
  const mine = grades.flatMap((g) => g.sides.filter((s) => s.isMe));
  const best = mine.slice().sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade))[0];
  const year = grades.find((g) => g.labels.some((l) => l.kind === 'trade of the year'));
  const winner = year?.sides.find((s) => s.rid === year.winner);

  return (
    <>
      {grades.length > 0 && (
        <HeadlineStrip
          label="trades in your league"
          items={[
            { label: 'trades made', value: grades.length, sub: `through week ${engine.model.meta.currentWeek}` },
            { label: 'your trades', value: mine.length, sub: best ? `best grade ${best.grade}` : 'you have not traded' },
            { label: 'trade of the year', value: winner ? `week ${year!.trade.week}` : '—', sub: winner ? `${winner.team} ${signed(winner.swing)} pts` : 'nothing stands out yet' },
          ]}
        />
      )}
      <section className="card" aria-labelledby="history-title">
        <SectionHeader
          id="history-title" title={HISTORY_TAB}
          tip="each side is graded on its lineup swing: its best lineup with the deal minus without it, from the trade's week to the last playoff week. weeks already played use the points players actually scored; weeks to come use today's projections. the score is your swing a week minus 0.4 times the other side's, so a deal that took from the other side grades low for the loser. 'scored since' is the plain points the players received scored against the players sent. playoff odds are today's, with and without the deal."
        />
        {view.loading ? (
          <p className="note" role="status">reading the league’s transactions…</p>
        ) : view.error ? (
          <p className="note neg-c" role="status">could not read the league’s transactions. {view.error}</p>
        ) : grades.length === 0 ? (
          <div className="stack">
            <p className="note" role="status">no trades have gone through in this league this season. when one does, both sides get a grade here.</p>
            <div className="row"><button type="button" className="btn" onClick={onFinder}>see trade ideas</button></div>
          </div>
        ) : (
          <>
            <p className="note">graded on today’s rosters, so approximate: weeks played use real points, weeks to come use today’s projections.</p>
            <ol className="timeline" aria-label="trades, newest first">
              {newest.map((g) => <TradeCard key={g.trade.id} g={g} odds={odds[g.trade.id]} oddsPending={pending && !odds[g.trade.id] && grades.slice(-ODDS_TRADES).includes(g)} />)}
            </ol>
          </>
        )}
        {view.failed.length > 0 && !view.error && (
          <p className="note">{view.failed.length === 1 ? `week ${view.failed[0]} transactions` : `weeks ${view.failed.join(', ')} transactions`} could not be read, so any trade made then is missing.</p>
        )}
      </section>
    </>
  );
}
