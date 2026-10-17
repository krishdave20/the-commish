import { formatOdds } from '../app/format';
import { oddsTone } from '../app/metrics';
import { useGrown } from './motion';

interface Props {
  /** probability from 0 to 1 */
  value: number;
  /** the odds are still being simulated: show a quiet "simming…" instead of a number */
  pending?: boolean;
  /** a high number is bad news (the odds of being flushed): colour the bar the other way round */
  invert?: boolean;
}

/** A percentage with a thin bar that grows: green from 65%, gold from 35%, red below. */
export function OddsCell({ value, pending = false, invert = false }: Props) {
  const p = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const tone = oddsTone(invert ? 1 - p : p);
  const grown = useGrown();
  if (pending) {
    return (
      <div className="oddcell" data-tone="pending">
        <span className="dim">simming…</span>
        <div className="bar" aria-hidden="true"><i style={{ width: '0%' }} /></div>
      </div>
    );
  }
  const barClass = tone === 'warn' ? 'bar gold' : tone === 'bad' ? 'bar red' : 'bar';
  return (
    <div className="oddcell" data-tone={tone}>
      <span>{formatOdds(p)}</span>
      <div className={barClass} aria-hidden="true">
        <i style={{ width: `${grown ? p * 100 : 0}%` }} />
      </div>
    </div>
  );
}
