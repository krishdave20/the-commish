import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveMaybe } from './live/liveContext';
import { parsePreviewPhase } from './huddlePhase';
import { useMoments } from './moments/momentsContext';
import { fixedOrder, navOrder } from './navOrder';
import type { NavOrder } from './navOrder';
import { NAV } from './routes';
import { usePrefs } from './usePrefs';

/** The section order for right now: the moments, the clock (the `?now=` preview included) and the phase (the huddle's `?phase=` preview
    included) through `navOrder`, or the fixed order when "smart order" is off. */
export function useNavOrder(): NavOrder {
  const { smartNav } = usePrefs();
  const { moments, ctx, now: momentsNow, previewing } = useMoments();
  // before there is a league the moments carry no clock; the order then reads the real one
  const [fallbackNow] = useState(() => Date.now());
  const now = momentsNow || fallbackNow;
  // a `?now=` preview is a different time of week: the real games on screen say nothing about it, the moments do
  const live = (useLiveMaybe()?.live ?? false) && !previewing;
  const { search } = useLocation();
  if (!smartNav) return fixedOrder(NAV);
  const phase = parsePreviewPhase(new URLSearchParams(search).get('phase')) ?? ctx?.phase ?? null;
  return navOrder({ phase, now, live, moments, sections: NAV });
}
