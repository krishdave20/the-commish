/* waiver_riser: a FREE AGENT (ownerRid 0) with at least `min_trending_adds` in the trending-adds list whose usage in his
   latest finished game is up at least `usage_delta` on the 3 games before it. Usage is the biggest of: snap share (pooled),
   target share (mean), rush share (mean). RB/WR/TE. Needs nflverse. */
import type { PlayerWeek } from '../../data/nflverseTypes.ts';
import { EPS, SKILL, baseCandidate, baselineBefore, ctxFor, isNum, latestGame, nextWeek, over, sum, type Candidate, type Detector } from '../common.ts';

const BASELINE_GAMES = 3;

export const waiverRiser: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.waiver_riser;
  const adds = new Map(inputs.trendingAdds.map((r) => [r.player_id, r.count]));
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (p.ownerRid !== 0 || !SKILL.has(p.pos)) continue;
    const count = adds.get(p.pid) ?? 0;
    if (count < t.min_trending_adds) continue;
    const latest = latestGame(c, p.pid);
    if (!latest) continue;
    const base = baselineBefore(c, p.pid, latest, BASELINE_GAMES);
    if (!base) continue;
    const mean = (f: (r: PlayerWeek) => number | null) => {
      const v = base.map(f).filter(isNum);
      return v.length === base.length ? sum(v) / v.length : null;
    };
    const baseSnaps = sum(base.map((r) => r.tm_snaps));
    const cands: Array<{ measure: 'snap share' | 'target share' | 'rush share'; now: number | null; base: number | null }> = [
      { measure: 'snap share', now: latest.snap_pct, base: baseSnaps > 0 ? sum(base.map((r) => r.off_snaps)) / baseSnaps : null },
      { measure: 'target share', now: latest.tgt_share, base: mean((r) => r.tgt_share) },
      { measure: 'rush share', now: latest.rush_share, base: mean((r) => r.rush_share) },
    ];
    let best: { measure: (typeof cands)[number]['measure']; now: number; base: number; delta: number } | null = null;
    for (const m of cands) {
      if (m.now == null || m.base == null) continue;
      const delta = m.now - m.base;
      if (!best || delta > best.delta) best = { measure: m.measure, now: m.now, base: m.base, delta };
    }
    if (!best || best.delta < t.usage_delta - EPS) continue;
    const heat = Math.min(1, Math.log10(count / t.min_trending_adds + 1) / 2);
    out.push({
      ...baseCandidate(c, p, 'waiver_riser', {
        week: nextWeek(c, p, inputs.week), throughWeek: latest.week, tone: 'good', score: 0.5 * over(best.delta, t.usage_delta, t.usage_delta + 0.2) + 0.5 * (0.4 + 0.6 * heat),
        sample: { label: 'games', n: base.length }, sources: ['sleeper', 'nflverse'], actions: ['profile', 'watchlist', 'lab'], team: latest.team,
      }),
      facts: { kind: 'waiver_riser', adds: count, measure: best.measure, now: best.now, base: best.base, from: base[0]!.week, to: base[base.length - 1]!.week, baseGames: base.length, week: latest.week },
    });
  }
  return out;
};
