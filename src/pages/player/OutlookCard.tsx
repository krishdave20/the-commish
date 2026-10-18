import { useMemo } from 'react';
import { formatPoints1 } from '../../app/format';
import { MatchupGrade } from '../../components/MatchupGrade';
import { SectionHeader } from '../../components/SectionHeader';
import type { Model, ModelPlayer } from '../../engine';

interface Props {
  model: Model;
  mp: ModelPlayer | undefined;
}

/** The next four opponents with the model's projection, floor and ceiling (the headline figures sit in the strip above). */
export function OutlookCard({ model, mp }: Props) {
  const { currentWeek: cur, lastRegularWeek: last, maxWeek } = model.meta;
  const weeks = useMemo(() => Array.from({ length: 4 }, (_, i) => cur + 1 + i).filter((w) => w <= Math.min(maxWeek, last)), [cur, maxWeek, last]);

  if (!mp) {
    return (
      <section className="card" aria-labelledby="outlook-title">
        <SectionHeader id="outlook-title" title="outlook" />
        <p className="note">no projection on file for this player in your league’s player pool.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="outlook-title">
      <SectionHeader
        id="outlook-title" title="outlook"
        tip="next opponents with the model’s projection. grades compare the points each defense has allowed to the position with the league average; soft is 1.15 or more, tough is 0.87 or less."
      />
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
    </section>
  );
}
