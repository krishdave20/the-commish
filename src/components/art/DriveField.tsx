import { useMemo } from 'react';
import type { DriveMark, DriveSide } from './drive';
import { placeMarks } from './drive';
import '../../styles/art.css';
import { FieldMarks } from './FieldMarks';
import { FIELD_YARDS } from './field';

interface Props {
  marks: readonly DriveMark[];
  meName: string;
  oppName: string;
  className?: string;
}

/** A strip of field where each scoring play is a mark in time order from the left end zone to the right. Size is the points moved, colour is whose
    play it was: your team green, your opponent warm red, the rest of the league small and grey. A label says the same in words. */
export function DriveField({ marks, meName, oppName, className }: Props) {
  const placed = useMemo(() => placeMarks(marks), [marks]);
  const count = (s: DriveSide) => marks.filter((m) => m.side === s).length;
  const pts = (s: DriveSide) => marks.filter((m) => m.side === s).reduce((a, m) => a + m.points, 0);
  const label = `${marks.length} scoring ${marks.length === 1 ? 'update' : 'updates'}, oldest at the left: ${meName} ${count('me')} (${pts('me').toFixed(1)} points), ${oppName} ${count('opp')} (${pts('opp').toFixed(1)}), the rest of the league ${count('other')}`;
  return (
    <figure className={className ? `art-drive ${className}` : 'art-drive'}>
      <div className="art-field art-strip" role="img" aria-label={label}>
        <svg viewBox={`0 0 ${FIELD_YARDS} 12`} preserveAspectRatio="none" aria-hidden="true" focusable="false"><FieldMarks h={12} /></svg>
        <div className="art-marks">
          {placed.map(({ mark, x, y, d }) => (
            <i
              key={mark.id} className="art-mark" data-mark={mark.side} data-neg={mark.points < 0 ? 'true' : undefined} title={mark.text}
              style={{ left: `${x}%`, top: `${y}%`, width: d, height: d }}
            />
          ))}
        </div>
      </div>
      <figcaption className="art-drive-key" aria-hidden="true">
        <span data-key="me">{meName}</span><span data-key="opp">{oppName}</span><span data-key="other">rest of the league</span><span className="art-drive-dir">oldest to newest, left to right</span>
      </figcaption>
    </figure>
  );
}
