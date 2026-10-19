/* Data for the bump chart: each team's rank in every set of rankings. */
import type { BumpData, PowerRankings } from './types.ts';

export function bumpData(r: PowerRankings): BumpData {
  const weeks = r.weeks.map((w) => w.week);
  const last = r.weeks[r.weeks.length - 1];
  const byRid = new Map<number, BumpData['series'][number]>();
  for (const w of r.weeks) {
    for (const t of w.teams) {
      let s = byRid.get(t.rid);
      if (!s) { s = { rid: t.rid, team: t.team, isMe: t.isMe, points: [] }; byRid.set(t.rid, s); }
      s.points.push({ week: w.week, rank: t.rank });
    }
  }
  const latest = (rid: number) => last?.teams.find((t) => t.rid === rid)?.rank ?? 99;
  const series = [...byRid.values()].sort((a, b) => latest(a.rid) - latest(b.rid) || a.rid - b.rid);
  return { weeks, teams: last?.teams.length ?? 0, series };
}
