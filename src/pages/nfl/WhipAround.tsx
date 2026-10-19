import { AvatarName, AvatarStack } from '../../components/Avatar';
import { cityOf } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';
import type { StarterLive } from '../../engine/live';
import type { ModelPlayer } from '../../engine/types';
import { attackOf, clockParts, downAndSpot, redZoneLine, redZoneTeam, yardsOut } from './liveLogic';
import type { Call } from './useLiveChanges';

/* The red zone section of the live tab, drawn like a Sunday whip-around broadcast: a dark red-to-black panel, slanted condensed lettering, the
   20-yard-line numeral, and one split-screen tile for every drive inside the 20, with a red scoreboard clock. A drive that has just ended in points
   keeps its tile for a moment with the call over it ("touchdown"). Style only: no league or network marks, and the words in the DOM stay lowercase
   (src/styles/whiparound.css sets them in capitals inside .rzw, the one place the app does that besides the badge). */

/** The red scoreboard clock: the period, then the clock in a bright box. Hidden from assistive tech (the drive's sentence says the same). */
export function RzClock({ g }: { g: NfGame }) {
  const { period, clock } = clockParts(g);
  if (!period && !clock) return null;
  return (
    <span className="rzw-clock" aria-hidden="true">
      {period && <span className="rzw-clock-q">{period}</span>}
      {clock && <span className="rzw-clock-t">{clock}</span>}
    </span>
  );
}

/** The red zone, goal line on the right: 5-yard lines, the 20 at the left end, the ball at its spot. */
function Zone({ out }: { out: number | null }) {
  const at = out !== null && out <= 20 ? out : null;
  return (
    <span className="rzw-zone" aria-hidden="true">
      <span className="rzw-zone-20">20</span>
      <span className="rzw-zone-turf">
        {at !== null && <i className="rzw-zone-ball" style={{ left: `${100 - (at / 20) * 100}%` }} />}
      </span>
      <span className="rzw-zone-ez" />
    </span>
  );
}

interface TileProps {
  g: NfGame;
  call: Call | undefined;
  fantasy: boolean;
  starters: readonly StarterLive[];
  players: readonly ModelPlayer[];
  onOpen: (id: string) => void;
}

function Tile({ g, call, fantasy, starters, players, onOpen }: TileProps) {
  const team = redZoneTeam(g) ?? call?.team ?? null;
  if (team === null) return null;
  const atk = fantasy && !call ? attackOf(team, starters, players) : null;
  const out = call ? null : yardsOut(g);
  const sides = [
    { abbr: g.away, score: g.awayScore },
    { abbr: g.home, score: g.homeScore },
  ];
  const spoken = call
    ? `${call.kind}, ${team.toLowerCase()}: ${g.away.toLowerCase()} ${g.awayScore ?? 0}, ${g.home.toLowerCase()} ${g.homeScore ?? 0}`
    : redZoneLine(g);
  return (
    <li className="rzw-tile" data-call={call?.kind} data-goal={out !== null && out <= 5 ? 'true' : undefined}>
      <button type="button" className="rzw-btn" onClick={() => onOpen(g.id)} title="open game details">
        <span className="sr-only">{spoken}</span>
        <span className="rzw-tile-top" aria-hidden="true">
          <span className="rzw-live">live</span>
          <RzClock g={g} />
        </span>
        <span className="rzw-tile-main" aria-hidden="true">
          <span className="rzw-team">
            <span className="rzw-abbr">{team}</span>
            <span className="rzw-city">{cityOf(team)}</span>
          </span>
          <span className="rzw-score">
            {sides.map((s) => (
              <span key={s.abbr} className="rzw-score-row" data-atk={s.abbr === team ? 'true' : undefined}>
                <b>{s.abbr}</b><i key={s.abbr === team && call ? call.key : 'pts'}>{s.score ?? '–'}</i>
              </span>
            ))}
          </span>
        </span>
        {!call && (
          <span className="rzw-down" aria-hidden="true">
            <span className="rzw-down-bar">{downAndSpot(g) || 'inside the 20'}</span>
            {out !== null && <span className="rzw-out"><b>{out}</b> to go</span>}
          </span>
        )}
        {!call && <Zone out={out} />}
        {call && (
          <span className="rzw-call" key={call.key} aria-hidden="true">
            <span className="rzw-call-word">{call.kind}</span>
            <span className="rzw-call-pts">+{call.delta} {team}</span>
          </span>
        )}
        {atk && (atk.mine.length > 0 || atk.others.length > 0) && (
          <span className="nf-rz-fx rzw-fx">
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
}

interface Props {
  /** the drives to show: inside the 20 now, or just scored from there (a call), in the order to show them */
  games: readonly NfGame[];
  calls: Readonly<Record<string, Call>>;
  fantasy: boolean;
  starters: readonly StarterLive[];
  players: readonly ModelPlayer[];
  onOpen: (id: string) => void;
}

/** The section: a broadcast header (the lockup, the tagline, the 20) and the split-screen tiles. */
export function WhipAround({ games, calls, fantasy, starters, players, onOpen }: Props) {
  const drives = games.filter((g) => redZoneTeam(g) !== null).length;
  return (
    <section className="rzw" aria-labelledby="nf-rz-h">
      <div className="rzw-head">
        <h3 id="nf-rz-h" className="rzw-title">red zone</h3>
        <p className="rzw-tagline">every drive inside the 20 · every game · live</p>
        <p className="rzw-count">{drives === 1 ? '1 drive in' : `${drives} drives in`}</p>
        <span className="rzw-twenty" aria-hidden="true">20</span>
      </div>
      <ul className="rzw-grid" data-count={Math.min(games.length, 4)}>
        {games.map((g) => (
          <Tile key={g.id} g={g} call={calls[g.id]} fantasy={fantasy} starters={starters} players={players} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}

/** While games are on but no drive is inside the 20: one slim line in the same dress, so the tab keeps its broadcast look. */
export function WhipStandby() {
  return (
    <p className="rzw-standby">
      <span className="rzw-standby-tag" aria-hidden="true">red zone</span>
      <span>standing by · no drive inside the 20 right now</span>
    </p>
  );
}
