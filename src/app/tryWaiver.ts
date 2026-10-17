import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { WaiverEntry } from '../engine';
import { useScenario } from './modelContext';

/** The waiver wire's "try": add him, drop the suggested player, and open the Locker Room to see the lab. */
export function useTryWaiver(): (w: WaiverEntry) => void {
  const { setScenario } = useScenario();
  const navigate = useNavigate();
  return useCallback((w: WaiverEntry) => {
    setScenario((s) => ({
      ...s,
      adds: s.adds.includes(w.pid) ? s.adds : [...s.adds, w.pid],
      drops: s.drops.includes(w.drop.pid) ? s.drops : [...s.drops, w.drop.pid],
      pins: s.pins.filter((x) => x !== w.drop.pid),
    }));
    navigate('/team');
  }, [setScenario, navigate]);
}
