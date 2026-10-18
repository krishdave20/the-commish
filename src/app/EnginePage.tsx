import type { ReactNode } from 'react';
import { PageHeader } from '../components/PageHeader';
import { PageSkeleton } from '../components/Skeleton';
import type { Engine } from '../engine';
import { PAGES } from './names';
import type { PageKey } from './names';
import { useModel } from './modelContext';
import { usePageTitle } from './usePageTitle';

interface Props {
  page: PageKey;
  /** extra text after the kicker, e.g. "week 6" */
  suffix?: (engine: Engine) => string | undefined;
  /** also reload this (nflverse, say) when Refresh is pressed */
  alsoRefresh?: () => Promise<void>;
  children: (engine: Engine) => ReactNode;
}

/** Page frame for engine-backed pages: header with the model's as-of stamp, Refresh and pull progress, then the body once the model is ready. */
export function EnginePage({ page, suffix, alsoRefresh, children }: Props) {
  const m = useModel();
  const p = PAGES[page];
  usePageTitle(p.path);
  const extra = m.engine && suffix ? suffix(m.engine) : undefined;
  const kicker = extra ? `${p.kicker} · ${extra}` : p.kicker;
  return (
    <div className="page page-fade">
      <PageHeader kicker={kicker} title={p.name} data={alsoRefresh ? { ...m, refresh: async () => { await Promise.all([m.refresh(), alsoRefresh()]); } } : m} />
      {m.engine ? children(m.engine) : (
        <>
          <p className={`note${m.error && !m.loading ? ' neg-c' : ''}`} role="status">
            {m.loading
              ? 'pulling your league and building the model. this takes a few seconds the first time.'
              : m.error ? `could not build the model. ${m.error}` : 'no league is selected yet.'}
          </p>
          {m.loading && <PageSkeleton />}
        </>
      )}
    </div>
  );
}
