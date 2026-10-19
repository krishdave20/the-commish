import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatKickoff } from '../../app/live/format';
import { formatCountdown } from '../../app/useNow';
import { AvatarName, AvatarStack } from '../../components/Avatar';
import { Segmented } from '../../components/Segmented';
import { cityOf } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';
import type { NflGame, StarterLive } from '../../engine/live';
import type { ModelPlayer } from '../../engine/types';
import { LiveCard } from './LiveCard';
import { RedZoneTitle } from './RedZoneBadge';
import { attackOf, fantasyByGame, redZoneLine, redZoneTeam, sortLive } from './liveLogic';
import type { LiveSort } from './liveLogic';
import type { LiveChanges } from './useLiveChanges';

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

/** The red-zone section: one line per drive that is inside the 20, with the fantasy angle (who in your league is on the attacking team). */
function RedZone({ games, fantasy, starters, players, onOpen }: {
  games: readonly NfGame[]; fantasy: boolean; starters: readonly StarterLive[]; players: readonly ModelPlayer[]; onOpen: (id: string) => void;
}) {
  return (
    <section className="nf-rz" aria-labelledby="nf-rz-h">
      <RedZoneTitle id="nf-rz-h" />
      <ul className="nf-rz-strip">
        {games.map((g) => {
          const team = redZoneTeam(g)!;
          const atk = fantasy ? attackOf(team, starters, players) : null;
          return (
            <li key={g.id} className="nf-rz-item">
              <button type="button" className="nf-rz-btn" onClick={() => onOpen(g.id)} title="open game details">
                <span className="nf-rz-line">{redZoneLine(g)}</span>
                {atk && (atk.mine.length > 0 || atk.others.length > 0) && (
                  <span className="nf-rz-fx">
                    {atk.mine.length > 0 && (
                      <span className="nf-rz-mine">
                        {atk.mine.slice(0, 2).map((s) => (
                          <AvatarName key={s.pid} pid={s.pid} name={s.name} pos={s.pos} team={s.nfl ?? undefined} size={28}>
                            <span className="pname">your {s.name}</span>
                          </AvatarName>
                        ))}
                        <span className="nf-rz-tail">
                          {atk.mine.length > 2 ? `and ${atk.mine.length - 2} more of yours ` : ''}
                          {atk.mine.length === 1 ? 'is' : 'are'} on the attacking team
                        </span>
                      </span>
                    )}
                    {atk.others.length > 0 && (
                      <span className="nf-rz-others">
                        <AvatarStack
                          size={20} max={4}
                          players={atk.others.map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }))}
                          label={`also on the attacking team and rostered in your league: ${atk.others.slice(0, 6).map((p) => p.name).join(', ')}`}
                        />
                        <span className="nf-rz-tail">{atk.others.length === 1 ? '1 other' : `${atk.others.length} others`} rostered in your league</span>
                      </span>
                    )}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The live tab: the red-zone section (only when a drive is inside the 20), then one big card per game in progress. */
export function LiveTab({ games, now, next, fantasy, starters, players, changes, loaded, motion, asOf, onOpen }: Props) {
  const [sort, setSort] = useState<LiveSort>('closest');
  const mode: LiveSort = fantasy ? sort : 'closest';
  const fx = useMemo(() => (fantasy ? fantasyByGame(games, starters, players) : new Map()), [fantasy, games, starters, players]);
  const sorted = useMemo(() => sortLive(games, mode, fx), [games, mode, fx]);
  const red = useMemo(() => sorted.filter((g) => redZoneTeam(g) !== null), [sorted]);

  if (games.length === 0) return <Quiet next={next} now={now} loaded={loaded} />;
  return (
    <div className="nf-live">
      {red.length > 0 && <RedZone games={red} fantasy={fantasy} starters={starters} players={players} onOpen={onOpen} />}
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
