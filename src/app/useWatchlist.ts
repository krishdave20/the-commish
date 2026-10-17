import { useCallback, useSyncExternalStore } from 'react';
import { getWatchlist, subscribeWatchlist, toggleWatch } from './watchlist';

export function useWatchlist() {
  const list = useSyncExternalStore(subscribeWatchlist, getWatchlist, () => []);
  const has = useCallback((pid: string) => list.includes(pid), [list]);
  return { list, has, toggle: toggleWatch };
}
