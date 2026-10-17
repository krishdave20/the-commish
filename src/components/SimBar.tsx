import { formatCount } from '../app/format';

interface Props {
  running: boolean;
  /** 0 to 1 */
  frac: number;
  runs: number;
}

/** A thin progress bar with "simming 20,000 seasons…" while a simulation runs. */
export function SimBar({ running, frac, runs }: Props) {
  if (!running) return null;
  return (
    <div className="simbar" role="status">
      <span className="note">{`simming ${formatCount(runs)} seasons…`}</span>
      <div
        className="progress" role="progressbar" aria-label="simulating" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(frac * 100)}
      >
        <i style={{ width: `${Math.max(3, Math.round(frac * 100))}%` }} />
      </div>
    </div>
  );
}
