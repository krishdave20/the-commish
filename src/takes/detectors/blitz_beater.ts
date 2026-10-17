/* blitz_beater: a WR/TE whose season yards per target against the blitz (FTN: at least one blitzer) beats his yards per
   target with no blitz by at least `ypt_blitz_over_baseline`, on at least `min_blitz_targets` blitz targets and
   MIN_SPLIT_TARGETS no-blitz targets, whose next opponent blitzes on at least `opp_blitz_rate_min` of the dropbacks it faces
   (pooled this season; MIN_OPP_DROPBACKS charted). */
import { EPS, MIN_OPP_DROPBACKS, MIN_SPLIT_TARGETS, PASS_CATCHERS, baseCandidate, ctxFor, latestGame, nextGames, over, pooledDefense, unavailable, type Candidate, type Detector } from '../common.ts';

export const blitzBeater: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.blitz_beater;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!PASS_CATCHERS.has(p.pos) || unavailable(c, p)) continue;
    const s = c.season.get(p.pid);
    if (!s || s.ypt_bl == null || s.ypt_nbl == null || s.bl_tgt < t.min_blitz_targets || s.nbl_tgt < MIN_SPLIT_TARGETS) continue;
    const gap = s.ypt_bl - s.ypt_nbl;
    if (gap < t.ypt_blitz_over_baseline - EPS) continue;
    const last = latestGame(c, p.pid);
    const next = nextGames(c, p, 1)[0];
    if (!last || !next) continue;
    const opp = pooledDefense(c, next.opp, (x) => x.def_blitz, (x) => x.def_db);
    if (!opp || opp.n < MIN_OPP_DROPBACKS || opp.rate < t.opp_blitz_rate_min - EPS) continue;
    const score = 0.5 * over(gap, t.ypt_blitz_over_baseline, t.ypt_blitz_over_baseline + 3) + 0.5 * over(opp.rate, t.opp_blitz_rate_min, t.opp_blitz_rate_min + 0.2);
    out.push({
      ...baseCandidate(c, p, 'blitz_beater', {
        week: next.week, throughWeek: last.week, tone: 'good', score, sample: { label: 'blitz targets', n: s.bl_tgt },
        sources: ['nflverse', 'ftn'], actions: ['profile', 'watchlist', 'lab'], team: last.team,
      }),
      facts: { kind: 'blitz_beater', yptBlitz: s.ypt_bl, yptNo: s.ypt_nbl, blTgt: s.bl_tgt, nblTgt: s.nbl_tgt, opp: next.opp, oppRate: opp.rate, oppDropbacks: opp.n },
    });
  }
  return out;
};
