import { useLiveMaybe } from '../../app/live/liveContext';
import { useTickerCollapsed } from './useTickerPref';

/** What the shell needs to size itself: whether the ticker is on screen, and whether it is folded. */
export function useTickerMode(): 'off' | 'on' | 'collapsed' {
  const live = useLiveMaybe();
  const [collapsed] = useTickerCollapsed();
  if (!live || !live.available || !live.view || live.view.matchups.length === 0) return 'off';
  return collapsed ? 'collapsed' : 'on';
}
