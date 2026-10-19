/* Weekly power rankings with movement. See score.ts for the formula.

   WEEK NUMBERING. "week N power rankings" are the rankings going into week N, from the finished weeks before it, so the rankings you read at the start of
   week 6 use weeks 1 to 5. The first set is week 2 (week 1 has no results). The CURRENT week also counts the roster-strength part (the model's projections
   exist only for now); earlier weeks are results only, so the step into the current week can include a roster-strength shift. Movement is places gained
   against the previous set (+3 up, −1 down). */
import { rateTeams } from '../draft/ratings.ts';
import type { Model } from '../types.ts';
import { powerLine } from './lines.ts';
import type { LineFacts } from './lines.ts';
import { finishedWeeks, powerParts, rankBy, scoreTeams, seasonToDate } from './score.ts';
import type { PowerRankings, PowerTeamWeek, PowerWeek } from './types.ts';

/** Roster id → expected points over the remaining regular season, from the draft room's ratings (as of now). */
export function rosStrength(model: Model): Record<number, number> {
  const out: Record<number, number> = {};
  for (const t of rateTeams({ model }).teams) out[t.rid] = t.rosPts;
  return out;
}

export interface PowerOpts {
  /** roster id → ROS strength for the current week; computed from the model when left out (pass `null` to skip it) */
  ros?: Readonly<Record<number, number>> | null;
}

/** One set of rankings: going into `week`, from the finished weeks before it. `prev` is the previous set (for movement). */
export function rankWeek(model: Model, week: number, prev: PowerWeek | null, ros: Readonly<Record<number, number>> | null): PowerWeek {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const rids = model.teams.map((t) => t.rid);
  const done = finishedWeeks(model.history, last).filter((w) => w < week);
  const through = done.length ? done[done.length - 1]! : week - 1;
  const hasRos = ros !== null && week === cur && cur <= last;
  const std = seasonToDate(model.history, rids, done);
  const parts = powerParts(std, hasRos ? ros : null);
  const scored = scoreTeams(parts);

  const index = scored.map((s) => s.index);
  const pfpg = parts.map((p) => p.pfpg);
  const rank = rankBy(rids, index, pfpg);
  const pfRank = rankBy(rids, pfpg), apRank = rankBy(rids, parts.map((p) => p.allPlay), pfpg), formRank = rankBy(rids, parts.map((p) => p.form), pfpg);
  const rosRank = hasRos ? rankBy(rids, parts.map((p) => p.ros!), pfpg) : null;
  const recordRank = rankBy(rids, std.map((t) => t.record.w + 0.5 * t.record.t), std.map((t) => t.pf));
  const leagueAvgPf = pfpg.length ? pfpg.reduce((s, x) => s + x, 0) / pfpg.length : 0;
  const prevRank = new Map(prev?.teams.map((t) => [t.rid, t.rank]));

  const teams: PowerTeamWeek[] = model.teams.map((t, i) => {
    const s = std[i]!;
    const before = prevRank.get(t.rid) ?? null;
    const movement = before === null ? null : before - rank[i]!;
    const facts: LineFacts = {
      rid: t.rid, rank: rank[i]!, teams: rids.length, movement, record: s.record, recordRank: recordRank[i]!, allPlay: s.allPlayRecord, allPlayRank: apRank[i]!,
      pfRank: pfRank[i]!, pfpg: pfpg[i]!, leagueAvgPf, luck: s.luck, streak: s.streak, lastPts: s.lastPts, lastVsAvg: s.lastVsAvg,
      rosRank: rosRank ? rosRank[i]! : null, weeksLeft: Math.max(0, last - through),
    };
    const line = powerLine(facts);
    return {
      rid: t.rid, team: t.team, isMe: t.rid === model.meRid, rank: rank[i]!, prevRank: before, movement, index: scored[i]!.index, raw: parts[i]!, scaled: scored[i]!.scaled,
      ranks: { pf: pfRank[i]!, allPlay: apRank[i]!, form: formRank[i]!, ros: rosRank ? rosRank[i]! : null, record: recordRank[i]! },
      record: s.record, allPlayRecord: s.allPlayRecord, luck: s.luck, games: s.games, streak: s.streak, lastPts: s.lastPts, lastVsAvg: s.lastVsAvg, leagueAvg: s.leagueAvg,
      driver: line.kind, line: line.text,
    };
  }).sort((a, b) => a.rank - b.rank);

  // biggest move each way; the better current rank breaks a tie
  const moved = teams.filter((t) => t.movement !== null);
  const riser = moved.filter((t) => t.movement! > 0).sort((a, b) => b.movement! - a.movement! || a.rank - b.rank)[0] ?? null;
  const faller = moved.filter((t) => t.movement! < 0).sort((a, b) => a.movement! - b.movement! || a.rank - b.rank)[0] ?? null;
  return { week, through, hasRos, teams, riser, faller };
}

/** Every set of rankings of the season so far, oldest first: week 2 through the current week (or the first week after the regular season). */
export function buildPowerRankings(model: Model, opts: PowerOpts = {}): PowerRankings {
  const { currentWeek: cur, lastRegularWeek: last } = model.meta;
  const lastWeek = Math.min(cur, last + 1);
  const needRos = cur >= 2 && cur <= last;
  const ros = opts.ros === undefined ? (needRos && model.teams.length ? rosStrength(model) : null) : opts.ros;
  const weeks: PowerWeek[] = [];
  for (let w = 2; w <= lastWeek; w++) {
    const wk = rankWeek(model, w, weeks[weeks.length - 1] ?? null, ros);
    // no finished week before it (a model with no history): nothing to rank
    if (!model.history.some((h) => h.final && h.week < w && h.week <= last)) continue;
    weeks.push(wk);
  }
  return { weeks, currentWeek: cur };
}
