/* sell_high: season touchdowns (rec_td + rush_td) minus expected touchdowns (xtd_rec + xtd_rush, from the yardline model)
   is at least `td_over_expected_min`, on at least `min_opportunities` targets + carries. RB/WR/TE. Needs the xTD model. */
import { SKILL, EPS, baseCandidate, ctxFor, isNum, latestGame, nextWeek, over, round, type Candidate, type Detector } from '../common.ts';

export const sellHigh: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.sell_high;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!SKILL.has(p.pos)) continue;
    const s = c.season.get(p.pid);
    if (!s || !isNum(s.xtd_rec) || !isNum(s.xtd_rush)) continue;
    const opps = s.tgt + s.car;
    if (opps < t.min_opportunities) continue;
    const tds = s.rec_td + s.rush_td;
    const xtd = s.xtd_rec + s.xtd_rush;
    const gap = isNum(s.td_gap) ? s.td_gap : tds - xtd;
    if (gap < t.td_over_expected_min - EPS) continue;
    const last = latestGame(c, p.pid);
    if (!last) continue;
    out.push({
      ...baseCandidate(c, p, 'sell_high', {
        week: nextWeek(c, p, inputs.week), throughWeek: last.week, tone: 'bad', score: over(gap, t.td_over_expected_min, t.td_over_expected_min + 2),
        sample: { label: 'opportunities', n: opps }, sources: ['nflverse'], actions: ['profile', 'watchlist', 'trade'], team: last.team,
      }),
      facts: { kind: 'sell_high', tds, xtd: round(xtd, 2), gap: round(gap, 2), opps, games: s.games },
    });
  }
  return out;
};
