import { useEffect, useState } from 'react';
import { useApi } from '../../app/hooks';
import { useData } from '../../app/dataContext';
import { formatAsOf, formatBytes } from '../../app/format';
import { Disclosure } from '../../components/Disclosure';
import type { CacheStats } from '../../data';

export function CacheSection() {
  const api = useApi();
  const { store } = useData();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api.cacheStats().then(
      (s) => { if (alive) { setStats(s); setError(null); } },
      (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { alive = false; };
  }, [api, loadTick]);

  async function clear() {
    setConfirming(false);
    try {
      await api.clearCache();
      store.clear();
      setDone(true);
      setLoadTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Disclosure title="Cache" id="set-cache" hint={stats ? formatBytes(stats.totalBytes) : undefined}>
      {error && <p className="msg err" role="alert">Could not read the cache. {error}</p>}
      {stats && (
        <>
          <p>
            Total size: <strong>{formatBytes(stats.totalBytes)}</strong>
            {stats.quotaBytes !== undefined && <span className="dim"> of about {formatBytes(stats.quotaBytes)} available</span>}
          </p>
          {stats.entries.length === 0 ? (
            <p className="note">Nothing is cached yet.</p>
          ) : (
            <div className="tw">
              <table>
                <caption className="sr-only">Cached entries</caption>
                <thead>
                  <tr><th scope="col">Key</th><th scope="col" className="n">Size</th><th scope="col">Fetched</th></tr>
                </thead>
                <tbody>
                  {stats.entries.map((e) => (
                    <tr key={e.key}>
                      <td>{e.key}</td>
                      <td className="n">{formatBytes(e.bytes)}</td>
                      <td>{formatAsOf(e.fetchedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {confirming ? (
        <div className="confirm" role="group" aria-label="Confirm clearing the cache">
          <span>Clear all saved data? Everything is fetched again on the next visit.</span>
          <button type="button" className="btn warn" onClick={() => { void clear(); }}>Yes, clear it</button>
          <button type="button" className="btn quiet" onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn warn" onClick={() => { setConfirming(true); setDone(false); }}>Clear cache</button>
          {done && <span className="note pos-c" role="status">Cache cleared.</span>}
        </div>
      )}
    </Disclosure>
  );
}
