import { formatOdds, formatPoints1, ordinal } from '../../app/format';
import { useModel } from '../../app/modelContext';
import { teamResult } from '../../app/results';
import { LiveDot } from '../../components/ticker/LiveDot';
import { Skeleton } from './Skeleton';
import { standingLine } from './standingLine';
import type { SideSummary } from '../../engine/almanac';
import { recordText } from '../almanac/text';
import type { CardState, FollowedLeague } from './useLeagueSummaries';

interface Props {
  entry: FollowedLeague;
  state: CardState | undefined;
  /** the league the app is following right now */
  active: boolean;
  /** games are on */
  live: boolean;
  onOpen: (e: FollowedLeague) => void;
  showAccount: boolean;
}

/** The odds from the model, only for the league the app has a model of (cheap: it is already built). */
function useModelOdds(leagueId: string): number | null {
  const { model, baseSim } = useModel();
  if (!model || model.meta.leagueId !== leagueId || model.oddsPending) return null;
  return teamResult(model, baseSim, model.meRid).playoff;
}

/** One side of the matchup: the score, the projection beside it, and the team. */
function Side({ side }: { side: SideSummary }) {
  return (
    <span className="lg-side">
      <span>
        <span className="lg-pts">{formatPoints1(side.points)}</span>
        {side.projected !== null && <span className="lg-proj"> / {formatPoints1(side.projected)}</span>}
      </span>
      <span className="lg-team">{side.team}</span>
    </span>
  );
}

export function LeagueCard({ entry, state, active, live, onOpen, showAccount }: Props) {
  const s = state?.summary;
  const odds = useModelOdds(entry.leagueId);
  const name = s?.name ?? state?.summary?.name ?? entry.leagueId;
  return (
    <li className="lg-card" data-active={active ? 'true' : undefined} data-state={state?.status ?? 'waiting'}>
      <div className="lg-top">
        <span className="micro">
          {showAccount ? `@${entry.account.username}` : s ? `${s.season}` : ''}{showAccount && s ? ` · ${s.season}` : ''}
          {active && <span className="you"> following now</span>}
        </span>
        <button type="button" className="lg-open" onClick={() => onOpen(entry)} aria-label={`open ${name}${showAccount ? ` for ${entry.account.displayName}` : ''}`}>
          {s ? s.name : 'league'}
        </button>
      </div>
      {!state || state.status === 'waiting' || state.status === 'loading' ? <Skeleton /> : state.status === 'error' ? (
        <p className="note neg-c" role="status">could not load this league. {state.error}</p>
      ) : s && !s.me ? (
        <p className="note">{entry.account.displayName} has no team in this league.</p>
      ) : s && s.me ? (
        <>
          <div className="lg-rec">
            <b>{recordText(s.me.wins, s.me.losses, s.me.ties)}</b>
            <span className="note">{s.me.team}</span>
          </div>
          {s.standing && (
            <p className="lg-line">
              {s.status === 'complete' ? `${ordinal(s.standing.rank)} of ${s.standing.of} in the regular season` : (
                <>
                  {ordinal(s.standing.rank)} of {s.standing.of}
                  {odds !== null ? ` · ${formatOdds(odds)} playoff odds` : ` · ${standingLine(s.standing)}`}
                </>
              )}
            </p>
          )}
          {s.status !== 'in_season' ? (
            <p className="lg-line">
              {s.status === 'complete' ? `${s.season} is over` : s.status === 'drafting' ? 'the draft is on' : 'the draft has not started'}
            </p>
          ) : s.matchup ? (
            <div className="lg-vs" role="group" aria-label={`week ${s.matchup.week} matchup`}>
              <Side side={s.matchup.me} />
              <span className="lg-mid">{live && s.matchup.started ? <span className="lg-live"><LiveDot /><span className="sr-only">live</span></span> : `wk ${s.matchup.week}`}</span>
              {s.matchup.opp ? <Side side={s.matchup.opp} /> : <span className="lg-side"><span className="dim">bye week</span></span>}
            </div>
          ) : <p className="lg-line">no matchup this week</p>}
        </>
      ) : null}
    </li>
  );
}
