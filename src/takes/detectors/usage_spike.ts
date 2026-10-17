/* usage_spike: snap share in his latest finished game is at least `snap_share_jump` above his pooled snap share over the
   `baseline_weeks` games before it. RB/WR/TE only; the new share must be at least 30%; the latest game needs `min_team_snaps`. */
import { MIN_SPIKE_SNAP_SHARE, EPS, SKILL, baseCandidate, baselineBefore, ctxFor, latestGame, nextWeek, over, sum, unavailable, type Candidate, type Detector } from '../common.ts';

export const usageSpike: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.usage_spike;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!SKILL.has(p.pos) || unavailable(c, p)) continue;
    const latest = latestGame(c, p.pid);
    if (!latest || latest.snap_pct == null || latest.tm_snaps < t.min_team_snaps || latest.snap_pct < MIN_SPIKE_SNAP_SHARE) continue;
    const base = baselineBefore(c, p.pid, latest, t.baseline_weeks);
    if (!base) continue;
    const baseSnaps = sum(base.map((r) => r.tm_snaps));
    if (baseSnaps <= 0) continue;
    const baseShare = sum(base.map((r) => r.off_snaps)) / baseSnaps;
    const delta = latest.snap_pct - baseShare;
    if (delta < t.snap_share_jump - EPS) continue;
    const week = nextWeek(c, p, inputs.week);
    out.push({
      ...baseCandidate(c, p, 'usage_spike', {
        week, throughWeek: latest.week, tone: 'good', score: over(delta, t.snap_share_jump, t.snap_share_jump * 2.5),
        sample: { label: 'games', n: base.length }, sources: ['nflverse'], actions: ['profile', 'watchlist', 'lab'], team: latest.team,
      }),
      facts: { kind: 'usage_spike', now: latest.snap_pct, base: baseShare, baseFrom: base[0]!.week, baseTo: base[base.length - 1]!.week, baseGames: base.length, week: latest.week },
    });
  }
  return out;
};
