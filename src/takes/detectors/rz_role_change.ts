/* rz_role_change: his share of his team's inside-10 plays (his i10 carries + i10 targets over the team's i10 rushes + pass
   attempts, in the games he played) over his last `weeks` games differs from the games before them by at least
   `i10_share_delta`. Each window needs `min_team_i10_plays` team plays; the bigger window needs 3+ of his touches; the prior
   window needs 2+ games. RB/WR/TE. Up is good, down is bad. */
import { EPS, MIN_I10_TOUCHES, MIN_PRIOR_GAMES, SKILL, baseCandidate, ctxFor, lastGames, nextWeek, over, sum, teamTotal, type Candidate, type Detector } from '../common.ts';

export const rzRoleChange: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.rz_role_change;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!SKILL.has(p.pos)) continue;
    const recent = lastGames(c, p.pid, t.weeks);
    const all = c.games.get(p.pid);
    if (!recent || !all) continue;
    const prior = all.slice(0, all.length - recent.length);
    if (prior.length < MIN_PRIOR_GAMES) continue;
    const team = recent[recent.length - 1]!.team;
    if (all.some((r) => r.team !== team)) continue;
    const plays = (rows: typeof recent) => teamTotal(c, team, rows.map((r) => r.week), (x) => x.i10_pass_att + x.i10_rush_att);
    const touches = (rows: typeof recent) => sum(rows.map((r) => r.i10_car + r.i10_tgt));
    const tpNow = plays(recent), tpPrior = plays(prior);
    if (tpNow == null || tpPrior == null || tpNow < t.min_team_i10_plays || tpPrior < t.min_team_i10_plays) continue;
    const tNow = touches(recent), tPrior = touches(prior);
    if (Math.max(tNow, tPrior) < MIN_I10_TOUCHES) continue;
    const now = tNow / tpNow, before = tPrior / tpPrior;
    const delta = now - before;
    if (Math.abs(delta) < t.i10_share_delta - EPS) continue;
    const up = delta > 0;
    out.push({
      ...baseCandidate(c, p, 'rz_role_change', {
        week: nextWeek(c, p, inputs.week), throughWeek: recent[recent.length - 1]!.week, tone: up ? 'good' : 'bad',
        score: over(Math.abs(delta), t.i10_share_delta, t.i10_share_delta + 0.3),
        sample: { label: 'team inside-10 plays', n: tpNow + tpPrior }, sources: ['nflverse'], actions: ['profile', 'watchlist'], team,
      }),
      facts: { kind: 'rz_role_change', now, prior: before, up, from: recent[0]!.week, to: recent[recent.length - 1]!.week, touchesNow: tNow, touchesPrior: tPrior, teamPlays: tpNow + tpPrior },
    });
  }
  return out;
};
