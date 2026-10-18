import '../../styles/art.css';
import { useReducedMotion } from '../motion';
import { Football } from './Football';
import { fieldPct } from './field';

interface Props {
  /** how far along: `done` of `total`. Leave out when it is not known: the ball then moves between the 20s. */
  progress?: { done: number; total: number } | null;
  label: string;
}

/** A slim yard-line track for a load in flight: faint yard ticks, two end zones and a tiny football that moves from the left goal line to the right as the
    work gets done. With no known progress it rolls gently between the 20-yard lines. It sits over the foot of the header, so it never shifts the layout.
    With reduced motion the ball stays where it is (the current yard, or midfield when unknown). */
export function YardTrack({ progress, label }: Props) {
  const reduced = useReducedMotion();
  const known = !!progress && progress.total > 0;
  // the playing field is the middle of the track: 0 done is the left goal line, all done the right one
  const frac = known ? Math.max(0.03, Math.min(1, progress.done / progress.total)) : 0.5;
  const at = fieldPct(frac * 100);
  const aria = known
    ? { 'aria-valuemin': 0, 'aria-valuemax': progress.total, 'aria-valuenow': progress.done }
    : { 'aria-valuetext': 'Refreshing' };
  const rolling = !known && !reduced;
  return (
    <div className="yard" role="progressbar" aria-label={label} data-mode={known ? 'determinate' : 'indeterminate'} data-motion={rolling ? 'moving' : 'still'} {...aria}>
      <span className="yard-ticks" aria-hidden="true" />
      {known && <i className="yard-fill" style={{ width: `${at}%` }} />}
      <span className="yard-ball" aria-hidden="true" style={rolling ? undefined : { left: `${at}%` }}><Football size={16} /></span>
    </div>
  );
}
