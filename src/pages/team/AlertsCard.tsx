import { useMemo } from 'react';
import { useState } from 'react';
import { formatPoints1, signed } from '../../app/format';
import { FEATURE } from '../../app/names';
import { useScenario } from '../../app/modelContext';
import { useComputed } from '../../app/useComputed';
import { useDebounced } from '../../app/useSimulation';
import { Checklist } from '../../components/Checklist';
import type { ChecklistItem } from '../../components/Checklist';
import type { Engine, ModelPlayer } from '../../engine';

/** Start/Sit Alerts: what to change in Sleeper this week, from the best lineup versus the one set there. */
export function AlertsCard({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const settled = useDebounced(scenario, 250);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { currentWeek: cur } = engine.model.meta;

  const base = useMemo(() => {
    const scope = engine.scope(settled);
    const L = scope.lineup(scope.myRoster(), cur, true);
    const starts = L.slots.filter((s) => s.p && !s.locked).map((s) => s.p as ModelPlayer);
    const sleeper = engine.me.starters.filter((id) => id && id !== '0');
    const ins = starts.filter((p) => !sleeper.includes(p.pid));
    const outs = sleeper.map((id) => scope.idx.P[id]).filter((p): p is ModelPlayer => !!p && !p.playedThisWeek && !starts.includes(p));
    const items: ChecklistItem[] = ins.map((p, k) => ({
      id: `start-${p.pid}`, done: false,
      label: `start ${p.name}${outs[k] ? ` over ${outs[k]!.name}` : ''} (${formatPoints1(scope.val(p, cur, true))} expected)`,
    }));
    for (const id of settled.drops) { const p = scope.idx.P[id]; if (p) items.push({ id: `drop-${id}`, done: false, label: `drop ${p.name} in sleeper` }); }
    for (const id of settled.adds) { const p = scope.idx.P[id]; if (p) items.push({ id: `add-${id}`, done: false, label: `add ${p.name} in sleeper` }); }
    for (const s of L.slots) {
      const p = s.p;
      if (!p) continue;
      if (p.opp[cur] === 'BYE') items.push({ id: `bye-${p.pid}`, done: false, label: `${p.name} has a bye this week and no one on your bench fits his slot` });
      else if (/Questionable|Doubtful|Out|Suspended/.test(p.injury) && !p.playedThisWeek) {
        items.push({ id: `q-${p.pid}`, done: false, label: `check ${p.name}’s status before kickoff (${p.injury.toLowerCase()})` });
      }
    }
    return items;
  }, [engine, settled, cur]);

  const wire = useComputed(() => {
    const board = engine.waivers(settled, 'reg');
    return board.list.slice(0, 2).map((x): ChecklistItem => ({
      id: `wv-${x.pid}`, done: false,
      label: `consider adding ${x.player.name} for ${x.drop.name} (${signed(x.gain)} points, bid $${x.bid} if he’s on waivers)`,
    }));
  }, [engine, settled]);

  const items = [...base, ...(wire.value ?? [])];
  const list = (items.length ? items : [{ id: 'none', done: false, label: 'your lineup is already set right.' }])
    .map((it) => ({ ...it, done: checked.has(it.id) }));

  return (
    <section className="card" aria-labelledby="alerts-title">
      <header>
        <div className="micro">to do before kickoff, week {cur}</div>
        <h2 id="alerts-title">{FEATURE.alerts}</h2>
      </header>
      <Checklist
        label={FEATURE.alerts} items={list}
        onToggle={(id) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
      />
      {wire.pending && <p className="note">checking the waiver wire…</p>}
    </section>
  );
}
