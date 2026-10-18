import { gradeOf } from '../app/metrics';
import { formatNum } from '../app/format';

interface Props {
  /** opponent abbreviation; empty, null or "BYE" means a bye week */
  opponent: string | null | undefined;
  /** points the defense allows to the position, over league average (1.0 is average) */
  dvp?: number | null;
  /** show the soft / avg / tough word next to the opponent (default true) */
  showLabel?: boolean;
}

/** A coloured dot, the opponent, and the grade: soft from 1.15, tough up to 0.87. */
export function MatchupGrade({ opponent, dvp, showLabel = true }: Props) {
  if (!opponent || opponent.toUpperCase() === 'BYE') return <span className="pill mute">bye</span>;
  const g = gradeOf(dvp);
  const title = g.text + (dvp !== null && dvp !== undefined ? ` (${formatNum(dvp, 2)}×)` : '');
  return (
    <span className="matchup" title={title}>
      <span className={`grade ${g.kind}`} data-grade={g.kind} role="img" aria-label={title} />
      <span>{opponent}</span>
      {showLabel && g.label && <span className="dim">{g.label}</span>}
    </span>
  );
}
