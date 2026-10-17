/* buy_low: among WR/TE with a season row, at least `min_games` finished games and MIN_SPLIT_TARGETS targets, his season air-yards
   share ranks in the top `ay_share_rank_max` at his position, while his league-scored points per game (model pts over his
   finished games) rank worse than `ppg_rank_min` among the same position's players with `min_games` games. */
import { PASS_CATCHERS, MIN_SPLIT_TARGETS, baseCandidate, clamp01, ctxFor, latestGame, nextWeek, ppgOf, type Candidate, type Detector } from '../common.ts';

export const buyLow: Detector = (inputs, th) => {
  const c = ctxFor(inputs);
  if (!inputs.nflverse) return [];
  const t = th.detectors.buy_low;
  const out: Candidate[] = [];
  for (const pos of PASS_CATCHERS) {
    const pool = inputs.model.players.filter((p) => p.pos === pos);
    const ay = pool
      .map((p) => ({ p, s: c.season.get(p.pid) }))
      .filter((x): x is { p: typeof x.p; s: NonNullable<typeof x.s> } => !!x.s && x.s.ay_share != null && x.s.games >= t.min_games && x.s.tgt >= MIN_SPLIT_TARGETS)
      .sort((a, b) => b.s.ay_share! - a.s.ay_share! || a.p.pid.localeCompare(b.p.pid));
    const ppg = pool
      .map((p) => ({ p, v: ppgOf(c, p) }))
      .filter((x): x is { p: typeof x.p; v: NonNullable<typeof x.v> } => !!x.v && x.v.games >= t.min_games)
      .sort((a, b) => b.v.ppg - a.v.ppg || a.p.pid.localeCompare(b.p.pid));
    const ppgRank = new Map(ppg.map((x, i) => [x.p.pid, { rank: i + 1, ...x.v }]));
    ay.forEach(({ p, s }, i) => {
      const ayRank = i + 1;
      const pp = ppgRank.get(p.pid);
      if (ayRank > t.ay_share_rank_max || !pp || pp.rank <= t.ppg_rank_min) return;
      const last = latestGame(c, p.pid);
      if (!last) return;
      const a = 1 - (ayRank - 1) / t.ay_share_rank_max;
      const b = clamp01((pp.rank - t.ppg_rank_min) / 24);
      out.push({
        ...baseCandidate(c, p, 'buy_low', {
          week: nextWeek(c, p, inputs.week), throughWeek: last.week, tone: 'good', score: 0.4 + 0.3 * a + 0.3 * b,
          sample: { label: 'games', n: pp.games }, sources: ['nflverse', 'sleeper'], actions: ['profile', 'watchlist', 'trade'], team: last.team,
        }),
        facts: { kind: 'buy_low', ayShare: s.ay_share!, ayRank, ppg: pp.ppg, ppgRank: pp.rank, games: pp.games, pool: ppg.length },
      });
    });
  }
  return out;
};
