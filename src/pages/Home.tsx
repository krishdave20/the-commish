import { useMemo } from 'react';
import { useActive, useLeagueBundle, useNflState } from '../app/hooks';
import { formatMoney, formatPoints, formatPoints1, ordinal } from '../app/format';
import { groupSlots, leagueScoring, leagueTypeLabel, statusLabel } from '../app/league';
import { PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { currentDraft, phaseLabel, safeDetectPhase } from '../app/phase';
import { CountUp } from '../components/CountUp';
import { Kpi } from '../components/Kpi';
import { PageHeader } from '../components/PageHeader';
import { buildStandings, recordLabel } from './standings';
import type { StandingRow } from './standings';

export default function Home() {
  const bundle = useLeagueBundle();
  usePageTitle(PAGES.home.path);
  const nfl = useNflState();
  const { data: active } = useActive();
  const data = bundle.data;
  const userId = active?.account.userId ?? null;

  const rows = useMemo(() => (data ? buildStandings(data, userId) : []), [data, userId]);
  const mine = rows.find((r) => r.isMine) ?? null;

  const phase = useMemo(
    () => (data && nfl.data ? safeDetectPhase(nfl.data, data.league, currentDraft(data.league, data.drafts)) : null),
    [data, nfl.data],
  );

  return (
    <div className="page page-fade">
      <PageHeader kicker={data ? `${PAGES.home.kicker} · ${data.league.season} season` : PAGES.home.kicker} title={PAGES.home.name} data={bundle} />

      {!active?.leagueId && (
        <p className="note">No league is selected yet. Use “Add an account” in the sidebar to follow one.</p>
      )}
      {active?.leagueId && !data && !bundle.loading && (
        <p className="note neg-c" role="status">League data is not available yet. Try Refresh.</p>
      )}

      {data && mine && <MyKpis mine={mine} teams={rows.length} />}

      {data && (
        <div className="home-grid">
          <section className="card" aria-labelledby="home-league">
            <header>
              <div className="micro">League</div>
              <h2 id="home-league">{data.league.name}</h2>
            </header>
            <dl className="defs">
              <dt>Season</dt><dd>{data.league.season} · {statusLabel(data.league.status)}</dd>
              <dt>Scoring</dt><dd>{leagueScoring(data.league)} · {leagueTypeLabel(data.league.settings.type)}</dd>
              <dt>Teams</dt><dd>{data.league.total_rosters}</dd>
              <dt>Divisions</dt><dd>{data.league.settings.divisions ? data.league.settings.divisions : 'None'}</dd>
              <dt>Playoff teams</dt><dd>{data.league.settings.playoff_teams ?? '—'}</dd>
              <dt>Playoffs start</dt><dd>{data.league.settings.playoff_week_start ? `Week ${data.league.settings.playoff_week_start}` : '—'}</dd>
              <dt>FAAB budget</dt><dd>{data.league.settings.waiver_budget ? formatMoney(data.league.settings.waiver_budget) : 'None'}</dd>
              <dt>Roster slots</dt>
              <dd>
                <div className="chips" aria-label="Roster slots">
                  {groupSlots(data.league.roster_positions).map(([pos, n]) => (
                    <span key={pos} className="chip">{n > 1 ? `${pos} ×${n}` : pos}</span>
                  ))}
                </div>
              </dd>
            </dl>
            <p className="note">{`Phase: ${phaseLabel(phase)}`}</p>
          </section>

          <section className="card" aria-labelledby="home-standings">
            <header>
              <div className="micro">Sorted by wins, then points for</div>
              <h2 id="home-standings">Standings</h2>
            </header>
            <StandingsTable rows={rows} />
          </section>
        </div>
      )}

      {data && <p className="note">Playoff odds, matchup and waiver adds arrive in milestone 2.</p>}
    </div>
  );
}

function MyKpis({ mine, teams }: { mine: StandingRow; teams: number }) {
  return (
    <div className="kpis" aria-label="Your season so far">
      <Kpi label="Your record" sub={`${mine.teamName}, ${ordinal(mine.rank)} of ${teams}`}>
        <span>
          <CountUp value={mine.wins} />–<CountUp value={mine.losses} />{mine.ties > 0 && <>–<CountUp value={mine.ties} /></>}
        </span>
      </Kpi>
      <Kpi label="Points-for rank" sub={`of ${teams} teams`}>
        <span>#<CountUp value={mine.pfRank} /></span>
      </Kpi>
      <Kpi label="Points for" sub={`${formatPoints1(mine.pa)} against`}>
        <CountUp value={Number(formatPoints1(mine.pf))} decimals={1} />
      </Kpi>
    </div>
  );
}

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="tw">
      <table>
        <caption className="sr-only">League standings</caption>
        <thead>
          <tr>
            <th scope="col" className="n">#</th>
            <th scope="col">Team</th>
            <th scope="col">Manager</th>
            <th scope="col" className="n">W-L</th>
            <th scope="col" className="n">PF</th>
            <th scope="col" className="n">PA</th>
            <th scope="col">Division</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rosterId} className={r.isMine ? 'me' : undefined} aria-current={r.isMine ? 'true' : undefined}>
              <td className="n">{r.rank}</td>
              <td><span className="pname">{r.teamName}</span>{r.isMine && <span className="you">you</span>}</td>
              <td>{r.manager}</td>
              <td className="n">{recordLabel(r)}</td>
              <td className="n">{formatPoints(r.pf)}</td>
              <td className="n">{formatPoints(r.pa)}</td>
              <td>{r.division ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
