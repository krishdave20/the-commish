import { formatMoney } from '../../app/format';
import { useLeagueBundle } from '../../app/hooks';
import { groupSlots, leagueScoring, leagueTypeLabel, statusLabel } from '../../app/league';
import { Disclosure } from '../../components/Disclosure';

/** The followed league's rules at a glance (it used to be a panel on the huddle). */
export function LeagueSection() {
  const { data } = useLeagueBundle();
  if (!data) return null;
  const { league } = data;
  return (
    <Disclosure title="The league" id="set-league" hint={league.name}>
      <dl className="defs">
        <dt>League</dt><dd>{league.name}</dd>
        <dt>Season</dt><dd>{league.season} · {statusLabel(league.status)}</dd>
        <dt>Scoring</dt><dd>{leagueScoring(league)} · {leagueTypeLabel(league.settings.type)}</dd>
        <dt>Teams</dt><dd>{league.total_rosters}</dd>
        <dt>Divisions</dt><dd>{league.settings.divisions ? league.settings.divisions : 'None'}</dd>
        <dt>Playoff teams</dt><dd>{league.settings.playoff_teams ?? '—'}</dd>
        <dt>Playoffs start</dt><dd>{league.settings.playoff_week_start ? `Week ${league.settings.playoff_week_start}` : '—'}</dd>
        <dt>FAAB budget</dt><dd>{league.settings.waiver_budget ? formatMoney(league.settings.waiver_budget) : 'None'}</dd>
        <dt>Roster slots</dt>
        <dd>
          <div className="chips" aria-label="Roster slots">
            {groupSlots(league.roster_positions).map(([pos, n]) => (
              <span key={pos} className="chip">{n > 1 ? `${pos} ×${n}` : pos}</span>
            ))}
          </div>
        </dd>
      </dl>
    </Disclosure>
  );
}
