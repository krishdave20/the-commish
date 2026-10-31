/* Check in's lookup, shared by the check-in page and the iPhone app's native check in: a Sleeper username to the account and its leagues
   (this season's, plus last season's in the offseason and preseason), and which leagues to tick by default. */
import type { DataApi, LinkedAccount, SleeperLeague, SleeperUser } from '../data';

export interface Lookup { user: SleeperUser; leagues: SleeperLeague[]; primarySeason: string; defaults: string[] }

/** Null when Sleeper has no account by that name. Throws when Sleeper cannot be reached. */
export async function lookupSleeper(api: DataApi, name: string, linked: readonly LinkedAccount[]): Promise<Lookup | null> {
  const user = await api.user(name);
  if (!user) return null;
  const state = (await api.nflState()).data;
  const primarySeason = state.league_season ?? state.season;
  const seasons = [primarySeason];
  if ((state.season_type === 'off' || state.season_type === 'pre') && state.previous_season) seasons.push(state.previous_season);
  const results = await Promise.all(seasons.map((s) => api.userLeagues(user.user_id, s)));
  const seen = new Set<string>();
  const leagues: SleeperLeague[] = [];
  for (const res of results) {
    for (const lg of res.data) {
      if (!seen.has(lg.league_id)) { seen.add(lg.league_id); leagues.push(lg); }
    }
  }
  const existing = linked.find((a) => a.userId === user.user_id);
  const current = leagues.filter((l) => l.season === primarySeason);
  const defaults = existing
    ? leagues.filter((l) => existing.leagueIds.includes(l.league_id))
    : current.length > 0 ? current : leagues;
  return { user, leagues, primarySeason, defaults: defaults.map((l) => l.league_id) };
}

/** The account to store for the leagues picked; keeps the followed league when it is still picked. */
export function linkedAccount(user: SleeperUser, typed: string, leagueIds: string[], existing: LinkedAccount | undefined): LinkedAccount {
  const activeLeagueId = existing?.activeLeagueId && leagueIds.includes(existing.activeLeagueId) ? existing.activeLeagueId : (leagueIds[0] ?? null);
  return {
    userId: user.user_id,
    username: user.username ?? typed.trim(),
    displayName: user.display_name,
    avatar: user.avatar,
    leagueIds,
    activeLeagueId,
    addedAt: existing?.addedAt ?? Date.now(),
  };
}
