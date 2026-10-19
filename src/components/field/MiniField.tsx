import { Football } from '../art/Football';
import { Turf } from '../art/Turf';
import { fieldPct } from '../art/field';
import { driveDirection, fieldLabel, fieldX } from '../../engine/live';
import type { GameSituation, NflGame } from '../../engine/live';
import './field.css';

interface Props {
  game: Pick<NflGame, 'home' | 'away'>;
  situation: GameSituation | null | undefined;
  /** the text beside it says the same: hide the field from assistive tech */
  decorative?: boolean;
  className?: string;
}

/** A small turf field (about 120 by 28 px) for one game: the ball at the line of scrimmage, a gold tick at the line to gain, an arrow for the way the
    offense is going, a warm tint over the red zone, and the two team codes in the end zones (away on the left, home on the right, like a broadcast).
    The mapping from Sleeper's yard line to the field is documented in `engine/live/situation.ts`. With no ball position it draws the empty field. */
export function MiniField({ game, situation, decorative = false, className }: Props) {
  const s = situation ?? null;
  const x = s ? fieldX(s, game) : null;
  const dir = s ? driveDirection(s.possession, game) : null;
  const ball = x !== null ? fieldPct(x) : null;
  const toGain = s?.distance && /^\d+$/.test(s.distance) && x !== null && dir ? Math.max(0, Math.min(100, x + (dir === 'right' ? 1 : -1) * Number(s.distance))) : null;
  const zone = s?.redZone && dir ? (dir === 'right' ? { left: fieldPct(80), width: (20 / 120) * 100 } : { left: fieldPct(0), width: (20 / 120) * 100 }) : null;
  const label = fieldLabel(game, s);
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': label };
  return (
    <div className={className ? `mf ${className}` : 'mf'} data-dir={dir ?? undefined} data-red={zone ? 'true' : undefined} data-x={x ?? undefined} {...a11y}>
      <Turf leftName={game.away} rightName={game.home} className="mf-turf">
        {zone && <i className="mf-rz" style={{ left: `${zone.left}%`, width: `${zone.width}%` }} />}
        {toGain !== null && toGain !== x && <b className="art-tick mf-line" style={{ left: `${fieldPct(toGain)}%` }} />}
        {ball !== null && (
          <>
            {dir && (
              <svg className="mf-arrow" data-dir={dir} style={{ left: `${ball}%` }} viewBox="0 0 16 8" aria-hidden="true" focusable="false">
                <path d="M1 4H14M10.5 1L14 4L10.5 7" fill="none" />
              </svg>
            )}
            <span className="art-ball mf-ball" data-yard={x ?? undefined} style={{ left: `${ball}%` }}><Football size={14} /></span>
          </>
        )}
      </Turf>
    </div>
  );
}
