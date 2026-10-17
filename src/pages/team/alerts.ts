import { formatPoints1, signed } from '../../app/format';
import type { ChecklistItem } from '../../components/Checklist';
import type { Engine, ModelPlayer, Scenario } from '../../engine';

/** What to change in Sleeper this week, from the best lineup versus the one set there (the Locker Room's start/sit
    alerts, shared with the huddle). Pass the settled scenario so a half-typed what-if does not thrash the list. */
export function lineupAlerts(engine: Engine, settled: Scenario): ChecklistItem[] {
  const { currentWeek: cur } = engine.model.meta;
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
}

/** The best waiver adds as to-do lines (rest of season). */
export function waiverAlerts(engine: Engine, settled: Scenario, n = 2): ChecklistItem[] {
  const board = engine.waivers(settled, 'reg');
  return board.list.slice(0, n).map((x): ChecklistItem => ({
    id: `wv-${x.pid}`, done: false,
    label: `consider adding ${x.player.name} for ${x.drop.name} (${signed(x.gain)} points, bid $${x.bid} if he’s on waivers)`,
  }));
}
