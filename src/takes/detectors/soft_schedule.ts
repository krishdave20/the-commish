/* soft_schedule: the next `weeks` games (byes skipped, playoff weeks included) all have a matchup grade
   model.players[].dvp[week] of at least `dvp_soft_min` (points the opponent allows to his position vs league average).
   QB/RB/WR/TE whose next-game projection is at least MIN_SOFT_SCHEDULE_MU only, so the feed is about players who play. */
import { EPS, MIN_SOFT_SCHEDULE_MU, baseCandidate, ctxFor, latestGame, nextGames, over, unavailable, type Candidate, type Detector } from '../common.ts';

const POS = new Set(['QB', 'RB', 'WR', 'TE']);

export const softSchedule: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  const t = th.detectors.soft_schedule;
  const out: Candidate[] = [];
  for (const p of inputs.model.players) {
    if (!POS.has(p.pos) || unavailable(c, p)) continue;
    const games = nextGames(c, p, t.weeks);
    if (games.length < t.weeks) continue;
    if ((p.mu[games[0]!.week] ?? 0) < MIN_SOFT_SCHEDULE_MU) continue;
    const grades = games.map((g) => p.dvp[g.week]);
    if (grades.some((g) => g == null || g < t.dvp_soft_min - EPS)) continue;
    const gs = grades as number[];
    const mean = gs.reduce((a, b) => a + b, 0) / gs.length;
    const last = latestGame(c, p.pid);
    out.push({
      ...baseCandidate(c, p, 'soft_schedule', {
        week: games[0]!.week, throughWeek: last?.week ?? Math.max(0, inputs.week - 1), tone: 'good', score: over(mean, t.dvp_soft_min, t.dvp_soft_min + 0.3),
        sample: { label: 'matchups', n: gs.length }, sources: ['sleeper'], actions: ['profile', 'watchlist', 'trade'], team: last?.team ?? null,
      }),
      facts: { kind: 'soft_schedule', opps: games.map((g) => g.opp), grades: gs, weeks: games.map((g) => g.week), dvpSoftMin: t.dvp_soft_min },
    });
  }
  return out;
};
