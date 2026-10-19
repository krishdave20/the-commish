/* Every game in the almanac, as manager-versus-manager results. Regular-season games come from the weekly matchups (two rosters sharing a
   `matchup_id`; a bye has none and a week nobody has played yet scores 0-0, so neither counts). Playoff games come from the winners
   bracket, scored from the matchups of that round's week (both weeks of a two-week round, added). Consolation games are left out. */
import type { Matchup } from '../../data/types.ts';
import { roundWeeks } from '../bracket/template.ts';
import { rosterIndex } from './managers.ts';
import type { RosterSlot } from './managers.ts';
import type { Game, SeasonData, Side } from './types.ts';

const byRid = (a: Matchup, b: Matchup) => a.roster_id - b.roster_id;

/** The week's matchups as pairs of rows sharing a matchup id. */
function pairs(rows: readonly Matchup[]): Array<[Matchup, Matchup]> {
  const groups = new Map<number, Matchup[]>();
  for (const r of rows) {
    if (r.matchup_id === null || r.matchup_id === undefined) continue;
    groups.set(r.matchup_id, [...(groups.get(r.matchup_id) ?? []), r]);
  }
  const out: Array<[Matchup, Matchup]> = [];
  for (const g of groups.values()) if (g.length === 2) { const [a, b] = [...g].sort(byRid); out.push([a!, b!]); }
  return out;
}

/** The best starter of a team's week: the highest `players_points` among the starters. */
function topStarter(m: Matchup): Side['top'] {
  const pp = m.players_points;
  if (!pp) return undefined;
  let best: Side['top'];
  for (const pid of m.starters ?? []) {
    if (!pid || pid === '0') continue;
    const v = pp[pid];
    if (typeof v === 'number' && Number.isFinite(v) && (!best || v > best.pts)) best = { pid, pts: v };
  }
  return best;
}

const side = (m: Matchup, slot: RosterSlot, pts = m.points): Side => ({ mgr: slot.mgr, rid: m.roster_id, team: slot.team, pts, top: topStarter(m) });

/** Regular-season games, from the league's first scored week to `throughWeek`. */
export function regularGames(season: SeasonData, idx: Map<number, RosterSlot> = rosterIndex(season)): Game[] {
  const out: Game[] = [];
  for (let w = Math.max(1, season.startWeek); w <= season.throughWeek; w++) {
    for (const [x, y] of pairs(season.matchups[w] ?? [])) {
      const sa = idx.get(x.roster_id), sb = idx.get(y.roster_id);
      if (!sa || !sb) continue;
      // an unplayed week reads 0-0
      if (!x.points && !y.points) continue;
      out.push({
        season: season.season, week: w, kind: 'regular', a: side(x, sa), b: side(y, sb),
        winner: x.points > y.points ? sa.mgr : y.points > x.points ? sb.mgr : null,
      });
    }
  }
  return out;
}

/** Winners-bracket games that were played, with scores. A game whose scores cannot be found in the playoff weeks' matchups is left out. */
export function playoffGames(season: SeasonData, idx: Map<number, RosterSlot> = rosterIndex(season)): Game[] {
  const rows = season.winners.filter((r) => r.t1 != null && r.t2 != null && r.w != null);
  if (!rows.length) return [];
  const rounds = Math.max(...season.winners.map((r) => r.r));
  const weeks = roundWeeks(rounds, { weekStart: season.playoffWeekStart, roundType: season.playoffRoundType });
  const out: Game[] = [];
  for (const r of rows) {
    const sa = idx.get(r.t1!), sb = idx.get(r.t2!), win = idx.get(r.w!);
    if (!sa || !sb || !win) continue;
    let a = 0, b = 0, found = 0;
    let first: Matchup | undefined, second: Matchup | undefined;
    let week = 0;
    for (const wk of weeks[r.r - 1] ?? []) {
      const x = (season.matchups[wk] ?? []).find((m) => m.roster_id === r.t1);
      const y = (season.matchups[wk] ?? []).find((m) => m.roster_id === r.t2);
      // the two teams played each other that week
      if (!x || !y || x.matchup_id == null || x.matchup_id !== y.matchup_id) continue;
      a += x.points; b += y.points; found++;
      if (!first) { first = x; second = y; week = wk; }
    }
    if (!found || !first || !second) continue;
    out.push({
      season: season.season, week, kind: 'playoff', round: r.r,
      a: side(first, sa, a), b: side(second, sb, b), winner: win.mgr,
    });
  }
  return out;
}
