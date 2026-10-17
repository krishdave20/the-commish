/* coverage_note: a WR/TE with at least `min_routes` route-proxy routes against both man and zone in the coverage file whose
   yards per route run differs between them by at least `yprr_gap_min`, matched to his next opponent's tendency:
   - the opponent ran his BETTER coverage on at least `opp_rate_min` of dropbacks -> good (a fit);
   - the opponent ran his WORSE coverage on at least `opp_rate_min` of dropbacks -> bad (a clash).
   Both the player's splits and the opponent's man_rate come from the coverage file's season, which is last season until
   participation data exists for this one, so dataLabel is 'last season (YYYY)' then. Tone is 'watch' while it is last season's. */
import { EPS, PASS_CATCHERS, baseCandidate, ctxFor, latestGame, nextGames, over, unavailable, type Candidate, type Detector } from '../common.ts';

export const coverageNote: Detector = (inputs, th) => {
  const cov = inputs.nflverse?.coverage;
  if (!cov) return [];
  const c = ctxFor(inputs);
  const t = th.detectors.coverage_note;
  const label = cov.isCurrent ? null : `last season (${cov.season})`;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!PASS_CATCHERS.has(p.pos) || unavailable(c, p)) continue;
    const r = c.coverage.get(p.pid);
    if (!r || r.yprr_man == null || r.yprr_zone == null || r.man_routes < t.min_routes || r.zone_routes < t.min_routes) continue;
    const gap = r.yprr_man - r.yprr_zone;
    if (Math.abs(gap) < t.yprr_gap_min - EPS) continue;
    const next = nextGames(c, p, 1)[0];
    const manRate = next ? c.coverageTeams[next.opp]?.man_rate : null;
    if (!next || manRate == null) continue;
    const better: 'man' | 'zone' = gap > 0 ? 'man' : 'zone';
    const worse = better === 'man' ? 'zone' : 'man';
    const rateOf = (k: 'man' | 'zone') => (k === 'man' ? manRate : 1 - manRate);
    let oppCoverage: 'man' | 'zone';
    if (rateOf(better) >= t.opp_rate_min - EPS) oppCoverage = better;
    else if (rateOf(worse) >= t.opp_rate_min - EPS) oppCoverage = worse;
    else continue;
    const match = oppCoverage === better;
    const oppRate = rateOf(oppCoverage);
    const last = latestGame(c, p.pid);
    out.push({
      ...baseCandidate(c, p, 'coverage_note', {
        week: next.week, throughWeek: last?.week ?? Math.max(0, inputs.week - 1), tone: label ? 'watch' : match ? 'good' : 'bad',
        score: 0.5 * over(Math.abs(gap), t.yprr_gap_min, t.yprr_gap_min + 1) + 0.5 * over(oppRate, t.opp_rate_min, 0.85),
        sample: { label: 'routes in the smaller split', n: Math.min(r.man_routes, r.zone_routes) }, sources: ['nflverse'], actions: ['profile', 'watchlist'],
        dataLabel: label, team: last?.team ?? r.team,
      }),
      facts: { kind: 'coverage_note', better, yprrMan: r.yprr_man, yprrZone: r.yprr_zone, manRoutes: r.man_routes, zoneRoutes: r.zone_routes, opp: next.opp, oppCoverage, oppRate, match, season: cov.season },
    });
  }
  return out;
};
