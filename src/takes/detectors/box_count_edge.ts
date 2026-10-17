/* box_count_edge: an RB whose season yards per carry into light boxes (6 or fewer defenders, FTN charted) is at least
   `ypc_light_min` and at least MIN_LIGHT_BOX_EDGE (0.5) above his overall yards per carry, on at least `min_light_carries` such carries, and whose next opponent (model opp for his next game) has
   faced light boxes on at least `opp_light_rate_min` of its charted rushes this season (pooled; MIN_OPP_BOX_CARRIES charted). */
import { EPS, MIN_LIGHT_BOX_EDGE, MIN_OPP_BOX_CARRIES, baseCandidate, ctxFor, latestGame, nextGames, over, pooledDefense, unavailable, type Candidate, type Detector } from '../common.ts';

export const boxCountEdge: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.box_count_edge;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (p.pos !== 'RB' || unavailable(c, p)) continue;
    const s = c.season.get(p.pid);
    if (!s || s.ypc_lgt == null || s.lgt_car < t.min_light_carries || s.ypc_lgt < t.ypc_light_min - EPS) continue;
    if (s.ypc == null || s.ypc_lgt - s.ypc < MIN_LIGHT_BOX_EDGE - EPS) continue;
    const last = latestGame(c, p.pid);
    const next = nextGames(c, p, 1)[0];
    if (!last || !next) continue;
    const opp = pooledDefense(c, next.opp, (x) => x.def_light_car, (x) => x.def_box_car);
    if (!opp || opp.n < MIN_OPP_BOX_CARRIES || opp.rate < t.opp_light_rate_min - EPS) continue;
    const score = 0.5 * over(s.ypc_lgt, t.ypc_light_min, t.ypc_light_min + 2) + 0.5 * over(opp.rate, t.opp_light_rate_min, t.opp_light_rate_min + 0.25);
    out.push({
      ...baseCandidate(c, p, 'box_count_edge', {
        week: next.week, throughWeek: last.week, tone: 'good', score, sample: { label: 'light-box carries', n: s.lgt_car },
        sources: ['nflverse', 'ftn'], actions: ['profile', 'watchlist', 'lab'], team: last.team,
      }),
      facts: { kind: 'box_count_edge', ypcLight: s.ypc_lgt, lgtCar: s.lgt_car, ypc: s.ypc, opp: next.opp, oppRate: opp.rate, oppCarries: opp.n },
    });
  }
  return out;
};
