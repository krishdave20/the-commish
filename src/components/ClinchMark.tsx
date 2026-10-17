import { MARK_MEANING } from '../app/metrics';
import type { ClinchMarkKind } from '../app/metrics';

interface Props {
  /** x clinched a spot, y clinched the division, d out of the division race, e eliminated; empty for none */
  mark?: ClinchMarkKind | '' | null;
}

/** The small square beside a team name. Blank marks keep the column aligned. */
export function ClinchMark({ mark }: Props) {
  if (!mark) return <span className="mark none" aria-hidden="true">·</span>;
  const meaning = MARK_MEANING[mark];
  return <span className={`mark ${mark}`} role="img" aria-label={meaning} title={meaning}>{mark}</span>;
}

export function MarkLegend() {
  return (
    <div className="legend" aria-label="Clinch marks">
      {(['x', 'y', 'd', 'e'] as const).map((m) => (
        <span key={m}><span className={`mark ${m}`} aria-hidden="true">{m}</span>{MARK_MEANING[m]}</span>
      ))}
    </div>
  );
}
