import { useMemo } from 'react';
import { useModel, useScenario } from '../../app/modelContext';
import { useLosersSetting } from '../../components/bracket/useBracketData';
import { teamResult } from '../../app/results';
import type { Engine, Mark } from '../../engine';

export interface RaceRow {
  rid: number;
  team: string;
  manager: string;
  division: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  allPlay: { w: number; l: number; pct: number; record: string };
  luck: number;
  playoff: number;
  /** chance of winning the championship */
  title: number;
  /** chance of winning the non-playoff teams' bracket: crowned the worst team (toilet bowl) or the best (consolation) */
  field: number;
  div: number;
  expW: number;
  p10: number;
  p90: number;
  mark: Mark;
  clinch: boolean;
  elim: boolean;
  rank: number;
  isMe: boolean;
}

export function useRaceRows(engine: Engine): RaceRow[] {
  const { live } = useScenario();
  const { model } = useModel();
  const { mode } = useLosersSetting();
  return useMemo(() => {
    if (!model) return [];
    const des = engine.designations();
    const ap = engine.allPlay();
    const rows = model.teams.map((t): RaceRow => {
      const r = teamResult(model, live, t.rid);
      const d = des[t.rid]!;
      const a = ap[t.rid] ?? { w: 0, l: 0, pct: 0, record: '0–0' };
      return {
        rid: t.rid, team: t.team, manager: t.manager, division: t.division, wins: t.wins, losses: t.losses, ties: t.ties, pf: t.pf,
        allPlay: a, luck: engine.luck(t.rid), playoff: r.playoff, title: r.title, field: mode === 'toilet' ? r.flush : r.consolation, div: r.div, expW: r.expW, p10: r.winsP10, p90: r.winsP90,
        mark: d.mark, clinch: d.clinch, elim: d.elim, rank: 0, isMe: t.rid === engine.meRid,
      };
    });
    const order = [...rows].sort((a, b) => b.playoff - a.playoff || b.wins - a.wins || b.pf - a.pf);
    order.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }, [engine, model, live, mode]);
}

