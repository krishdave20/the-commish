import { useMemo } from 'react';
import { useLiveMaybe } from '../../app/live/liveContext';
import { useScenario } from '../../app/modelContext';
import type { Engine, ModelTeam } from '../../engine';
import { buildPowerRankings } from '../../engine/power';
import type { PowerTeamWeek } from '../../engine/power';
import { projectWeek, restOfSeason, scheduleLeft, standingsRank, streakOf } from '../../engine/table';
import type { InPlay, ScheduleLeft, Streak, WeekOutlook } from '../../engine/table';
import { useRaceRows } from '../race/useRaceRows';
import type { RaceRow } from '../race/useRaceRows';

/** One team on "around the league": every number the page shows, each from the engine helper that already makes it. */
export interface BoardRow {
  rid: number;
  team: string;
  isMe: boolean;
  t: ModelTeam;
  /** standings rank now (wins, then points for) */
  rank: number;
  streak: Streak | null;
  /** odds, all-play and luck, exactly as the playoff picture shows them (what-ifs applied) */
  race: RaceRow;
  /** this week's game and the standings once it resolves */
  week: WeekOutlook;
  oppName: string | null;
  /** this week's power rankings entry; null before the first set (week 1) */
  power: PowerTeamWeek | null;
  /** expected lineup points, this week through the last regular week */
  ros: { total: number; perWeek: number; weeks: number };
  sched: ScheduleLeft;
}

export interface LeagueBoard {
  rows: BoardRow[];
  /** the week the board looks ahead to; null once the regular season is over */
  week: number | null;
  /** the power rankings' week and the last week of results in them; null before the first set */
  power: { week: number; through: number; hasRos: boolean } | null;
}

export function useLeagueBoard(engine: Engine): LeagueBoard {
  const { scenario } = useScenario();
  const race = useRaceRows(engine);
  const model = engine.model;
  const powerWeeks = useMemo(() => buildPowerRankings(model).weeks, [model]);
  // games already under way take game day's live win chance and projection (a replay of an old week does not count)
  const lv = useLiveMaybe();
  const view = lv && !lv.replay && lv.view?.week === model.meta.currentWeek ? lv.view : null;
  const inPlay = useMemo(() => {
    const out: Record<number, InPlay> = {};
    for (const m of view?.matchups ?? []) {
      if (!m.started) continue;
      out[m.a.rid] = { winP: m.winA, points: m.a.projection };
      out[m.b.rid] = { winP: 1 - m.winA, points: m.b.projection };
    }
    return out;
  }, [view]);
  return useMemo(() => {
    const { currentWeek: cur, lastRegularWeek: last } = model.meta;
    const means = engine.teamMeans(scenario);
    const vol = scenario.volatility;
    const out = Object.fromEntries(projectWeek(model, means, (a, b) => engine.winProb(a, b, vol), inPlay).map((r) => [r.rid, r]));
    const sched = Object.fromEntries(scheduleLeft(model, means).map((r) => [r.rid, r]));
    const ros = restOfSeason(model, means);
    const rank = standingsRank(model.teams);
    const pw = powerWeeks[powerWeeks.length - 1] ?? null;
    const powerOf = new Map(pw?.teams.map((p) => [p.rid, p]));
    const raceOf = new Map(race.map((r) => [r.rid, r]));
    const nameOf = new Map(model.teams.map((t) => [t.rid, t.team]));
    const rows = model.teams.flatMap((t): BoardRow[] => {
      const r = raceOf.get(t.rid);
      if (!r) return [];
      const week = out[t.rid]!;
      return [{
        rid: t.rid, team: t.team, isMe: t.rid === engine.meRid, t, rank: rank[t.rid]!, streak: streakOf(model.history, t.rid, last),
        race: r, week, oppName: week.opp === null ? null : nameOf.get(week.opp) ?? null,
        power: powerOf.get(t.rid) ?? null, ros: ros[t.rid]!, sched: sched[t.rid]!,
      }];
    });
    return {
      rows,
      week: cur <= last ? cur : null,
      power: pw ? { week: pw.week, through: pw.through, hasRos: pw.hasRos } : null,
    };
  }, [engine, model, scenario, race, powerWeeks, inPlay]);
}
