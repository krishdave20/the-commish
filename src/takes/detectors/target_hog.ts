/* target_hog: pooled target share (his targets / his team's pass attempts in those games) over his last `weeks` finished
   games is at least `min_target_share`, with at least `min_targets` targets in the window. RB/WR/TE. */
import { EPS, SKILL, baseCandidate, ctxFor, lastGames, nextWeek, over, sum, teamTotal, unavailable, type Candidate, type Detector } from '../common.ts';

export const targetHog: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.target_hog;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!SKILL.has(p.pos) || unavailable(c, p)) continue;
    const win = lastGames(c, p.pid, t.weeks);
    if (!win) continue;
    const tgt = sum(win.map((r) => r.tgt));
    if (tgt < t.min_targets) continue;
    const team = win[win.length - 1]!.team;
    const teamPass = teamTotal(c, team, win.map((r) => r.week), (x) => x.pass_att);
    if (!teamPass || win.some((r) => r.team !== team)) continue;
    const share = tgt / teamPass;
    if (share < t.min_target_share - EPS) continue;
    const seasonShare = c.season.get(p.pid)?.tgt_share ?? null;
    out.push({
      ...baseCandidate(c, p, 'target_hog', {
        week: nextWeek(c, p, inputs.week), throughWeek: win[win.length - 1]!.week, tone: 'good', score: over(share, t.min_target_share, t.min_target_share + 0.15),
        sample: { label: 'targets', n: tgt }, sources: ['nflverse'], actions: ['profile', 'watchlist'], team,
      }),
      facts: { kind: 'target_hog', share, from: win[0]!.week, to: win[win.length - 1]!.week, tgt, games: win.length, seasonShare, teamPass },
    });
  }
  return out;
};
