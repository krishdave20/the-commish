/* Builders for the draft tests: league objects, projection rows, and a synthetic player pool. */
import type { ProjectionRow } from '../../data/types.ts';
import type { LeagueLike } from './adp.ts';

export const STD_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN'];

export function leagueOf(over: { slots?: string[]; rec?: number; type?: number; teams?: number; scoring?: Record<string, number> } = {}): LeagueLike {
  return {
    roster_positions: over.slots ?? STD_SLOTS,
    scoring_settings: { rec: over.rec ?? 1, ...(over.scoring ?? {}) },
    settings: { type: over.type ?? 0, num_teams: over.teams ?? 12 },
    total_rosters: over.teams ?? 12,
  };
}

export interface RowOpts { adp?: Record<string, number>; yearsExp?: number; team?: string; first?: string; last?: string }

/** A season projection row whose PPR/half/std points are `pts` (+ 0.1 per... nothing: all three columns equal unless given). */
export function projRow(pid: string, pos: string, pts: number, o: RowOpts = {}): ProjectionRow {
  return {
    player_id: pid, team: o.team ?? 'AAA',
    stats: { pts_ppr: pts, pts_half_ppr: pts - 1, pts_std: pts - 2, ...(o.adp ?? {}) },
    player: { first_name: o.first ?? pid, last_name: o.last ?? 'X', position: pos, team: o.team ?? 'AAA', years_exp: o.yearsExp ?? 3 },
  };
}

/** A pool shaped like a real one: points fall off with depth; ADP follows the points order across positions. */
export function syntheticPool(): ProjectionRow[] {
  const spec: Array<[string, number, number, number]> = [
    // pos, count, top points, decay
    ['QB', 16, 340, 12], ['RB', 45, 300, 5.5], ['WR', 55, 310, 4.5], ['TE', 22, 220, 8], ['K', 14, 150, 3], ['DEF', 14, 140, 4],
  ];
  const rows: ProjectionRow[] = [];
  for (const [pos, n, top, decay] of spec) {
    for (let i = 0; i < n; i++) rows.push(projRow(`${pos}${i + 1}`, pos, top - decay * i - (i >= 3 ? 15 : 0) - (i >= 10 ? 20 : 0)));
  }
  // ADP: order skill positions by points, put QB/TE a bit later, K/DEF last
  const adpScore = (r: ProjectionRow) => {
    const pos = r.player!.position!, pts = r.stats.pts_ppr!;
    return pos === 'K' || pos === 'DEF' ? 1000 - pts : pos === 'QB' ? 520 - pts : pos === 'TE' ? 470 - pts : 400 - pts;
  };
  rows.slice().sort((a, b) => adpScore(a) - adpScore(b)).forEach((r, i) => {
    r.stats.adp_ppr = i + 1; r.stats.adp_half_ppr = i + 1; r.stats.adp_std = i + 1; r.stats.adp_2qb = i + 1;
  });
  return rows;
}
