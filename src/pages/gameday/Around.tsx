import { formatOdds, formatPoints1 } from '../../app/format';
import { AvatarStack } from '../../components/Avatar';
import { FieldSituation } from '../../components/field';
import { useGrown } from '../../components/motion';
import { LiveDot } from '../../components/ticker/LiveDot';
import type { MatchupLive, Tag, TeamLive } from '../../engine/live';
import { liveStarter, sortMatchups, topStarters } from './aroundSort';
import type { SortKey } from './aroundSort';

const TAG_CLASS: Record<Tag, string> = { 'upset alert': 'warn', 'nail-biter': 'ok', blowout: 'mute' };

function Tags({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return <span className="gd-tags">{tags.map((t) => <span key={t} className={`pill ${TAG_CLASS[t]}`}>{t}</span>)}</span>;
}

function TeamRow({ t, pts, lead, proj }: { t: TeamLive; pts: number; lead: boolean; proj: number | null }) {
  const top = topStarters(t).map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, team: p.nfl ?? undefined }));
  return (
    <span className="gd-card-row" data-lead={lead ? 'true' : undefined}>
      <AvatarStack players={top} size={28} />
      <span className="gd-card-name">{t.name}</span>{' '}
      <span className="gd-card-pts">{formatPoints1(pts)}</span>
      {proj !== null && <>{' '}<span className="gd-card-proj">proj {formatPoints1(proj)}</span></>}
    </span>
  );
}

function Card({ m, projected, onOpen }: { m: MatchupLive; projected: boolean; onOpen: (id: number) => void }) {
  const grown = useGrown();
  const decided = m.final && !projected;
  const ls = projected ? m.a.projection : m.a.actual, rs = projected ? m.b.projection : m.b.actual;
  const p = Math.max(0, Math.min(1, m.winA));
  const live = m.a.live + m.b.live, yet = m.a.yet + m.b.yet;
  const star = decided ? null : liveStarter(m);
  const game = star?.game && star.game.id !== 'guess' ? star.game : null;
  return (
    <li>
      <button type="button" className="gd-card" onClick={() => onOpen(m.id)} data-mine={m.a.isMe || m.b.isMe ? 'true' : undefined} data-live={live > 0 ? 'true' : undefined}>
        {/* no aria-label: the visible text is the accessible name (WCAG 2.5.3); plain-text spaces keep words apart */}
        <TeamRow t={m.a} pts={ls} lead={ls > rs} proj={projected || decided ? null : m.a.projection} />
        {' '}<TeamRow t={m.b} pts={rs} lead={rs > ls} proj={projected || decided ? null : m.b.projection} />
        <span className="gd-card-meter" aria-hidden="true"><i style={{ width: `${grown ? p * 100 : 50}%` }} /></span>
        {' '}<span className="gd-card-foot">
          <span>{decided ? 'final' : `${formatOdds(Math.max(p, 1 - p))} ${p >= 0.5 ? m.a.name : m.b.name}`}</span>{!decided && <>{' '}<span className="sr-only">to win</span></>}
          {' '}<span>{projected ? 'projected' : decided ? '' : `${live ? `${live} live · ` : ''}${yet} on deck`}</span>
        </span>
        {star && (
          <>
            {' '}<span className="gd-card-live"><LiveDot />live: {star.name.toLowerCase()} on the field</span>
            {game && <>{' '}<FieldSituation game={game} team={star.nfl} pos={star.pos} variant="card" /></>}
          </>
        )}
        {' '}<Tags tags={m.tags} />{' '}<span className="sr-only">open as the main event</span>
      </button>
    </li>
  );
}

interface Props {
  matchups: MatchupLive[];
  focusId: number;
  projected: boolean;
  sort: SortKey;
  onOpen: (id: number) => void;
}

/** Every other matchup of the week as a card: both teams with their two best starters, the score, the win chance and how many starters are left, and,
    when a starter is live, who is on the field and what his game looks like. */
export function AroundLeague({ matchups, focusId, projected, sort, onOpen }: Props) {
  const rest = sortMatchups(matchups.filter((m) => m.id !== focusId), sort, projected);
  if (!rest.length) return <p className="note">no other matchups this week.</p>;
  return <ul className="gd-cards">{rest.map((m) => <Card key={m.id} m={m} projected={projected} onOpen={onOpen} />)}</ul>;
}
