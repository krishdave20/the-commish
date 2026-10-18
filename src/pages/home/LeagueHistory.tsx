import { useMemo } from 'react';
import { useLeagueHistory, summarizeSeason } from '../../app/leagueHistory';
import { FEATURE } from '../../app/names';
import type { LeagueBundle } from '../../data';
import { formatPoints } from '../../app/format';

/** Past seasons, newest first: the champion when Sleeper records one, else the final standings leader. */
export function LeagueHistory({ bundle, userId }: { bundle: LeagueBundle; userId: string | null }) {
  const { league } = bundle;
  const past = useLeagueHistory(league, userId, true);
  // the followed league is itself a finished season in the offseason
  const own = useMemo(
    () => (league.status === 'complete' ? summarizeSeason(league, bundle.rosters, bundle.users, userId) : null),
    [league, bundle.rosters, bundle.users, userId],
  );
  const seasons = [...(own ? [own] : []), ...(past.data ?? [])];
  const first = !past.data && past.loading;
  return (
    <section className="card" aria-labelledby="history-title">
      <header>
        <div className="micro">follows the league back through its past seasons</div>
        <h2 id="history-title">{FEATURE.history}</h2>
      </header>
      {first && !own ? <p className="note" role="status">looking up past seasons…</p>
        : seasons.length === 0 ? <p className="note">{past.error ? `could not load past seasons. ${past.error}` : 'this league has no earlier seasons on sleeper.'}</p>
        : (
          <div className="tw">
            <table>
              <caption className="sr-only">League history</caption>
              <thead><tr><th scope="col">season</th><th scope="col">team</th><th scope="col">manager</th><th scope="col" className="n">record</th><th scope="col" className="n hide-sm">pf</th></tr></thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.leagueId} className={s.winner?.isMe ? 'me' : undefined}>
                    <td className="nowrap">{s.season}</td>
                    {s.winner ? (
                      <>
                        <td className="nowrap"><span className="pname">{s.winner.team}</span>{s.winner.isMe && <span className="you">you</span>} <span className={`pill ${s.decided === 'champion' ? 'ok' : 'mute'}`}>{s.decided === 'champion' ? 'champion' : 'standings leader'}</span></td>
                        <td>{s.winner.manager}</td>
                        <td className="n">{s.winner.wins}–{s.winner.losses}{s.winner.ties ? `–${s.winner.ties}` : ''}</td>
                        <td className="n hide-sm">{formatPoints(s.winner.pf)}</td>
                      </>
                    ) : <td colSpan={4} className="dim">no standings on record</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {seasons.some((s) => s.decided === 'standings') && <p className="note">where sleeper does not record a champion, the row shows the team that led the final standings (wins, then points for).</p>}
      {past.error && seasons.length > 0 && <p className="note neg-c" role="status">some earlier seasons could not be loaded. {past.error}</p>}
    </section>
  );
}
