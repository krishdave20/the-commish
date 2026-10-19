import { formatPoints1 } from '../../app/format';
import { HeadlineStrip } from '../../components/HeadlineStrip';
import type { HeadlineItem } from '../../components/HeadlineStrip';
import { SectionHeader } from '../../components/SectionHeader';
import type { Almanac } from '../../engine/almanac';
import { calloutText, managerName } from './text';

/** The answer first: how much history there is, the reigning champion, the standout, and where this season sits against all of it. */
export function Headline({ almanac: a }: { almanac: Almanac }) {
  const years = a.outcomes.map((o) => o.season);
  const span = years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : years[0] ?? '';
  const reigning = a.outcomes.find((o) => o.champion);
  const mostTitles = a.allTime.filter((r) => r.titles > 0).sort((x, y) => y.titles - x.titles)[0];
  const top = a.records.highestScore[0];
  const items: HeadlineItem[] = [
    { label: 'seasons on record', value: <span>{a.outcomes.length}</span>, sub: span },
    reigning?.champion
      ? { label: reigning.complete ? 'reigning champion' : 'last champion', value: <span className="strip-name">{reigning.champion.team}</span>, sub: `${reigning.season} · ${managerName(a, reigning.champion.mgr)}` }
      : { label: 'champion', value: <span className="strip-name">not yet</span>, sub: a.outcomes[0]?.complete ? 'no champion on record' : 'the playoffs have not been played' },
    mostTitles
      ? { label: 'most titles', value: <span>{mostTitles.titles}</span>, sub: managerName(a, mostTitles.mgr) }
      : { label: 'games on record', value: <span>{a.games.length}</span>, sub: 'regular season' },
    ...(top ? [{ label: 'highest score ever', value: <span>{formatPoints1(top.pts)}</span>, sub: `${top.team} · ${top.season} week ${top.week}` }] : []),
  ];
  const scope = a.hasHistory ? 'in league history' : 'this season';
  const lines = a.callouts.map((c) => ({ k: c.kind, text: calloutText(c, scope) }));
  const title = a.current.complete ? `${a.current.season} against the record book` : `${a.current.season} so far, against the record book`;
  return (
    <>
      <HeadlineStrip label="the league's history" items={items} />
      <section className="card" aria-labelledby="vs-history">
        <SectionHeader id="vs-history" title={title} tip="each line ranks the season’s best (or worst) game among every regular-season game in the league’s history, this season included. a tie shares its place." />
        {a.empty ? (
          <p className="note">no games have been played yet. the record book grows every week.</p>
        ) : lines.length ? (
          <ul className="plain">{lines.map((l) => <li key={l.k}>{l.text}</li>)}</ul>
        ) : (
          <p className="note">nothing from this season cracks the top ten yet.</p>
        )}
        {!a.hasHistory && !a.empty && (
          <p className="note">this league has no earlier seasons on sleeper, so the record book starts with this one and grows every week.</p>
        )}
      </section>
    </>
  );
}
