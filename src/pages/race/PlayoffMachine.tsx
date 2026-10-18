import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { formatOdds, formatPoints1, signedPct } from '../../app/format';
import { useModel, useScenario } from '../../app/modelContext';
import { FEATURE } from '../../app/names';
import { teamResult } from '../../app/results';
import { useSimulation } from '../../app/useSimulation';
import { ClinchMark } from '../../components/ClinchMark';
import { OddsCell } from '../../components/OddsCell';
import { Segmented } from '../../components/Segmented';
import { SimBar } from '../../components/SimBar';
import type { Engine, Picks } from '../../engine';

const RUNS = 6000;

/** Pick winners for the remaining games. Marks and records update at once (strict math); odds are re-simulated on the machine channel. */
export function PlayoffMachine({ engine, picks, setPicks }: { engine: Engine; picks: Picks; setPicks: Dispatch<SetStateAction<Picks>> }) {
  const { model } = useModel();
  const { scenario, live } = useScenario();
  const games = engine.model.games;
  const weeks = useMemo(() => [...new Set(games.map((g) => g.week))].sort((a, b) => a - b), [games]);
  const [weekPick, setWeekPick] = useState<number | null>(null);
  const week = weekPick ?? weeks[0] ?? engine.model.meta.currentWeek;
  const pending = engine.model.oddsPending;
  const names = useMemo(() => new Map(engine.model.teams.map((t) => [t.rid, t.team])), [engine]);
  const means = useMemo(() => engine.teamMeans(scenario), [engine, scenario]);

  const des = useMemo(() => engine.designations(picks), [engine, picks]);
  const locked = useMemo(() => engine.standingsLocked(picks), [engine, picks]);
  const wc = useMemo(() => engine.winsToClinch(picks), [engine, picks]);
  const nPicks = Object.keys(picks).length;

  const input = useMemo(
    () => (nPicks > 0 ? engine.simInput(scenario, { runs: RUNS, picks }) : null),
    [engine, scenario, picks, nPicks],
  );
  const sim = useSimulation(input, 'machine', 150);
  const results = nPicks > 0 ? (sim.result ?? live) : live;

  const wp = (a: number, b: number) => engine.winProb(a, b, scenario.volatility);
  const favorite = (g: { teamA: number; teamB: number; week: number }) =>
    (means[g.teamA]?.[g.week] ?? 0) >= (means[g.teamB]?.[g.week] ?? 0) ? g.teamA : g.teamB;

  function pick(id: string, rid: number) {
    setPicks((p) => {
      const n = { ...p };
      if (n[id] === rid) delete n[id]; else n[id] = rid;
      return n;
    });
  }
  function favorites(onlyWeek: boolean) {
    setPicks((p) => {
      const n = { ...p };
      for (const g of games) if (!onlyWeek || g.week === week) n[g.id] = favorite(g);
      return n;
    });
  }
  function winOut() {
    setPicks((p) => {
      const n = { ...p };
      for (const g of games) if (g.teamA === engine.meRid || g.teamB === engine.meRid) n[g.id] = engine.meRid;
      return n;
    });
  }

  if (!model) return null;
  const order = model.teams
    .map((t) => ({ t, r: teamResult(model, results, t.rid), b: teamResult(model, live, t.rid) }))
    .sort((a, b) => b.r.playoff - a.r.playoff || (locked.W[b.t.rid] ?? 0) - (locked.W[a.t.rid] ?? 0));
  const me = order.find((o) => o.t.rid === engine.meRid);
  const myDes = des[engine.meRid];
  const weekGames = games.filter((g) => g.week === week);

  return (
    <section className="card" aria-labelledby="machine-title">
      <header>
        <div className="micro">pick winners, watch it move</div>
        <h2 id="machine-title">{FEATURE.machine}</h2>
        <p className="note">click a team to pick it to win; click it again to clear. marks and records change instantly; odds follow a moment later.</p>
      </header>

      {weeks.length === 0 ? <p className="note">no regular-season games left to pick.</p> : (
        <>
          <Segmented
            label="Playoff machine week" value={week} onChange={setWeekPick}
            options={weeks.map((w) => ({ value: w, label: `wk ${w}${games.some((g) => g.week === w && picks[g.id] != null) ? ' ●' : ''}` }))}
          />
          <div className="games" role="group" aria-label="Games this week">
            {weekGames.map((g) => {
              const a = means[g.teamA]?.[g.week] ?? 0;
              const b = means[g.teamB]?.[g.week] ?? 0;
              const p = wp(a, b);
              const chosen = picks[g.id];
              const side = (rid: number, right: boolean) => {
                const t = engine.model.teams.find((x) => x.rid === rid)!;
                const cls = ['side', right ? 'r' : '', rid === engine.meRid ? 'me' : '', chosen === rid ? 'win' : chosen != null ? 'lose' : ''].filter(Boolean).join(' ');
                return (
                  <button type="button" className={cls} aria-pressed={chosen === rid} onClick={() => pick(g.id, rid)}>
                    <span className="nm">{names.get(rid)}</span>
                    <span className="meta">{`${t.wins}–${t.losses} · proj ${formatPoints1(means[rid]?.[g.week] ?? 0)} · ${formatOdds(rid === g.teamA ? p : 1 - p)} to win`}</span>
                  </button>
                );
              };
              return (
                <div className="game" key={g.id}>
                  {side(g.teamA, false)}
                  <div className="vs" aria-hidden="true"><span>vs</span></div>
                  {side(g.teamB, true)}
                </div>
              );
            })}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => favorites(true)}>pick favorites (this week)</button>
            <button type="button" className="btn" onClick={() => favorites(false)}>pick favorites (all)</button>
            <button type="button" className="btn quiet" onClick={winOut}>you win out</button>
            <button type="button" className="btn warn" onClick={() => setPicks({})} disabled={nPicks === 0}>clear</button>
          </div>
        </>
      )}
      <p className="note" role="status">
        {nPicks ? `${nPicks} of ${games.length} remaining games picked.` : 'no picks yet. click a team to pick it to win.'}
      </p>
      <SimBar running={nPicks > 0 && sim.running} frac={sim.frac} runs={RUNS} />

      <div className="tw">
        <table>
          <caption className="sr-only">Playoff machine standings</caption>
          <thead>
            <tr>
              <th scope="col" className="n">#</th><th scope="col">team</th><th scope="col" className="n">record</th>
              <th scope="col" className="n">games left</th><th scope="col" className="n hide-sm">exp wins</th>
              <th scope="col">playoffs</th><th scope="col" className="n hide-sm">baseline</th><th scope="col" className="n">change</th>
            </tr>
          </thead>
          <tbody>
            {order.map(({ t, r, b }, i) => {
              const d = r.playoff - b.playoff;
              return (
                <tr key={t.rid} className={[t.rid === engine.meRid ? 'me' : '', i === engine.model.meta.playoffTeams - 1 ? 'cut' : ''].filter(Boolean).join(' ') || undefined}>
                  <td className="n dim">{i + 1}</td>
                  <td><ClinchMark mark={des[t.rid]?.mark} /><span className="pname">{t.team}</span></td>
                  <td className="n">{`${locked.W[t.rid]}–${locked.L[t.rid]}`}</td>
                  <td className="n dim">{locked.open[t.rid]}</td>
                  <td className="n hide-sm">{formatPoints1(r.expW)}</td>
                  <td><OddsCell value={r.playoff} pending={pending} /></td>
                  <td className="n hide-sm dim">{pending ? '…' : formatOdds(b.playoff)}</td>
                  <td className={`n ${nPicks === 0 ? 'dim' : d > 0.005 ? 'pos-c' : d < -0.005 ? 'neg-c' : 'dim'}`}>{nPicks === 0 || pending ? '—' : signedPct(d)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {me && (
        <p className="take">
          {engine.me.team}:{' '}
          {pending ? <>odds are still simming. </> : (
            <>
              <b>{formatOdds(me.r.playoff)}</b> to make it
              {engine.model.meta.divisions > 0 && <>, {formatOdds(me.r.div)} to win the division</>}.{' '}
            </>
          )}
          {myDes?.clinch ? 'clinched with these picks.'
            : myDes?.elim ? 'eliminated with these picks.'
            : wc.spot === null ? 'no number of your own wins guarantees a spot yet.'
            : wc.winOut ? `win all ${wc.open} of your open games to clinch outright.`
            : `win ${wc.spot} of your ${wc.open} open games to clinch outright.`}
        </p>
      )}
    </section>
  );
}
