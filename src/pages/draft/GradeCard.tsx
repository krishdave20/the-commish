import { useMemo } from 'react';
import { PlayerLink } from '../../components/PlayerLink';
import { ordinal, signed, formatNum, formatPoints1 } from '../../app/format';
import { pickValues } from '../../engine';
import type { Mock, MockGrade, MockState, Rankings } from '../../engine';
import { lineupVsMedian } from './mockSession';
import { teamLabel } from './model';
import type { TeamInfo } from './model';
import { stealsAndReaches, valueLabel } from './valueText';

interface Props {
  grade: MockGrade;
  state: MockState;
  mock: Mock;
  rankings: Rankings;
  teams: ReadonlyMap<number, TeamInfo>;
}

/** The finished mock: the letter, where the lineup ranks, how it compares by position, and the best and worst picks. */
export function GradeCard({ grade, state, mock, rankings, teams }: Props) {
  const lines = useMemo(() => {
    const rosters: Record<number, ReturnType<Mock['roster']>> = {};
    for (const t of grade.table) rosters[t.rosterId] = mock.roster(t.rosterId);
    return lineupVsMedian(rosters, rankings, grade.rosterId);
  }, [grade, mock, rankings]);
  const picks = useMemo(() => pickValues(
    rankings,
    state.picks.filter((p) => p.rosterId === grade.rosterId).map((p) => ({ pick_no: p.pickNo, player_id: p.pid, roster_id: p.rosterId, round: p.round })),
  ), [state.picks, rankings, grade.rosterId]);
  const { steals, reaches } = useMemo(() => stealsAndReaches(picks), [picks]);

  return (
    <section className="card grade-card" aria-labelledby="grade-title">
      <header>
        <div className="micro">your projected starting lineup, against every other team’s</div>
        <h2 id="grade-title">your draft grade</h2>
      </header>
      <div className="grade-top">
        <div className="grade-letter" aria-label={`Grade ${grade.letter}`}>{grade.letter}</div>
        <div className="stack">
          <div className="stat"><span className="micro">lineup rank</span><span className="v">{ordinal(grade.rank)} <span className="dim">of {grade.teams}</span></span></div>
          <div className="stat"><span className="micro">vs the median team</span><span className={`v ${grade.vsMedian >= 0 ? 'pos-c' : 'neg-c'}`}>{signed(grade.vsMedian, 1)} <span className="dim">pts</span></span></div>
          <div className="stat"><span className="micro">projected lineup</span><span className="v">{formatPoints1(grade.total)} <span className="dim">pts</span></span></div>
        </div>
      </div>

      <div className="sidebyside">
        <div className="stack">
          <h3>lineup by position</h3>
          <div className="tw">
            <table>
              <caption className="sr-only">Your starting lineup by position against the league median</caption>
              <thead><tr><th scope="col">slot</th><th scope="col" className="n">you</th><th scope="col" className="n">median</th><th scope="col" className="n">diff</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label.toLowerCase()}</td>
                    <td className="n">{formatPoints1(l.mine)}</td>
                    <td className="n dim">{formatPoints1(l.median)}</td>
                    <td className={`n ${l.mine - l.median >= 0 ? 'pos-c' : 'neg-c'}`}>{signed(l.mine - l.median, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="stack">
          <h3>every lineup</h3>
          <div className="tw">
            <table>
              <caption className="sr-only">Projected lineup points for every team</caption>
              <thead><tr><th scope="col" className="n">#</th><th scope="col">team</th><th scope="col" className="n">pts</th></tr></thead>
              <tbody>
                {grade.table.map((t) => (
                  <tr key={t.rosterId} className={t.rosterId === grade.rosterId ? 'me' : undefined}>
                    <td className="n dim">{t.rank}</td>
                    <td>{teamLabel(teams, t.rosterId)}{t.rosterId === grade.rosterId && <span className="you">you</span>}</td>
                    <td className="n">{formatPoints1(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sidebyside">
        <PickList title="steals" empty="no picks went later than their adp." rows={steals} />
        <PickList title="reaches" empty="no picks went earlier than their adp." rows={reaches} />
      </div>
    </section>
  );
}

function PickList({ title, empty, rows }: { title: string; empty: string; rows: ReturnType<typeof stealsAndReaches>['steals'] }) {
  return (
    <div className="stack">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="note">{empty}</p> : (
        <ul className="plain" aria-label={title}>
          {rows.map((v) => {
            const l = valueLabel(v.value);
            return (
              <li key={v.pickNo} className="pv">
                <span><PlayerLink pid={v.pid} name={v.name} /> <span className="dim">{v.pos.toLowerCase()} · pick {v.pickNo}, adp {v.adp === null || v.adp === undefined ? '—' : formatNum(v.adp)}</span></span>
                <span className={l.tone}>{l.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
