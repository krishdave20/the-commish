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
  /** "scale": a low chance is not bad news (title, final, seed odds), so there is no red or gold. The bar is green, stronger the closer
      the value is to `max` (the biggest in its column; default 1). "verdict" (default) is the playoff scale: green from 65%, gold from 35%. */
  tone?: 'verdict' | 'scale';
  max?: number;
}

/** A percentage with a thin bar that grows: green from 65%, gold from 35%, red below. */
export function OddsCell({ value, pending = false, invert = false, tone: mode = 'verdict', max = 1 }: Props) {
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
  if (mode === 'scale') {
    const rel = max > 0 ? Math.min(1, p / max) : 0;
    return (
      <div className="oddcell" data-tone="scale">
        <span>{formatOdds(p)}</span>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${grown ? p * 100 : 0}%`, opacity: 0.35 + 0.65 * rel }} />
        </div>
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
