import type { LeagueBundle, LeagueUser, SleeperRoster } from '../data';
import { sleeperPoints } from '../app/format';

export interface StandingRow {
  rank: number;
  rosterId: number;
  teamName: string;
  manager: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  /** rank by points for, 1 is best */
  pfRank: number;
  division: string | null;
  isMine: boolean;
}

/** True when `userId` owns the roster or is a co-owner. */
export function ownsRoster(r: SleeperRoster, userId: string): boolean {
  return r.owner_id === userId || (r.co_owners ?? []).includes(userId);
}

function teamLabel(user: LeagueUser | undefined, rosterId: number): string {
  return user?.metadata?.team_name?.trim() || user?.display_name || `Team ${rosterId}`;
}

/** Standings sorted by wins, then points for. */
export function buildStandings(bundle: LeagueBundle, userId: string | null): StandingRow[] {
  const { league, rosters, users } = bundle;
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const hasDivisions = (league.settings.divisions ?? 0) > 0;

  const rows = rosters.map((r) => {
    const owner = r.owner_id ? byId.get(r.owner_id) : undefined;
    const divNo = r.settings.division;
    return {
      rosterId: r.roster_id,
      teamName: teamLabel(owner, r.roster_id),
      manager: owner?.display_name ?? '—',
      wins: r.settings.wins ?? 0,
      losses: r.settings.losses ?? 0,
      ties: r.settings.ties ?? 0,
      pf: sleeperPoints(r.settings.fpts, r.settings.fpts_decimal),
      pa: sleeperPoints(r.settings.fpts_against, r.settings.fpts_against_decimal),
      division: hasDivisions && divNo ? (league.metadata?.[`division_${divNo}`] ?? `Division ${divNo}`) : null,
      isMine: userId !== null && ownsRoster(r, userId),
    };
  });

  const pfOrder = [...rows].sort((a, b) => b.pf - a.pf);
  const pfRank = new Map(pfOrder.map((r, i) => [r.rosterId, i + 1]));

  return rows
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf || a.rosterId - b.rosterId)
    .map((r, i) => ({ ...r, rank: i + 1, pfRank: pfRank.get(r.rosterId) ?? 0 }));
}

export function recordLabel(r: Pick<StandingRow, 'wins' | 'losses' | 'ties'>): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`;
}
