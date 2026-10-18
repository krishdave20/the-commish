import { useMemo } from 'react';
import { formatPoints1 } from '../../app/format';
import { useScenario } from '../../app/modelContext';
import { useDebounced } from '../../app/useSimulation';
import { CountUp } from '../../components/CountUp';
import { HeadlineStrip } from '../../components/HeadlineStrip';
import type { Engine } from '../../engine';
import { useMatchup } from '../home/useMatchup';
import { lineupAlerts } from './alerts';

/** The locker room's answer: this week's projected points, your win chance and whether the lineup in Sleeper needs a change. */
export function TeamStrip({ engine }: { engine: Engine }) {
  const { scenario } = useScenario();
  const settled = useDebounced(scenario, 250);
  const cur = engine.model.meta.currentWeek;
  const m = useMatchup(engine);

  const week = useMemo(() => {
    const scope = engine.scope(scenario);
    const L = scope.lineup(scope.myRoster(), cur, true);
    let lo = 0, hi = 0;
    for (const s of L.slots) if (s.p) { const [a, b] = scope.range(s.p, cur, true); lo += a; hi += b; }
    return { total: L.total, lo, hi };
  }, [engine, scenario, cur]);
  const alerts = useMemo(() => lineupAlerts(engine, settled), [engine, settled]);

  return (
    <HeadlineStrip label="This week" items={[
      { label: 'projected points', value: <span><CountUp value={Number(formatPoints1(week.total))} decimals={1} /></span>, sub: `week ${cur}, floor ${formatPoints1(week.lo)} to ceiling ${formatPoints1(week.hi)}` },
      m
        ? { label: 'win chance', value: <span><CountUp value={Math.round(m.p * 100)} />%</span>, sub: `vs ${m.opp.team}, ${formatPoints1(m.mine)} to ${formatPoints1(m.theirs)}` }
        : { label: 'win chance', value: <span>—</span>, sub: 'no matchup this week' },
      {
        label: 'lineup status',
        value: <span className={alerts.length ? 'gold-c' : 'pos-c'}>{alerts.length ? alerts.length : 'set'}</span>,
        sub: alerts.length ? `${alerts.length === 1 ? 'change' : 'changes'} to make before kickoff` : 'your lineup is already set right',
      },
    ]} />
  );
}

