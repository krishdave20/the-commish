import { Suspense, lazy, useState } from 'react';
import { EnginePage } from '../app/EnginePage';
import { formatOdds, ordinal } from '../app/format';
import { ScenarioBar } from '../app/ScenarioBar';
import { HeadlineStrip } from '../components/HeadlineStrip';
import { PageTabs } from '../components/PageTabs';
import { BlockSkeleton } from '../components/Skeleton';
import type { Engine } from '../engine';
import { TeamDrawer } from './race/TeamDrawer';
import { AfterWeekTable, FormTable, PowerTable, StandingsTable } from './league/tables';
import { useLeagueBoard } from './league/useLeagueBoard';
import type { LeagueBoard } from './league/useLeagueBoard';

// the weekly power rankings (list, movement, lines, bump chart) pull in d3: fetched when their tab opens
const PowerRankings = lazy(() => import('./race/power/PowerRankings'));

/** The page's answer: where you rate, where you will stand after this week, and the game to watch. */
function LeagueStrip({ board }: { board: LeagueBoard }) {
  const me = board.rows.find((r) => r.isMe);
  const top = board.rows.find((r) => r.power?.rank === 1);
  // the closest game this week: the favourite's chance nearest a coin flip
  const close = board.rows.filter((r) => r.week.winP !== null && r.week.winP >= 0.5)
    .sort((a, b) => a.week.winP! - b.week.winP! || a.rid - b.rid)[0];
  if (!me) return null;
  return (
    <HeadlineStrip label="Around the league" items={[
      {
        label: 'your power rank',
        value: <span>{me.power ? ordinal(me.power.rank) : '—'}</span>,
        sub: me.power ? (top && top !== me ? `${top.team} is 1st` : 'top of the league') : 'rankings start after week 1',
      },
      ...(board.week !== null ? [{
        label: `after week ${board.week}`,
        value: <span>{ordinal(me.week.projRank)}</span>,
        sub: me.week.winP === null ? `a bye week · ${ordinal(me.rank)} now` : `${ordinal(me.rank)} now · ${formatOdds(me.week.winP)} to beat ${me.oppName}`,
      }] : []),
      ...(close ? [{
        label: 'closest game',
        value: <span>{formatOdds(close.week.winP!)}</span>,
        sub: `${close.team} over ${close.oppName}`,
      }] : []),
    ]} />
  );
}

function Body({ engine }: { engine: Engine }) {
  const board = useLeagueBoard(engine);
  const [open, setOpen] = useState<number | null>(null);
  const props = { engine, board, onOpen: setOpen };
  return (
    <>
      <ScenarioBar />
      <LeagueStrip board={board} />
      <PageTabs
        label="Around the league sections" defaultTab="standings"
        tabs={[
          { value: 'standings', label: 'standings' }, { value: 'after', label: 'after this week' },
          { value: 'power', label: 'power rankings' }, { value: 'ratings', label: 'team ratings' }, { value: 'form', label: 'form & schedule' },
        ]}
      >
        {(tab) => tab === 'standings' ? <StandingsTable {...props} />
          : tab === 'after' ? <AfterWeekTable {...props} />
          : tab === 'power' ? <Suspense fallback={<BlockSkeleton height="18rem" />}><PowerRankings engine={engine} /></Suspense>
          : tab === 'ratings' ? <PowerTable {...props} />
          : <FormTable {...props} />}
      </PageTabs>
      <TeamDrawer engine={engine} rid={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Around the league: every team's strength in one place. Standings now, the standings once this week resolves, team ratings (power index,
    rest-of-season points, all-play, luck, odds), the weekly power rankings and form, schedule left and bench points. Everything is read from the engine. */
export default function AroundLeague() {
  return (
    <EnginePage page="league" suffix={(e) => (e.model.meta.currentWeek <= e.model.meta.lastRegularWeek ? `week ${e.model.meta.currentWeek}` : undefined)}>
      {(engine) => <Body engine={engine} />}
    </EnginePage>
  );
}
