import type { NfGame } from '../../engine/nfl';
import { downAndSpot, redZoneSpoken, redZoneTeam } from './liveLogic';

interface Props {
  game: NfGame;
  /** compact: the lockup and the team's letters only (the live strip, the drawer). Full: also the down and the spot. */
  compact?: boolean;
  /** the badge has just appeared: it slides in (only where motion is welcome, the stylesheet decides) */
  entering?: boolean;
}

/** A broadcast-style "red zone" lockup for a team that has the ball inside the opponent's 20: a slanted bar of heavy italic lettering, the team, and
    where the ball is. Renders nothing for a game that is not in the red zone. The words on the bar are "red zone" in the DOM; the stylesheet draws them
    in capitals (the one deliberate exception to the app's lowercase rule: it imitates the TV graphic). The sentence a screen reader gets is
    "red zone: lar first and goal at the ari 3", and the drawn pieces are hidden from it. */
export function RedZoneBadge({ game, compact = false, entering = false }: Props) {
  const team = redZoneTeam(game);
  if (team === null) return null;
  const where = downAndSpot(game);
  return (
    <span className="rzb" data-size={compact ? 'compact' : 'full'} data-enter={entering ? 'true' : undefined}>
      <span className="sr-only">{redZoneSpoken(game)}</span>
      <span className="rzb-tag" aria-hidden="true">red zone</span>
      <span className="rzb-team" aria-hidden="true">{team}</span>
      {!compact && where && <span className="rzb-where" aria-hidden="true">{where}</span>}
    </span>
  );
}

/** The same lockup as a section title: the tag alone. */
export function RedZoneTitle({ id }: { id: string }) {
  return (
    <h3 id={id} className="rzb rzb-title">
      <span className="rzb-tag">red zone</span>
    </h3>
  );
}
