/* One season's outcome: the regular-season standings, the champion and runner-up from the winners bracket, the toilet bowl winner and the playoff field. */
import { losersModeOf } from '../bracket/sleeper.ts';
import type { BracketRow } from '../../data/types.ts';
import type { RosterSlot } from './managers.ts';
import type { Game, SeasonData, SeasonOutcome, StandingRow } from './types.ts';

/** Regular-season standings from the games: wins (a tie is half), then points for. */
export function standingsOf(season: SeasonData, idx: Map<number, RosterSlot>, games: readonly Game[]): StandingRow[] {
  const rows = new Map<number, StandingRow>();
  for (const r of season.rosters) {
    const s = idx.get(r.rid)!;
    rows.set(r.rid, { rid: r.rid, mgr: s.mgr, team: s.team, w: 0, l: 0, t: 0, pf: 0, pa: 0, rank: 0 });
  }
  for (const g of games) {
    if (g.kind !== 'regular') continue;
    for (const [me, op] of [[g.a, g.b], [g.b, g.a]] as const) {
      const row = rows.get(me.rid);
      if (!row) continue;
      row.pf += me.pts; row.pa += op.pts;
      if (g.winner === null) row.t++; else if (g.winner === me.mgr) row.w++; else row.l++;
    }
  }
  const sorted = [...rows.values()].sort((x, y) => (y.w + y.t / 2) - (x.w + x.t / 2) || y.pf - x.pf || x.rid - y.rid);
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

/** The game that decides a bracket: `p: 1`, else the last game of the last round. */
export function finalOf(rows: readonly BracketRow[]): BracketRow | null {
  if (!rows.length) return null;
  return rows.find((r) => r.p === 1) ?? [...rows].sort((a, b) => b.r - a.r || b.m - a.m)[0] ?? null;
}

export function outcomeOf(season: SeasonData, idx: Map<number, RosterSlot>, games: readonly Game[]): SeasonOutcome {
  const standings = standingsOf(season, idx, games);
  const slot = (rid: number) => idx.get(rid);
  const final = finalOf(season.winners);

  let champion: SeasonOutcome['champion'] = null;
  let runnerUp: SeasonOutcome['runnerUp'] = null;
  if (final && final.w != null && slot(final.w)) {
    const s = slot(final.w)!;
    champion = { mgr: s.mgr, team: s.team, rid: final.w, source: 'bracket' };
    const l = final.l != null ? slot(final.l) : undefined;
    if (l) runnerUp = { mgr: l.mgr, team: l.team, rid: final.l!};
  } else if (season.complete && season.championRid != null && slot(season.championRid)) {
    const s = slot(season.championRid)!;
    champion = { mgr: s.mgr, team: s.team, rid: season.championRid, source: 'sleeper' };
  }

  // the toilet bowl winner: the losers bracket's last loser when the league plays a toilet bowl, else the regular season's last place
  let toilet: SeasonOutcome['toilet'] = null;
  const lf = finalOf(season.losers);
  if (losersModeOf(season.losers) === 'toilet' && lf && lf.l != null && slot(lf.l)) {
    const s = slot(lf.l)!;
    toilet = { mgr: s.mgr, team: s.team, rid: lf.l, source: 'toilet-bowl' };
  } else if (season.complete && standings.length) {
    const last = standings[standings.length - 1]!;
    toilet = { mgr: last.mgr, team: last.team, rid: last.rid, source: 'last-place' };
  }

  // the playoff field is known once the season is over (before that Sleeper only seeds round 1 from the standings)
  const playoffTeams: string[] = [];
  if (season.complete || champion) {
    const seen = new Set<string>();
    for (const r of season.winners) for (const t of [r.t1, r.t2]) {
      const s = t != null ? slot(t) : undefined;
      if (s && !seen.has(s.mgr)) { seen.add(s.mgr); playoffTeams.push(s.mgr); }
    }
  }
  return { season: season.season, leagueId: season.leagueId, name: season.name, complete: season.complete, standings, champion, runnerUp, toilet, playoffTeams };
}
