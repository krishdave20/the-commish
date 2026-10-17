import { ScenarioBanner } from '../components/ScenarioBanner';
import { SimBar } from '../components/SimBar';
import { describeScenario } from '../engine';
import { signedPct } from './format';
import { useModel, useScenario } from './modelContext';
import { teamResult } from './results';

/** The gold what-if banner (with Reset) shown while a what-if is active, plus the simulation progress bar. */
export function ScenarioBar() {
  const { model, engine } = useModel();
  const { scenario, active, reset, base, live, running, frac } = useScenario();
  if (!model || !engine) return null;
  const words = active ? describeScenario(model, scenario).join('; ') : '';
  const chip = (() => {
    if (!active || !live) return undefined;
    const d = teamResult(model, live, engine.meRid).playoff - teamResult(model, base, engine.meRid).playoff;
    return {
      text: `playoffs ${Math.round(teamResult(model, live, engine.meRid).playoff * 100)}% (${signedPct(d)})`,
      tone: d > 0.005 ? 'up' as const : d < -0.005 ? 'down' as const : 'flat' as const,
    };
  })();
  return (
    <>
      {active && <ScenarioBanner what={words} chip={chip} onReset={reset} />}
      <SimBar running={running} frac={frac} runs={model.meta.simRuns} />
    </>
  );
}
