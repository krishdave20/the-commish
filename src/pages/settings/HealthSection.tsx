import { useState } from 'react';
import { useActive, useApi, useLeagueBundle, useNflState } from '../../app/hooks';
import { useNflverse } from '../../app/nflverseData';
import { UnmatchedTable } from './UnmatchedTable';
import { formatBytes, formatMs } from '../../app/format';
import { summarize } from '../../app/health';
import { FEATURE, HEALTH_LABEL } from '../../app/names';
import type { HealthResult } from '../../data';

export function HealthSection() {
  const api = useApi();
  const { data: active } = useActive();
  const nfl = useNflState();
  const bundle = useLeagueBundle();
  const nv = useNflverse();
  const [results, setResults] = useState<HealthResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const state = nfl.data ?? (await api.nflState()).data;
      const ctx = {
        season: state.season,
        week: state.week,
        username: active?.account.username,
        userId: active?.account.userId,
        leagueId: active?.leagueId ?? undefined,
        draftId: bundle.data?.drafts[0]?.draft_id,
      };
      setResults(await api.healthChecks(ctx));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="section" aria-labelledby="set-health">
      <h2 id="set-health">{FEATURE.injuryReport}</h2>
      <p className="note">
        Data health: checks every source this app reads. Sleeper’s undocumented endpoints are marked, since they can change without notice.
      </p>
      <div className="row">
        <button type="button" className="btn" onClick={() => { void run(); }} disabled={running}>
          {running ? 'Running…' : 'Run checks'}
        </button>
        {results && <strong aria-live="polite">{summarize(results)}</strong>}
      </div>
      {error && <p className="msg err" role="alert">Could not run the checks. {error}</p>}
      {results && (
        <div className="tw">
          <table>
            <caption className="sr-only">Endpoint checks</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Docs</th>
                <th scope="col">Level</th>
                <th scope="col" className="n">HTTP</th>
                <th scope="col" className="n">Time</th>
                <th scope="col" className="n">Size</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{r.source}</td>
                  <td>{r.label}</td>
                  <td><span className={`pill ${r.documented ? 'ok' : 'warn'}`}>{r.documented ? 'documented' : 'undocumented'}</span></td>
                  <td><span className={`level ${r.level}`} data-level={r.level}><span>{HEALTH_LABEL[r.level]}</span></span></td>
                  <td className="n">{r.httpStatus ?? '—'}</td>
                  <td className="n">{formatMs(r.ms)}</td>
                  <td className="n">{formatBytes(r.bytes)}</td>
                  <td className="wrap">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="stack">
        <h3>Unmatched player IDs</h3>
        <UnmatchedTable players={nv.bundle?.unmatched ?? null} matched={nv.bundle?.manifest.matched} season={nv.bundle?.manifest.season} loading={nv.loading} />
      </div>
    </section>
  );
}
