import { formatOdds } from '../../app/format';
import { Football } from '../../components/art/Football';
import { Turf } from '../../components/art/Turf';
import { fieldPct, yardLabel, yardOf } from '../../components/art/field';
import { useGrown } from '../../components/motion';

interface Props {
  leftName: string;
  rightName: string;
  /** the left team is the signed-in team: the line under the field says "you" */
  leftIsMe?: boolean;
  /** the left team's chance to win, live */
  p: number;
  /** its chance before kickoff */
  pre: number;
  /** nothing is left to play: the field shows the result */
  final?: boolean;
  /** nothing has been scored: the chance rests on the projections */
  projected?: boolean;
}

const clamp = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0.5));

/** "82 of every 100": the win chance as a count out of 100 simulations (never 0 or 100 unless it is certain) */
function outOf100(v: number): string {
  const n = Math.round(v * 100);
  if (v > 0 && n < 1) return 'fewer than 1';
  if (v < 1 && n > 99) return 'more than 99';
  return String(n);
}

/** The live win chance as a small turf field: the ball sits on the yard that matches the left team's chance (50% is midfield, 80% is the other team's
    20), a gold tick marks where it stood before kickoff and the ball eases to each new spot. The percentage rides above the ball and a plain
    line says it in words, so the art is never the only carrier of the number. */
export function WinMeter({ leftName, rightName, leftIsMe = false, p, pre, final = false, projected = false }: Props) {
  const grown = useGrown();
  const v = clamp(p), q = clamp(pre);
  // a decided game puts the ball in the winner's end zone
  const yard = final ? (v > 0.5 ? 105 : v < 0.5 ? -5 : 50) : yardOf(v);
  const shownYard = grown ? yard : 50;
  const ballAt = fieldPct(shownYard);
  const tickAt = fieldPct(yardOf(q));
  const where = yardLabel(yard, leftName, rightName);
  const label = final
    ? `final: ${v > 0.5 ? leftName : v < 0.5 ? rightName : 'nobody'} won`
    : `${leftName} ${formatOdds(v)} to win, ${rightName} ${formatOdds(1 - v)}; before kickoff ${leftName} was ${formatOdds(q)}. the ball is on ${where}.`;
  const who = leftIsMe ? 'you' : leftName;
  const line = final
    ? v > 0.5 ? `${who} won` : v < 0.5 ? `${rightName} won` : 'a tie'
    : `${who} win${leftIsMe ? '' : 's'} ${outOf100(v)} of every 100 simulations ${projected ? 'on the projections' : 'from here'}`;
  return (
    <div className="gd-meter">
      <div className="gd-meter-field">
        <span className="gd-meter-bubble" data-side="left" aria-hidden="true" style={{ left: `${ballAt}%` }}>{final ? 'final' : formatOdds(v)}</span>
        <div role="img" aria-label={label}>
          <Turf leftName={leftName} rightName={rightName}>
            {!final && <b className="art-tick" style={{ left: `${tickAt}%` }} title={`before kickoff: ${formatOdds(q)}`} />}
            {!final && <i className="art-trail" style={{ left: `${Math.min(ballAt, tickAt)}%`, width: `${Math.abs(ballAt - tickAt)}%` }} />}
            <span className="art-ball" data-yard={yard} style={{ left: `${ballAt}%` }}><Football size={22} /></span>
          </Turf>
        </div>
      </div>
      <p className="gd-meter-line">{line}</p>
      {!final && <p className="gd-meter-pre">before kickoff {leftName} {formatOdds(q)}</p>}
    </div>
  );
}
