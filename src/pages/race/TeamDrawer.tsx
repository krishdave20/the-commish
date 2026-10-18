import { useMemo } from 'react';
import { formatOdds, formatPct, formatPoints1, ordinal, signed, formatCount } from '../../app/format';
import { useModel, useScenario } from '../../app/modelContext';
import { teamResult } from '../../app/results';
import { Drawer } from '../../components/Drawer';
import { PlayerLink } from '../../components/PlayerLink';
import { OddsCell } from '../../components/OddsCell';
import { Sparkline } from '../../components/charts/Sparkline';
import { useLosersSetting } from '../../components/bracket/useBracketData';
import { LOSERS_COPY } from '../../app/names';
import type { Engine, ModelPlayer } from '../../engine';

interface Props {
  engine: Engine;
  rid: number | null;
  onClose: () => void;
}

export function TeamDrawer({ engine, rid, onClose }: Props) {
  const { model } = useModel();
  const { scenario, live } = useScenario();
  const { mode } = useLosersSetting();
  const team = rid === null ? null : engine.model.teams.find((t) => t.rid === rid) ?? null;

  const detail = useMemo(() => {
    if (!team) return null;
    const { currentWeek: cur, lastRegularWeek: last } = engine.model.meta;
    const isMe = team.rid === engine.meRid;
    const scope = engine.scope(scenario);
    const history = engine.model.history.filter((h) => h.rid === team.rid && h.final).sort((a, b) => a.week - b.week);
    const means = engine.teamMeans(scenario);
    const names = new Map(engine.model.teams.map((t) => [t.rid, t.team]));
    const games = engine.model.games
      .filter((g) => g.teamA === team.rid || g.teamB === team.rid)
      .sort((a, b) => a.week - b.week)
      .map((g) => {
        const opp = g.teamA === team.rid ? g.teamB : g.teamA;
        const mine = means[team.rid]?.[g.week] ?? 0;
        const theirs = means[opp]?.[g.week] ?? 0;
        return { id: g.id, week: g.week, opp: names.get(opp) ?? `team ${opp}`, mine, theirs, p: engine.winProb(mine, theirs, scenario.volatility) };
      });
    const ids = isMe ? scope.myRoster() : engine.model.players.filter((p) => p.ownerRid === team.rid).map((p) => p.pid);
    const span = Math.max(1, last - cur);
    const top = ids.map((id) => scope.idx.P[id]).filter((p): p is ModelPlayer => !!p).map((p) => {
      let v = 0;
      for (let w = cur + 1; w <= last; w++) v += scope.val(p, w, isMe);
      return { p, perWeek: v / span, v };
    }).sort((a, b) => b.v - a.v).slice(0, 5);
    const ap = engine.allPlay()[team.rid];
    return { history, games, top, ap, luck: engine.luck(team.rid) };
  }, [engine, team, scenario]);

  if (!team || !detail || !model) return null;
  const res = teamResult(model, live, team.rid);
  const seeds = res.seeds.map((v, i) => (v >= 0.01 ? `${ordinal(i + 1)} ${formatPct(v)}` : null)).filter(Boolean).join(' · ');
  const luck = detail.luck;
  const fieldOdds = mode === 'toilet' ? res.flush : res.consolation;

  return (
    <Drawer open onClose={onClose} title={team.team} kicker={`${team.manager} · ${team.wins}–${team.losses}${team.ties ? `–${team.ties}` : ''}`}>
      <div className="stat">
        <span className="micro">playoff odds</span>
        <OddsCell value={res.playoff} pending={engine.model.oddsPending} />
        <span className="note">{engine.model.oddsPending ? 'odds are still simming.' : <>{formatOdds(res.div)} to win the division · {formatPoints1(res.expW)} expected wins ({formatCount(res.winsP10)} to {formatCount(res.winsP90)})</>}</span>
      </div>
      <div className="stat">
        <span className="micro">title odds</span>
        <OddsCell value={res.title} pending={engine.model.oddsPending} />
        <span className="note">
          {engine.model.oddsPending ? 'odds are still simming.'
            : <>{formatOdds(res.finals)} to reach the final · {formatOdds(fieldOdds)} to be crowned {LOSERS_COPY[mode].champ}</>}
        </span>
      </div>
      <div className="stat">
        <span className="micro">weekly scores</span>
        <Sparkline points={detail.history.map((h) => ({ x: h.week, y: h.pts, win: h.pts > h.oppPts }))} />
      </div>
      <div className="stat">
        <span className="micro">all-play</span>
        <span className="v">{detail.ap?.record ?? '—'}</span>
        <span className="note">
          {luck > 0.4 ? `${signed(luck)} wins of good luck` : luck < -0.4 ? `${signed(luck)} wins of bad luck` : 'record matches its scoring'}
        </span>
      </div>
      <div className="stat">
        <span className="micro">next games</span>
        {detail.games.length === 0 ? <span className="note">no regular-season games left.</span> : (
          <div className="tw"><table>
            <caption className="sr-only">Remaining games</caption>
            <thead><tr><th scope="col" className="n">wk</th><th scope="col">opponent</th><th scope="col" className="n">proj</th><th scope="col">win chance</th></tr></thead>
            <tbody>
              {detail.games.map((g) => (
                <tr key={g.id}>
                  <td className="n">{g.week}</td><td>{g.opp}</td>
                  <td className="n">{formatPoints1(g.mine)} <span className="dim">{formatPoints1(g.theirs)}</span></td>
                  <td><OddsCell value={g.p} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      <div className="stat">
        <span className="micro">top players, rest of season</span>
        <ul className="plain">
          {detail.top.map(({ p, perWeek }) => (
            <li key={p.pid}><PlayerLink pid={p.pid} name={p.name} /><span className="dim"> {p.pos} · {formatPoints1(perWeek)}/wk</span></li>
          ))}
        </ul>
      </div>
      <div className="stat">
        <span className="micro">seed chances</span>
        <span className="note">{seeds || 'misses the playoffs in almost every run'}</span>
      </div>
    </Drawer>
  );
}
