import { useMemo } from 'react';
import { useState } from 'react';
import { FEATURE } from '../../app/names';
import { useScenario } from '../../app/modelContext';
import { useComputed } from '../../app/useComputed';
import { useDebounced } from '../../app/useSimulation';
import { Checklist } from '../../components/Checklist';
import type { Engine } from '../../engine';
import { lineupAlerts, waiverAlerts } from './alerts';

/** Start/Sit Alerts: what to change in Sleeper this week, from the best lineup versus the one set there. */
export function AlertsCard({ engine, withWire = true }: { engine: Engine; /** the huddle lists the waiver adds in their own card */ withWire?: boolean }) {
  const { scenario } = useScenario();
  const settled = useDebounced(scenario, 250);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const { currentWeek: cur } = engine.model.meta;

  const base = useMemo(() => lineupAlerts(engine, settled), [engine, settled]);
  const wire = useComputed(() => (withWire ? waiverAlerts(engine, settled, 2) : []), [engine, settled, withWire]);

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
      {withWire && wire.pending && <p className="note">checking the waiver wire…</p>}
    </section>
  );
}
