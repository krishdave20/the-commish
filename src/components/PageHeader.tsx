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

/** Compact header: the title with its kicker beside it, and "data as of" with Refresh as a small line at the right (about 60 px tall,
    never more than ~110). A thin progress bar runs while a fetch is in flight. */
export function PageHeader({ kicker, title, data }: Props) {
  const { asOf, fromCache, stale, error, loading, refresh, progress } = data;
  return (
    <header className="page-head">
      <div className="head-title">
        <h1>{title}</h1>
        <span className="micro">{kicker}</span>
      </div>
      <div className="stamp-row">
        <span>{asOf !== null ? `Data as of ${formatAsOf(asOf)}` : loading ? 'Loading data…' : 'No data yet'}</span>
        {fromCache && <span className="chip flat">cached</span>}
        {stale && <span className="chip gold">stale</span>}
        <button type="button" className="btn quiet" onClick={() => { void refresh(); }} disabled={loading}>
          {loading && asOf !== null ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && (
        <p className="note neg-c" role="status">
          Could not reach the source{asOf !== null ? '; showing the saved copy' : ''}. {error}
        </p>
      )}
      {loading && progress && (
        // the live region says "refreshing data" once; the step counter changes too often to announce, so the progress bar carries it
        <p className="note">
          <span role="status" className="sr-only">refreshing data</span>
          {`pulling ${progress.label} · ${progress.done} of ${progress.total}`}
        </p>
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
