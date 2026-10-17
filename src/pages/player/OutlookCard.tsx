import { useMemo } from 'react';
import { formatPoints1 } from '../../app/format';
import { MatchupGrade } from '../../components/MatchupGrade';
import type { Model, ModelPlayer } from '../../engine';

interface Props {
  model: Model;
  mp: ModelPlayer | undefined;
}

/** This week's projection with floor and ceiling, the next four opponents, and rest-of-season points with the position rank (all from the model). */
export function OutlookCard({ model, mp }: Props) {
  const { currentWeek: cur, lastRegularWeek: last, maxWeek } = model.meta;

  const ros = useMemo(() => {
    const total = (p: ModelPlayer) => { let s = 0; for (let w = cur + 1; w <= last; w++) s += p.mu[w] || 0; return s; };
    if (!mp) return null;
    const same = model.players.filter((p) => p.pos === mp.pos);
    const mine = total(mp);
    return { points: mine, rank: 1 + same.filter((p) => total(p) > mine).length, of: same.length };
  }, [model, mp, cur, last]);

  if (!mp) {
    return (
      <section className="card" aria-labelledby="outlook-title">
        <header><div className="micro">projection and schedule</div><h2 id="outlook-title">outlook</h2></header>
        <p className="note">no projection on file for this player in your league’s player pool.</p>
      </section>
    );
  }
  const weeks = Array.from({ length: 4 }, (_, i) => cur + 1 + i).filter((w) => w <= Math.min(maxWeek, last));
  return (
    <section className="card" aria-labelledby="outlook-title">
      <header><div className="micro">projection and schedule</div><h2 id="outlook-title">outlook</h2></header>
      <div className="stats">
        <div className="stat">
          <span className="micro">{mp.playedThisWeek ? `week ${cur} score` : `week ${cur} projection`}</span>
          <span className="v">{formatPoints1(mp.mu[cur] ?? 0)}</span>
          <span className="note">
            {mp.playedThisWeek ? 'his game has kicked off' : `floor ${formatPoints1(mp.lo[cur] ?? 0)} · ceiling ${formatPoints1(mp.hi[cur] ?? 0)}`}
          </span>
        </div>
        {ros && (
          <div className="stat">
            <span className="micro">rest of season, redraft</span>
            <span className="v">{formatPoints1(ros.points)}</span>
            <span className="note">{`${mp.pos}${ros.rank} of ${ros.of} in the pool`}</span>
          </div>
        )}
      </div>
      <div className="tw">
        <table>
          <caption className="sr-only">Next opponents</caption>
          <thead>
            <tr><th scope="col" className="n">wk</th><th scope="col">opponent</th><th scope="col" className="n">proj</th><th scope="col" className="n">floor–ceiling</th></tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w}>
                <td className="n">{w}</td>
                <td><MatchupGrade opponent={mp.opp[w]} dvp={mp.dvp[w]} /></td>
                <td className="n">{formatPoints1(mp.mu[w] ?? 0)}</td>
                <td className="n dim">{formatPoints1(mp.lo[w] ?? 0)}–{formatPoints1(mp.hi[w] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">grades compare the points each defense has allowed to the position with the league average; soft is 1.15 or more, tough is 0.87 or less.</p>
    </section>
  );
}
