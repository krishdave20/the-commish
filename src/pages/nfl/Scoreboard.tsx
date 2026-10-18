import { useMemo } from 'react';
import { formatKickoff } from '../../app/live/format';
import { HeadlineStrip } from '../../components/HeadlineStrip';
import { groupBySlot, slotDate } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';
import { nextKickoff } from '../../engine/live';
import { GameCard } from './GameCard';
import { matchupName } from './format';

interface Props {
  week: number;
  currentWeek: number;
  games: NfGame[];
  /** my starters by NFL team code, this week only */
  mineByTeam: ReadonlyMap<string, number>;
  /** the viewer's clock (the poller's), for "next kickoff" */
  now: number;
  onOpen: (id: string) => void;
  /** false for "nfl only": no fantasy figures */
  fantasy: boolean;
}

/** The answer first: how many games are on, how many of my starters are playing now, and the next kickoff. Then the games by time slot. */
export function Scoreboard({ week, currentWeek, games, mineByTeam, now, onOpen, fantasy }: Props) {
  const groups = useMemo(() => groupBySlot(games), [games]);
  const live = games.filter((g) => g.state === 'live');
  const mineNow = live.reduce((n, g) => n + (mineByTeam.get(g.home) ?? 0) + (mineByTeam.get(g.away) ?? 0), 0);
  const next = nextKickoff(games, now);
  const final = games.filter((g) => g.state === 'final').length;
  const isNow = week === currentWeek;

  return (
    <div className="nf-board">
      <HeadlineStrip
        label={`week ${week} at a glance`}
        items={[
          { label: 'games live now', value: live.length, sub: fantasy ? `of ${games.length} · ${final} final` : `of ${games.length}` },
          fantasy
            ? { label: 'your players playing now', value: isNow ? mineNow : '—', sub: isNow ? (mineNow === 0 ? 'none of your starters are on the field' : 'starters in live games') : 'shown for this week' }
            : { label: 'games final', value: final, sub: `of ${games.length}` },
          {
            label: 'next kickoff', value: next?.kickoff != null ? formatKickoff(next.kickoff) : '—',
            sub: next ? matchupName(next) : final === games.length && games.length > 0 ? `week ${week} is final` : 'nothing left to kick off',
          },
        ]}
      />
      {groups.map((grp) => {
        const id = `nf-slot-${grp.key.replace(/[^a-z0-9]+/gi, '-')}`;
        return (
          <section key={grp.key} className="nf-slot" aria-labelledby={id}>
            <div className="nf-slot-head">
              <h3 id={id}>{grp.label}</h3>
              <span className="micro">{slotDate(grp.at)}{' · '}{grp.games.length === 1 ? '1 game' : `${grp.games.length} games`}</span>
            </div>
            <ul className="nf-cards">
              {grp.games.map((g) => (
                <li key={g.id}>
                  <GameCard g={g} mine={(mineByTeam.get(g.home) ?? 0) + (mineByTeam.get(g.away) ?? 0)} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {games.length === 0 && <p className="note" role="status">no games found for week {week}.</p>}
    </div>
  );
}
