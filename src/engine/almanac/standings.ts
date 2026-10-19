/* All-time standings: one row per manager across every season. Record, points and win percentage are regular-season games;
   titles, playoff trips and toilet bowls come from each season's outcome. */
import type { AllTimeRow, ManagerMap, SeasonOutcome } from './types.ts';

export function allTimeStandings(outcomes: readonly SeasonOutcome[], managers: ManagerMap): AllTimeRow[] {
  const rows = new Map<string, AllTimeRow>();
  const row = (mgr: string): AllTimeRow => {
    let r = rows.get(mgr);
    if (!r) { r = { mgr, seasons: 0, w: 0, l: 0, t: 0, games: 0, pct: 0, pf: 0, pa: 0, titles: 0, titleSeasons: [], playoffs: 0, toilets: 0 }; rows.set(mgr, r); }
    return r;
  };
  for (const o of outcomes) {
    for (const s of o.standings) {
      const r = row(s.mgr);
      // a season counts once the person has played a game in it
      if (s.w + s.l + s.t > 0) r.seasons++;
      r.w += s.w; r.l += s.l; r.t += s.t; r.pf += s.pf; r.pa += s.pa;
    }
    if (o.champion) { const r = row(o.champion.mgr); r.titles++; r.titleSeasons.push(o.season); }
    for (const m of o.playoffTeams) row(m).playoffs++;
    if (o.toilet) row(o.toilet.mgr).toilets++;
  }
  for (const r of rows.values()) {
    r.games = r.w + r.l + r.t;
    r.pct = r.games ? (r.w + r.t / 2) / r.games : 0;
  }
  // open rosters are not people: leave them out unless nothing else is there
  const out = [...rows.values()].filter((r) => managers.has(r.mgr));
  return out.sort((a, b) => b.pct - a.pct || b.titles - a.titles || b.pf - a.pf || a.mgr.localeCompare(b.mgr));
}
