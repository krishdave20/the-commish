import { useMemo } from 'react';
import type { TrendingRow } from '../data';
import { useData } from './dataContext';
import { useResource } from './hooks';
import type { Resource } from './hooks';
import type { Fetcher } from './resourceStore';

const empty = (): Promise<never> => Promise.reject(new Error('Sleeper’s trending list is not connected.'));

/** The 24-hour trending adds (`sleeper.trending('add', 24)`), shared through the resource store. Missing data is just `undefined`. */
export function useTrendingAdds(): Resource<TrendingRow[]> {
  const { sleeper } = useData();
  const fetcher = useMemo<Fetcher<TrendingRow[]> | null>(
    () => (sleeper ? (o) => (typeof sleeper.trending === 'function' ? sleeper.trending('add', 24, 50, o) : empty()) : null),
    [sleeper],
  );
  return useResource('sleeper-trending-add-24', fetcher);
}
