import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { emptyScenario } from '../engine';
import type { Engine, ModelPlayer } from '../engine';
import type { Take } from '../takes/types';
import { useModel, useScenario } from './modelContext';

/** The cheapest player on my roster over the rest of the regular season: who a new add would replace when the waiver wire has no say. */
function cheapestOnRoster(engine: Engine): ModelPlayer | null {
  const scope = engine.scope(emptyScenario());
  const { currentWeek: cur, lastRegularWeek: last } = engine.model.meta;
  let best: { p: ModelPlayer; v: number } | null = null;
  for (const id of scope.myRoster()) {
    const p = scope.idx.P[id];
    if (!p || p.onIr) continue;
    let v = 0;
    for (let w = cur; w <= Math.max(cur, last); w++) v += scope.val(p, w, true);
    if (!best || v < best.v) best = { p, v };
  }
  return best?.p ?? null;
}

/** "try in the lab" for a take: a player who is not on my team is added (and the waiver board's best drop, else my cheapest
    player, goes); one on my team is pinned to my lineup when the take is good news and benched when it is bad, and a
    "watch" take just opens the lab. Always ends on the Locker Room, where the lab lives. */
export function useTryInLab(): (take: Take) => void {
  const { engine } = useModel();
  const { setScenario } = useScenario();
  const navigate = useNavigate();
  return useCallback((take: Take) => {
    if (!engine) { navigate('/team'); return; }
    const mp = engine.model.players.find((p) => p.pid === take.pid);
    const mine = !!mp && mp.ownerRid === engine.meRid;
    if (mine) {
      if (take.tone === 'good') setScenario((s) => ({ ...s, pins: s.pins.includes(take.pid) ? s.pins : [...s.pins, take.pid], benches: s.benches.filter((x) => x !== take.pid) }));
      else if (take.tone === 'bad') setScenario((s) => ({ ...s, benches: s.benches.includes(take.pid) ? s.benches : [...s.benches, take.pid], pins: s.pins.filter((x) => x !== take.pid) }));
    } else if (mp) {
      const drop = engine.waivers(emptyScenario(), 'reg').list.find((w) => w.pid === take.pid)?.drop ?? cheapestOnRoster(engine);
      setScenario((s) => ({
        ...s,
        adds: s.adds.includes(take.pid) ? s.adds : [...s.adds, take.pid],
        drops: drop && !s.drops.includes(drop.pid) ? [...s.drops, drop.pid] : s.drops,
        pins: drop ? s.pins.filter((x) => x !== drop.pid) : s.pins,
      }));
    }
    navigate('/team');
  }, [engine, setScenario, navigate]);
}
