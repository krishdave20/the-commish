import { Link, useNavigate } from 'react-router-dom';
import { useAccountStore } from '../app/hooks';
import { useLiveMaybe } from '../app/live/liveContext';
import { PAGES } from '../app/names';
import { SIGN_IN_PATH } from '../app/routes';
import { usePageTitle } from '../app/usePageTitle';
import { HeadlineStrip } from '../components/HeadlineStrip';
import type { HeadlineItem } from '../components/HeadlineStrip';
import { PageHeader } from '../components/PageHeader';
import { LeagueCard } from './leagues/LeagueCard';
import { useLeagueSummaries } from './leagues/useLeagueSummaries';
import type { FollowedLeague } from './leagues/useLeagueSummaries';
import '../styles/almanac.css';

/** All leagues: one compact card for each league followed by any linked account, loaded one at a time. A tap makes it the league the app follows. */
export default function Leagues() {
  usePageTitle(PAGES.leagues.path);
  const p = PAGES.leagues;
  const accounts = useAccountStore();
  const navigate = useNavigate();
  const live = useLiveMaybe()?.live ?? false;
  const { entries, cards, fresh } = useLeagueSummaries();
  const activeUser = accounts.active();

  const open = (e: FollowedLeague) => {
    accounts.setActiveLeague(e.account.userId, e.leagueId);
    if (activeUser?.userId !== e.account.userId) accounts.setActive(e.account.userId);
    navigate(PAGES.home.path);
  };

  const done = entries.filter((e) => cards[e.key]?.status === 'done' && cards[e.key]!.summary?.me);
  const inPicture = done.filter((e) => cards[e.key]!.summary!.standing?.inPlayoffs);
  const started = done.filter((e) => cards[e.key]!.summary!.matchup?.started);
  const winning = started.filter((e) => cards[e.key]!.summary!.matchup!.leading);
  const accountCount = new Set(entries.map((e) => e.account.userId)).size;
  const items: HeadlineItem[] = [
    { label: 'leagues', value: <span>{entries.length}</span>, sub: `${accountCount} ${accountCount === 1 ? 'account' : 'accounts'}` },
    { label: 'in a playoff spot', value: <span>{done.length ? inPicture.length : '…'}</span>, sub: done.length ? `of ${done.length}, by the standings` : 'loading the leagues' },
    started.length
      ? { label: 'winning right now', value: <span>{winning.length}</span>, sub: `of ${started.length} matchups under way` }
      : { label: 'this week', value: <span>{done.filter((e) => cards[e.key]!.summary!.matchup).length || '—'}</span>, sub: 'matchups, none under way' },
  ];

  return (
    <div className="page page-fade">
      <PageHeader kicker={p.kicker} title={p.name} data={fresh} />
      {entries.length === 0 ? (
        <p className="note">you are not following any leagues yet. <Link to={SIGN_IN_PATH}>check in to follow your leagues</Link>.</p>
      ) : (
        <>
          <HeadlineStrip label="your leagues" items={items} />
          <ul className="lg-grid plain" aria-label="Followed leagues">
            {entries.map((e) => (
              <LeagueCard
                key={e.key} entry={e} state={cards[e.key]} live={live} onOpen={open}
                active={activeUser?.userId === e.account.userId && (e.account.activeLeagueId ?? e.account.leagueIds[0]) === e.leagueId}
                showAccount={accountCount > 1}
              />
            ))}
          </ul>
          {entries.length === 1 && (
            <p className="note">
              you follow one league, so there is only one card. follow another and they sit side by side here, each loaded on its own so a phone is never overloaded.
            </p>
          )}
          <p className="note"><Link to={SIGN_IN_PATH}>follow another league</Link> · tap a card to make it the league you are following, and go to its huddle.</p>
        </>
      )}
    </div>
  );
}
