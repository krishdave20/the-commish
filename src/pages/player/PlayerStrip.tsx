import { formatCount, formatPoints1, ordinal, signed } from '../../app/format';
import { useFantasyCalc } from '../../app/playersData';
import { HeadlineStrip } from '../../components/HeadlineStrip';
import type { HeadlineItem } from '../../components/HeadlineStrip';
import type { SleeperLeague } from '../../data';
import type { Model, ModelPlayer } from '../../engine';
import { restOfSeason } from './restOfSeason';

interface Props {
  model: Model;
  mp: ModelPlayer;
  league: SleeperLeague | null;
}

/** A player's three figures: this week's projection, rest-of-season rank and trade value. */
export function PlayerStrip({ model, mp, league }: Props) {
  const fc = useFantasyCalc(league);
  const row = fc?.ok ? fc.byId[mp.pid] : undefined;
  const cur = model.meta.currentWeek;
  const ros = restOfSeason(model, mp);
  const items: HeadlineItem[] = [
    {
      label: mp.playedThisWeek ? `week ${cur} score` : `week ${cur} projection`,
      value: <span>{formatPoints1(mp.mu[cur] ?? 0)}</span>,
      sub: mp.playedThisWeek ? 'his game has kicked off' : `floor ${formatPoints1(mp.lo[cur] ?? 0)} · ceiling ${formatPoints1(mp.hi[cur] ?? 0)}`,
    },
    { label: 'rest of season', value: <span>{mp.pos}{ros.rank}</span>, sub: `${formatPoints1(ros.points)} points · of ${ros.of} in the pool` },
    {
      label: fc?.params.isDynasty ? 'dynasty value' : 'trade value',
      value: <span>{row ? formatCount(row.value) : '—'}</span>,
      sub: !league ? 'follow a league for values'
        : !fc ? 'loading values…'
        : !fc.ok ? 'unavailable right now'
        : !row ? 'no value on file'
        : <>{row.overallRank !== null ? `${ordinal(row.overallRank)} overall` : ''}{row.trend30Day !== null && row.trend30Day !== 0 && <span className={row.trend30Day > 0 ? 'pos-c' : 'neg-c'}> {signed(row.trend30Day, 0)} in 30 days</span>}</>,
    },
  ];
  return <HeadlineStrip label={`${mp.name} at a glance`} items={items} />;
}
