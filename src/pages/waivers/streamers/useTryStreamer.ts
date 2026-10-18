import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useScenario } from '../../../app/modelContext';
import type { ModelPlayer } from '../../../engine';

/** The streamers' "try": add him to the what-if (and drop the suggested player when the wire has one), then open the Locker Room. */
export function useTryStreamer(): (player: ModelPlayer, drop?: ModelPlayer | null) => void {
  const { setScenario } = useScenario();
  const navigate = useNavigate();
  return useCallback((player, drop) => {
    setScenario((s) => ({
      ...s,
      adds: s.adds.includes(player.pid) ? s.adds : [...s.adds, player.pid],
      drops: drop && !s.drops.includes(drop.pid) ? [...s.drops, drop.pid] : s.drops,
      pins: drop ? s.pins.filter((x) => x !== drop.pid) : s.pins,
    }));
    navigate('/team');
  }, [setScenario, navigate]);
}
