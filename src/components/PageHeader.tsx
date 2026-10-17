import type { Freshness } from '../app/hooks';
import { formatAsOf } from '../app/format';

export interface LoadStatus { done: number; total: number; label: string }

interface Props {
  kicker: string;
  title: string;
  data: Freshness & {
    /** while a pull is under way: what it is fetching and how far along it is */
    progress?: LoadStatus | null;
  };
}

/** Kicker, display title, "Data as of" stamp, cached/stale chips and a Refresh button.
    A thin progress bar runs while a fetch is in flight. */
export function PageHeader({ kicker, title, data }: Props) {
  const { asOf, fromCache, stale, error, loading, refresh, progress } = data;
  return (
    <header className="page-head">
      <div className="micro">{kicker}</div>
      <h1>{title}</h1>
      <div className="stamp-row">
        <span>{asOf !== null ? `Data as of ${formatAsOf(asOf)}` : loading ? 'Loading data…' : 'No data yet'}</span>
        {fromCache && <span className="chip flat">cached</span>}
        {stale && <span className="chip gold">stale</span>}
        <button type="button" className="btn" onClick={() => { void refresh(); }} disabled={loading}>
          {loading && asOf !== null ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && (
        <p className="note neg-c" role="status">
          Could not reach the source{asOf !== null ? '; showing the saved copy' : ''}. {error}
        </p>
      )}
      {loading && progress && (
        <p className="note" role="status">{`pulling ${progress.label} · ${progress.done} of ${progress.total}`}</p>
      )}
      {loading && (
        progress ? (
          <div
            className="progress determinate" role="progressbar" aria-label="Refreshing data"
            aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
          >
            <i style={{ width: `${Math.max(3, Math.round((progress.done / Math.max(1, progress.total)) * 100))}%` }} />
          </div>
        ) : (
          <div className="progress" role="progressbar" aria-label="Refreshing data" aria-valuetext="Refreshing">
            <i />
          </div>
        )
      )}
    </header>
  );
}
