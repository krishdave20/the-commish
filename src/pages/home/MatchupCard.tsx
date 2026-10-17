import { useMemo } from 'react';
import { formatOdds, formatPoints1 } from '../../app/format';
import { useScenario } from '../../app/modelContext';
import { FEATURE } from '../../app/names';
import type { Engine } from '../../engine';

/** This week's opponent: both teams' projected totals, my win chance and, once games are on, the live score. */
export function MatchupCard({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const { model, meRid } = engine;
  const cur = model.meta.currentWeek;

  const m = useMemo(() => {
    const row = model.history.find((h) => h.week === cur && h.rid === meRid);
    const game = model.games.find((g) => g.week === cur && (g.teamA === meRid || g.teamB === meRid));
    const oppRid = row?.opp ?? (game ? (game.teamA === meRid ? game.teamB : game.teamA) : null);
    const opp = oppRid === null ? null : model.teams.find((t) => t.rid === oppRid) ?? null;
    if (!opp) return null;
    const means = engine.teamMeans(scenario);
    const mine = means[meRid]?.[cur] ?? 0, theirs = means[opp.rid]?.[cur] ?? 0;
    const live = row && !row.final && (row.pts > 0 || row.oppPts > 0) ? { mine: row.pts, theirs: row.oppPts } : null;
    return { opp, mine, theirs, p: engine.winProb(mine, theirs, scenario.volatility), live };
  }, [engine, model, scenario, cur, meRid]);

  return (
    <section className="card" aria-labelledby="matchup-title">
      <header>
        <div className="micro">week {cur}</div>
        <h2 id="matchup-title">{FEATURE.matchup}</h2>
      </header>
      {!m ? <p className="note">no matchup this week.</p> : (
        <>
          <div className="game">
            <div className="side me"><span className="nm">{engine.me.team}</span><span className="meta">projected</span><span className="stat"><span className="v">{formatPoints1(m.mine)}</span></span></div>
            <div className="vs"><span>vs</span><span className="wp">{formatOdds(m.p)}</span></div>
            <div className="side r"><span className="nm">{m.opp.team}</span><span className="meta">projected</span><span className="stat"><span className="v">{formatPoints1(m.theirs)}</span></span></div>
          </div>
          <p className="take">
            {m.p >= 0.5 ? `you are a ${formatOdds(m.p)} favorite this week.` : `you are a ${formatOdds(m.p)} underdog this week.`}
            {m.live && ` live score: ${formatPoints1(m.live.mine)} to ${formatPoints1(m.live.theirs)}.`}
          </p>
          <p className="note">{m.opp.manager} · {m.opp.wins}–{m.opp.losses}{m.opp.ties ? `–${m.opp.ties}` : ''}. win chance from the projected totals and the league’s weekly spread.</p>
        </>
      )}
    </section>
  );
}
