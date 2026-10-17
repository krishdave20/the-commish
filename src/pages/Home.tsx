import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Phase } from '../data';
import { useActive, useLeagueBundle, useNflState } from '../app/hooks';
import { parsePreviewPhase, previewName } from '../app/huddlePhase';
import { useModel } from '../app/modelContext';
import { useNflverse } from '../app/nflverseData';
import { formatMoney, formatPoints, formatPoints1, ordinal } from '../app/format';
import { groupSlots, leagueScoring, leagueTypeLabel, statusLabel } from '../app/league';
import { FEATURE, PAGES } from '../app/names';
import { usePageTitle } from '../app/usePageTitle';
import { currentDraft, phaseLabel, safeDetectPhase } from '../app/phase';
import { CountUp } from '../components/CountUp';
import { Kpi } from '../components/Kpi';
import { PageHeader } from '../components/PageHeader';
import { AgeProfile } from './home/AgeProfile';
import { Drafting } from './home/Drafting';
import { InjuriesCard } from './home/InjuriesCard';
import { LeagueHistory } from './home/LeagueHistory';
import { MatchupCard } from './home/MatchupCard';
import { Movers } from './home/Movers';
import { OddsCard } from './home/OddsCard';
import { PreDraft } from './home/PreDraft';
import { RookieClass } from './home/RookieClass';
import { TopTakes } from './home/TopTakes';
import { WaiversCard } from './home/WaiversCard';
import { AlertsCard } from './team/AlertsCard';
import { buildStandings, recordLabel } from './standings';
import type { StandingRow } from './standings';
import type { LeagueBundle } from '../data';
import type { Engine } from '../engine';

export default function Home() {
  const bundle = useLeagueBundle();
  usePageTitle(PAGES.home.path);
  const nfl = useNflState();
  const model = useModel();
  const nv = useNflverse();
  const { data: active } = useActive();
  const [params] = useSearchParams();
  const data = bundle.data;
  const userId = active?.account.userId ?? null;

  const rows = useMemo(() => (data ? buildStandings(data, userId) : []), [data, userId]);
  const mine = rows.find((r) => r.isMine) ?? null;

  const live = useMemo(
    () => (data && nfl.data ? safeDetectPhase(nfl.data, data.league, currentDraft(data.league, data.drafts)) : null),
    [data, nfl.data],
  );
  // `#/?phase=offseason` forces a layout for review
  const forced = parsePreviewPhase(params.get('phase'));
  const phase: Phase | null = forced ?? live;
  const inSeason = phase === 'in_season' || phase === 'postseason';
  const season = nfl.data?.league_season ?? nfl.data?.season ?? data?.league.season ?? '';

  const header = { ...bundle, refresh: async () => { await Promise.all([bundle.refresh(), model.refresh(), nv.refresh()]); } };

  return (
    <div className="page page-fade">
      <PageHeader kicker={data ? `${PAGES.home.kicker} · ${data.league.season} season` : PAGES.home.kicker} title={PAGES.home.name} data={header} />

      {forced && (
        <p className="preview-note" role="status">
          <span>{FEATURE.preview}: {previewName(forced)}</span>
          <Link to={PAGES.home.path}>back to live</Link>
        </p>
      )}

      {!active?.leagueId && (
        <p className="note">No league is selected yet. Use “Add an account” in the sidebar to follow one.</p>
      )}
      {active?.leagueId && !data && !bundle.loading && (
        <p className="note neg-c" role="status">League data is not available yet. Try Refresh.</p>
      )}

      {data && mine && inSeason && <MyKpis mine={mine} teams={rows.length} />}

      {data && phase === 'drafting' && <Drafting bundle={data} userId={userId} />}
      {data && phase === 'pre_draft' && <PreDraft bundle={data} userId={userId} />}
      {data && phase === 'offseason' && <OffseasonSections bundle={data} userId={userId} season={season} />}
      {data && inSeason && <InSeasonSections engine={model.engine} loading={model.loading} error={model.error} />}

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

          {(inSeason || phase === null) && (
            <section className="card" aria-labelledby="home-standings">
              <header>
                <div className="micro">Sorted by wins, then points for</div>
                <h2 id="home-standings">Standings</h2>
              </header>
              <StandingsTable rows={rows} />
              <p><Link to={PAGES.race.path}>open the {PAGES.race.name} for odds and clinch marks →</Link></p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/** Playoff odds, this week's matchup, lineup alerts, injuries, the waiver wire's top three and the top takes for my players. */
function InSeasonSections({ engine, loading, error }: { engine: Engine | null; loading: boolean; error: string | undefined }) {
  if (!engine) {
    return (
      <p className={`note${error && !loading ? ' neg-c' : ''}`} role="status">
        {loading ? 'building the model for your odds, matchup and waiver adds…' : error ? `could not build the model. ${error}` : 'no model yet.'}
      </p>
    );
  }
  return (
    <>
      <div className="grid2">
        <OddsCard engine={engine} />
        <MatchupCard engine={engine} />
      </div>
      <div className="grid2">
        <AlertsCard engine={engine} withWire={false} />
        <InjuriesCard engine={engine} />
      </div>
      <WaiversCard engine={engine} />
      <TopTakes />
    </>
  );
}

/** Dynasty value movers, the rookie class, my roster's age profile and the league's history. */
function OffseasonSections({ bundle, userId, season }: { bundle: LeagueBundle; userId: string | null; season: string }) {
  return (
    <>
      <Movers bundle={bundle} userId={userId} />
      <div className="grid2">
        <RookieClass league={bundle.league} season={season} />
        <AgeProfile bundle={bundle} userId={userId} />
      </div>
      <LeagueHistory bundle={bundle} userId={userId} />
    </>
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
