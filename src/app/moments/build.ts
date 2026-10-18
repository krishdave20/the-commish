/* Maps what the app holds (league settings, the live layer's games and matchup) onto the moments engine's plain context pieces. */
import type { SleeperLeague } from '../../data';
import type { MatchupLive, NflGame } from '../../engine/live';
import type { Kickoff, LiveMatch, MomentSettings } from '../../engine/moments';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function settingsOf(league: SleeperLeague | null | undefined): MomentSettings {
  const s = league?.settings ?? {};
  return {
    waiverDayOfWeek: num(s.waiver_day_of_week), waiverType: num(s.waiver_type), dailyWaivers: num(s.daily_waivers),
    waiverClearDays: num(s.waiver_clear_days), tradeDeadline: num(s.trade_deadline), playoffWeekStart: num(s.playoff_week_start),
  };
}

/** A game that kicked off this long ago is over whatever a lagging feed says (the live poller uses 5 hours). */
const STALE = 5 * 3_600_000;
/** An NFL game lasts about three and a half hours: the preview clock works out who is on from kickoff times alone. */
const GAME_LENGTH = 3.5 * 3_600_000;

/** Games with a kickoff time, as the moments engine reads them. With `byClock` (the preview clock) the state comes from the kickoff time
    and `now` alone, since the feed describes today, not the previewed moment. */
export function kickoffsOf(games: readonly NflGame[], now: number, byClock = false): Kickoff[] {
  const out: Kickoff[] = [];
  for (const g of games) {
    if (g.kickoff === null) continue;
    let state: Kickoff['state'];
    if (byClock) state = now < g.kickoff ? 'pre' : now < g.kickoff + GAME_LENGTH ? 'live' : 'final';
    else state = g.state !== 'final' && now - g.kickoff > STALE ? 'final' : g.state;
    out.push({ id: g.id, home: g.home, away: g.away, kickoff: g.kickoff, state });
  }
  return out;
}

/** My live matchup in the engine's shape: points, the starters still to play and the live win chance. */
export function liveMatchOf(m: MatchupLive | null): LiveMatch | null {
  if (!m) return null;
  const left = (t: MatchupLive['a']) => t.starters.filter((p) => p.state === 'pre' || p.state === 'live').map((p) => ({ name: p.name, pos: p.pos }));
  return {
    mine: { name: m.a.name, pts: m.a.actual, left: left(m.a) },
    theirs: { name: m.b.name, pts: m.b.actual, left: left(m.b) },
    winP: m.winA, started: m.started, final: m.final,
  };
}
