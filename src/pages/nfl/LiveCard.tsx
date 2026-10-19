import { AvatarName } from '../../components/Avatar';
import { Football } from '../../components/art/Football';
import { LineScoreTable, MiniField, TimeoutDots } from '../../components/field';
import { LiveDot } from '../../components/ticker/LiveDot';
import { cityOf } from '../../engine/nfl';
import type { NfGame } from '../../engine/nfl';
import { fieldLabel } from '../../engine/live';
import { statusText, gameSentence, matchupName } from './format';
import { isHalftime, redZoneTeam, scoreKind, situationLine } from './liveLogic';
import type { Fantasy } from './liveLogic';
import { RedZoneBadge } from './RedZoneBadge';
import type { Flash } from './useLiveChanges';
import { RzClock } from './WhipAround';

interface Props {
  g: NfGame;
  /** hidden by "nfl only": null leaves out the whole fantasy layer */
  fantasy: Fantasy | null;
  flash: Flash | undefined;
  /** just entered the red zone, and motion is welcome */
  entering: boolean;
  onOpen: (id: string) => void;
}

const MAX_STARTERS = 4;

function Team({ g, side, flash }: { g: NfGame; side: 'home' | 'away'; flash: Flash | undefined }) {
  const abbr = side === 'home' ? g.home : g.away;
  const score = side === 'home' ? g.homeScore : g.awayScore;
  const other = side === 'home' ? g.awayScore : g.homeScore;
  const rec = side === 'home' ? g.homeRecord : g.awayRecord;
  const left = side === 'home' ? g.situation?.homeTimeouts ?? null : g.situation?.awayTimeouts ?? null;
  const ball = g.situation?.possession === abbr;
  const lead = score !== null && other !== null && score > other;
  const mine = flash?.side === side ? flash : undefined;
  return (
    <div className="nf-lv-team" data-side={side} data-lead={lead ? 'true' : undefined} data-ball={ball ? 'true' : undefined}>
      <span className="nf-lv-abbr">
        {abbr}
        {ball && <span className="nf-lv-ball" aria-hidden="true"><Football size={16} /></span>}
        {ball && <span className="sr-only"> has the ball</span>}
      </span>
      <span className="nf-lv-name">
        <span className="nf-lv-city">{cityOf(abbr)}</span>
        {rec && <span className="nf-rec">{rec}</span>}
      </span>
      {left !== null && (
        <span className="nf-lv-to">
          <TimeoutDots left={left} />
          <span className="sr-only">{`${abbr.toLowerCase()} ${left} timeout${left === 1 ? '' : 's'} left`}</span>
        </span>
      )}
      <span className="nf-lv-scorecell">
        {mine && <span className="nf-lv-chip" key={`chip:${mine.key}`} role="img" aria-label={`${mine.delta} points just scored`}>+{mine.delta}</span>}
        <span className="nf-lv-score" key={mine ? `score:${mine.key}` : 'score'} data-flash={mine ? 'true' : undefined}>{score ?? '–'}</span>
      </span>
    </div>
  );
}

/** One game in progress, bigger than a scoreboard card: both teams with big scores, the quarter and clock, the timeouts, the ball and the down, a full-width
    mini field, the line score and (unless "nfl only") your starters in the game. Not one button: a transparent button under the content opens the game's
    drawer, so the content can hold a real table and the content stays readable in order. */
export function LiveCard({ g, fantasy, flash, entering, onOpen }: Props) {
  const red = redZoneTeam(g) !== null;
  const sit = situationLine(g);
  const half = isHalftime(g);
  const showField = !!g.situation && !half;
  const td = flash && scoreKind(flash.delta) === 'touchdown' ? (flash.side === 'home' ? g.home : g.away) : null;
  return (
    <article
      className="nf-lv" aria-label={gameSentence(g)} data-red={red ? 'true' : undefined} data-td={td ? 'true' : undefined} data-entered={entering ? 'true' : undefined}
      data-ball={g.situation?.possession ?? undefined}
    >
      <button type="button" className="nf-lv-open" aria-label={`open game details, ${matchupName(g)}`} onClick={() => onOpen(g.id)} />
      <div className="nf-lv-body">
        {td && flash && (
          <span className="rzw-td" key={`td:${flash.key}`} aria-hidden="true">
            <span className="rzw-td-word">touchdown</span>
            <span className="rzw-td-team">{td}</span>
          </span>
        )}
        <div className="nf-lv-top">
          {red
            ? <span className="nf-status" data-state="live"><LiveDot /><span className="sr-only">{statusText(g)}</span><RzClock g={g} /></span>
            : <span className="nf-status" data-state="live"><LiveDot />{statusText(g)}</span>}
          {g.channel && <span className="nf-chan">{g.channel}</span>}
        </div>
        <div className="nf-lv-teams">
          <Team g={g} side="away" flash={flash} />
          <Team g={g} side="home" flash={flash} />
        </div>
        {(red || sit) && (
          <div className="nf-lv-sit">
            {red ? <RedZoneBadge game={g} entering={entering} /> : <span className="nf-lv-sit-text">{sit}</span>}
          </div>
        )}
        {showField && (
          <div className="nf-lv-field">
            <MiniField game={g} situation={g.situation} className="nf-lv-mf" decorative />
            <span className="sr-only">{fieldLabel(g, g.situation)}</span>
          </div>
        )}
        {g.line && <div className="nf-lv-ql"><LineScoreTable game={g} /></div>}
        {fantasy && (
          <div className="nf-lv-fx">
            {fantasy.starters.length > 0 ? (
              <ul className="nf-lv-starters" aria-label="your starters in this game">
                {fantasy.starters.slice(0, MAX_STARTERS).map((s) => (
                  <li key={s.pid} className="nf-lv-starter">
                    <AvatarName pid={s.pid} name={s.name} pos={s.pos} team={s.nfl ?? undefined} size={28}><span className="pname">{s.name}</span></AvatarName>
                    <span className="nf-lv-pts" aria-label={`${s.actual.toFixed(1)} points`}>{s.actual.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="nf-lv-fxnote">none of your starters are in this game.</p>}
            <p className="nf-lv-fxnote">
              {fantasy.starters.length > MAX_STARTERS ? `+${fantasy.starters.length - MAX_STARTERS} more starters · ` : ''}
              {fantasy.rostered === 1 ? '1 player' : `${fantasy.rostered} players`} rostered in your league
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
