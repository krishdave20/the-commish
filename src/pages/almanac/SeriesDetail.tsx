import { formatPoints1 } from '../../app/format';
import type { Almanac, Meeting, Series } from '../../engine/almanac';
import { managerName, recordText } from './text';

const result = (m: Meeting, a: string) => (m.winner === null ? 'tie' : m.winner === a ? 'win' : 'loss');

/** One rivalry: the series record, the margins, the biggest win each way, the streak, the playoff meetings and every meeting with its score. */
export function SeriesDetail({ almanac: a, series: s }: { almanac: Almanac; series: Series }) {
  const A = managerName(a, s.a), B = managerName(a, s.b);
  const lead = s.aWins === s.bWins ? 'dead even' : s.aWins > s.bWins ? `${A} leads` : `${B} leads`;
  /** "by 50.0, 140.0 to 90.0, 2026 week 2" for the winner's side */
  const by = (m: Meeting, side: 'a' | 'b') => `by ${formatPoints1(Math.abs(m.aPts - m.bPts))}, ${formatPoints1(side === 'a' ? m.aPts : m.bPts)} to ${formatPoints1(side === 'a' ? m.bPts : m.aPts)}, ${m.season} week ${m.week}`;
  const streak = s.streak.length && s.streak.mgr ? `${managerName(a, s.streak.mgr)} has won the last ${s.streak.length === 1 ? 'meeting' : `${s.streak.length} meetings`}` : 'the last meeting was a tie';
  return (
    <div className="series">
      <div className="series-head">
        <span className="series-rec" aria-label={`${A} ${recordText(s.aWins, s.bWins, s.ties)} against ${B}`}>{recordText(s.aWins, s.bWins, s.ties)}</span>
        <span className="note">{lead}. the record reads from {A}’s side.</span>
      </div>
      <dl className="defs">
        <dt>average margin</dt><dd>{formatPoints1(s.avgMargin)} points</dd>
        <dt>average score</dt><dd>{A} {formatPoints1(s.aAvg)}, {B} {formatPoints1(s.bAvg)}</dd>
        <dt>biggest win, {A}</dt><dd>{s.biggestA ? by(s.biggestA, 'a') : `${B} has never lost to ${A}`}</dd>
        <dt>biggest win, {B}</dt><dd>{s.biggestB ? by(s.biggestB, 'b') : `${A} has never lost to ${B}`}</dd>
        <dt>current streak</dt><dd>{streak}</dd>
        <dt>playoff meetings</dt>
        <dd>
          {s.playoffMeetings.length === 0 ? 'none' : s.playoffMeetings.map((m) => (
            <span key={`${m.season}-${m.week}`} className="series-po">
              {m.season}, round {m.round ?? 1}: {m.winner === null ? 'tied' : `${managerName(a, m.winner)} won`} {formatPoints1(m.aPts)} to {formatPoints1(m.bPts)}
            </span>
          ))}
        </dd>
      </dl>
      <div className="tw">
        <table>
          <caption className="sr-only">Every meeting between {A} and {B}</caption>
          <thead><tr><th scope="col">when</th><th scope="col" className="n">{A}</th><th scope="col" className="n">{B}</th><th scope="col">result</th></tr></thead>
          <tbody>
            {s.meetings.map((m) => (
              <tr key={`${m.season}-${m.week}-${m.kind}-${m.round ?? 0}`}>
                <td className="nowrap">{m.season} wk {m.week}{m.kind === 'playoff' && <span className="pill warn"> playoffs</span>}</td>
                <td className="n">{formatPoints1(m.aPts)}</td>
                <td className="n">{formatPoints1(m.bPts)}</td>
                <td><span className={`pill ${result(m, s.a) === 'win' ? 'ok' : result(m, s.a) === 'loss' ? 'bad' : 'mute'}`}>{result(m, s.a) === 'tie' ? 'tie' : `${result(m, s.a) === 'win' ? A : B} won`}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">regular season and playoff games, from sleeper’s weekly results.</p>
    </div>
  );
}
