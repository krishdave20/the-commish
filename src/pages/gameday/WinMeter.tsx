import { formatOdds } from '../../app/format';
import { useGrown } from '../../components/motion';

interface Props {
  leftName: string;
  rightName: string;
  /** the left team's chance to win, live */
  p: number;
  /** its chance before kickoff */
  pre: number;
  /** nothing is left to play: the bar shows the result */
  final?: boolean;
}

const clamp = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0.5));

/** The live win chance as one thin bar: the left team's share fills from the left, a tick marks where it stood before kickoff. */
export function WinMeter({ leftName, rightName, p, pre, final = false }: Props) {
  const grown = useGrown();
  const v = clamp(p), q = clamp(pre);
  const label = final
    ? `final: ${v > 0.5 ? leftName : v < 0.5 ? rightName : 'nobody'} won`
    : `${leftName} ${formatOdds(v)} to win, ${rightName} ${formatOdds(1 - v)}; before kickoff ${leftName} was ${formatOdds(q)}`;
  return (
    <div className="gd-meter">
      <div className="gd-meter-top">
        <span className="gd-meter-pct" data-side="left">{formatOdds(v)}</span>
        <span className="gd-meter-cap">{final ? 'result' : 'win chance'}</span>
        <span className="gd-meter-pct" data-side="right">{formatOdds(1 - v)}</span>
      </div>
      <div className="gd-meter-track" role="img" aria-label={label}>
        <i className="gd-meter-fill" style={{ width: `${grown ? v * 100 : 50}%` }} />
        {!final && <b className="gd-meter-tick" style={{ left: `${q * 100}%` }} title={`before kickoff: ${formatOdds(q)}`} />}
      </div>
      <div className="gd-meter-foot">
        <span>{leftName}</span>
        {!final && <span className="gd-meter-pre" style={{ left: `${Math.max(14, Math.min(86, q * 100))}%` }}>before kickoff {formatOdds(q)}</span>}
        <span>{rightName}</span>
      </div>
    </div>
  );
}
