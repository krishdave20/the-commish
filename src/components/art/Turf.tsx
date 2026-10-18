import type { ReactNode } from 'react';
import '../../styles/art.css';
import { END_ZONE, FIELD_YARDS, fieldPct, hashPath } from './field';

interface Props {
  /** the left team's end zone carries this name, set vertically; the right end zone the other */
  leftName: string;
  rightName: string;
  className?: string;
  /** laid over the turf: a ball, a tick. Positioned against the whole field. */
  children?: ReactNode;
}

const NUMBERS = [10, 20, 30, 40, 50, 40, 30, 20, 10];
const H = 12;

/** A small turf field, decorative: ten alternating stripes, a line every 10 yards, hash marks, yard numbers along the bottom and a team-named end
    zone on each side. It draws nothing about the game itself; whoever uses it says what it shows (an `img` label on the wrapper). Meant to sit
    about 220 px wide and 60 px tall. */
export function Turf({ leftName, rightName, className, children }: Props) {
  return (
    <div className={className ? `art-field art-turf ${className}` : 'art-field art-turf'}>
      <svg viewBox={`0 0 ${FIELD_YARDS} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} className="art-stripe" data-alt={i % 2 === 1 ? 'true' : undefined} x={END_ZONE + i * 10} y="0" width="10" height={H} />
        ))}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((yd) => (
          <path key={yd} className="art-turf-line" d={`M${END_ZONE + yd} 0V${H}`} />
        ))}
        <path className="art-turf-line" d={`M${END_ZONE} 0V${H}M${END_ZONE + 100} 0V${H}`} />
        <path className="art-turf-hash" d={hashPath(H)} />
      </svg>
      <span className="art-turf-ez" data-side="left"><span>{leftName}</span></span>
      <span className="art-turf-ez" data-side="right"><span>{rightName}</span></span>
      <span className="art-turf-nums" aria-hidden="true">
        {NUMBERS.map((n, i) => <span key={i} style={{ left: `${fieldPct((i + 1) * 10)}%` }}>{n}</span>)}
      </span>
      {children}
    </div>
  );
}
