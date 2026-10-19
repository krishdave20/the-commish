import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatKickoff } from '../../app/live/format';
import { formatCountdown } from '../../app/useNow';
import { Segmented } from '../../components/Segmented';
import { cityOf } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';
import type { NflGame, StarterLive } from '../../engine/live';
import type { ModelPlayer } from '../../engine/types';
import { LiveCard } from './LiveCard';
import { fantasyByGame, redZoneTeam, sortLive, yardsOut } from './liveLogic';
import type { LiveSort } from './liveLogic';
import type { LiveChanges } from './useLiveChanges';
import { WhipAround, WhipStandby } from './WhipAround';

interface Props {
  /** this week's games in progress (halftime included) */
  games: readonly NfGame[];
  /** the viewer's clock (the poller's) */
  now: number;
  /** the next game that has not kicked off, this week's or next week's */
  next: NflGame | null;
  /** false for "nfl only": no starters, no rostered counts, no sort by relevance */
  fantasy: boolean;
  starters: readonly StarterLive[];
  players: readonly ModelPlayer[];
  changes: LiveChanges;
  /** false until the first poll has answered */
  loaded: boolean;
  /** motion is welcome (the entrance wipe and pulse) */
  motion: boolean;
  asOf: number | null;
  onOpen: (id: string) => void;
}

const SORTS: Array<{ value: LiveSort; label: string }> = [
  { value: 'closest', label: 'closest' },
  { value: 'relevant', label: 'most fantasy relevant' },
];

/** When nothing is on: the next kickoff with a countdown and a way to the scoreboard. */
function Quiet({ next, now, loaded }: { next: NflGame | null; now: number; loaded: boolean }) {
  return (
    <section className="nf-quiet" aria-labelledby="nf-quiet-h">
      <h3 id="nf-quiet-h">{loaded ? 'no games live right now' : 'looking for live games…'}</h3>
      {loaded && (
        next && next.kickoff !== null ? (
          <p className="nf-quiet-next">
            next kickoff: <strong>{cityOf(next.away)} at {cityOf(next.home)}</strong> · {formatKickoff(next.kickoff)}
            {' · '}<span className="nf-quiet-count">{next.kickoff > now ? `in ${formatCountdown(next.kickoff - now)}` : 'about to start'}</span>
          </p>
        ) : <p className="nf-quiet-next">nothing is left to kick off right now.</p>
      )}
      <p><Link className="nf-quiet-link" to={{ search: '?tab=scoreboard' }}>see the scoreboard</Link></p>
    </section>
  );
}

/** The live tab: the red zone whip-around (or its one-line standby while no drive is inside the 20), then one big card per game in progress. */
export function LiveTab({ games, now, next, fantasy, starters, players, changes, loaded, motion, asOf, onOpen }: Props) {
  const [sort, setSort] = useState<LiveSort>('closest');
  const mode: LiveSort = fantasy ? sort : 'closest';
  const fx = useMemo(() => (fantasy ? fantasyByGame(games, starters, players) : new Map()), [fantasy, games, starters, players]);
  const sorted = useMemo(() => sortLive(games, mode, fx), [games, mode, fx]);
  // the whip-around: a drive that just scored from inside the 20 first (its call), then the drive nearest the goal line, then the page's order
  const red = useMemo(() => {
    const near = (g: NfGame) => (changes.calls[g.id] ? -1 : yardsOut(g) ?? 99);
    return sorted.filter((g) => redZoneTeam(g) !== null || changes.calls[g.id]).sort((a, b) => near(a) - near(b));
  }, [sorted, changes.calls]);

  if (games.length === 0) return <Quiet next={next} now={now} loaded={loaded} />;
  return (
    <div className="nf-live">
      {red.length > 0
        ? <WhipAround games={red} calls={changes.calls} fantasy={fantasy} starters={starters} players={players} onOpen={onOpen} />
        : <WhipStandby />}
      <div className="nf-live-bar">
        <p className="nf-live-count" role="status">{games.length === 1 ? '1 game live' : `${games.length} games live`}</p>
        {fantasy && <Segmented label="sort live games" value={mode} onChange={setSort} options={SORTS} />}
        {!fantasy && <span className="micro">sorted by closest score</span>}
      </div>
      <ul className="nf-lv-grid">
        {sorted.map((g) => (
          <li key={g.id}>
            <LiveCard
              g={g} fantasy={fantasy ? fx.get(g.id) ?? null : null} flash={changes.flashes[g.id]}
              entering={motion && changes.entered.has(g.id)} onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">{changes.said}</p>
      {asOf !== null && <p className="note">updated {new Date(asOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).toLowerCase()}</p>}
    </div>
  );
}
