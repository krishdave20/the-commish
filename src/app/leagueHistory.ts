import { useMemo } from 'react';
import type { Fetched, LeagueUser, SleeperLeague, SleeperRoster } from '../data';
import type { SleeperClient } from '../data';
import { useData } from './dataContext';
import { useResource } from './hooks';
import type { Resource } from './hooks';
import { sleeperPoints } from './format';
import type { Fetcher } from './resourceStore';

export interface SeasonRecap {
  leagueId: string;
  season: string;
  name: string;
  /** Sleeper recorded a champion ('champion'), or this is the team that led the final standings ('standings') */
  decided: 'champion' | 'standings';
  winner: { rid: number; team: string; manager: string; wins: number; losses: number; ties: number; pf: number; isMe: boolean } | null;
}

/** One finished season, from its league object, rosters and users. The champion comes from Sleeper's
    `metadata.latest_league_winner_roster_id` when it is there; otherwise the final standings leader (wins, then points for). */
export function summarizeSeason(league: Pick<SleeperLeague, 'league_id' | 'season' | 'name' | 'metadata'>, rosters: SleeperRoster[], users: LeagueUser[], userId: string | null): SeasonRecap {
  const nameOf = (r: SleeperRoster) => {
    const u = users.find((x) => x.user_id === r.owner_id);
    return { team: u?.metadata?.team_name || (u ? `Team ${u.display_name}` : `Team ${r.roster_id}`), manager: u?.display_name ?? 'unknown manager' };
  };
  const rec = (r: SleeperRoster) => ({
    rid: r.roster_id, ...nameOf(r), wins: r.settings.wins ?? 0, losses: r.settings.losses ?? 0, ties: r.settings.ties ?? 0,
    pf: sleeperPoints(r.settings.fpts, r.settings.fpts_decimal),
    isMe: !!userId && (r.owner_id === userId || !!r.co_owners?.includes(userId)),
  });
  const base = { leagueId: league.league_id, season: league.season, name: league.name };
  const wid = Number(league.metadata?.latest_league_winner_roster_id);
  const champ = Number.isFinite(wid) && wid > 0 ? rosters.find((r) => r.roster_id === wid) : undefined;
  if (champ) return { ...base, decided: 'champion', winner: rec(champ) };
  const leader = rosters.slice().sort((a, b) =>
    (b.settings.wins ?? 0) - (a.settings.wins ?? 0)
    || sleeperPoints(b.settings.fpts, b.settings.fpts_decimal) - sleeperPoints(a.settings.fpts, a.settings.fpts_decimal))[0];
  return { ...base, decided: 'standings', winner: leader ? rec(leader) : null };
}

const none = (id: string | null | undefined) => !id || id === '0';

/** Follow `previous_league_id` back through past seasons (at most `max`), newest first. A season that cannot be fetched ends the chain. */
export async function loadLeagueHistory(
  sleeper: Pick<SleeperClient, 'league' | 'rosters' | 'users'>,
  league: SleeperLeague,
  userId: string | null,
  o: { force?: boolean; max?: number } = {},
): Promise<Fetched<SeasonRecap[]>> {
  const out: SeasonRecap[] = [];
  const parts: Array<Pick<Fetched<unknown>, 'asOf' | 'fromCache' | 'stale' | 'error'>> = [];
  let id = league.previous_league_id;
  const seen = new Set<string>([league.league_id]);
  let failure: string | undefined;
  while (!none(id) && out.length < (o.max ?? 10) && !seen.has(id!)) {
    seen.add(id!);
    try {
      const f = { force: o.force };
      const [l, r, u] = await Promise.all([sleeper.league(id!, f), sleeper.rosters(id!, f), sleeper.users(id!, f)]);
      parts.push(l, r, u);
      out.push(summarizeSeason(l.data, r.data, u.data, userId));
      id = l.data.previous_league_id;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      break;
    }
  }
  if (failure && out.length === 0) throw new Error(failure);
  return {
    data: out,
    asOf: parts.length ? Math.min(...parts.map((p) => p.asOf)) : Date.now(),
    fromCache: parts.length > 0 && parts.every((p) => p.fromCache),
    stale: parts.some((p) => p.stale),
    error: failure ?? parts.find((p) => p.error)?.error,
  };
}

/** The league's past seasons (the huddle's league history), shared through the resource store. */
export function useLeagueHistory(league: SleeperLeague | null, userId: string | null, enabled: boolean): Resource<SeasonRecap[]> {
  const { sleeper } = useData();
  const fetcher = useMemo<Fetcher<SeasonRecap[]> | null>(
    () => (sleeper && league && enabled ? (o) => loadLeagueHistory(sleeper, league, userId, { force: o?.force }) : null),
    [sleeper, league, userId, enabled],
  );
  return useResource(fetcher && league ? `league-history:${league.league_id}:${userId ?? ''}` : null, fetcher);
}
