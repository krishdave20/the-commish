import { createContext, useContext } from 'react';
import type { AccountStore, DataApi, NflverseClient, SleeperClient } from '../data';
import type { ResourceStore } from './resourceStore';

export interface AccountsBridge {
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
}

export interface DataContextValue {
  api: DataApi;
  accounts: AccountStore;
  /** the raw Sleeper client the engine pulls through (null in tests that inject a model directly) */
  sleeper: SleeperClient | null;
  /** the nightly nflverse files (null when there is no source) */
  nflverse: NflverseClient | null;
  store: ResourceStore;
  bridge: AccountsBridge;
}

export const DataContext = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const v = useContext(DataContext);
  if (!v) throw new Error('DataProvider is missing');
  return v;
}

/** Make a version counter that bumps whenever the AccountStore changes, so React can subscribe
    without depending on list() returning a stable array. */
export function createAccountsBridge(accounts: AccountStore): AccountsBridge {
  let version = 0;
  let unsub: (() => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    getVersion: () => version,
    subscribe: (listener) => {
      listeners.add(listener);
      if (!unsub) {
        // a change may have happened while nobody was listening
        version++;
        unsub = accounts.subscribe(() => {
          version++;
          for (const l of listeners) l();
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && unsub) {
          unsub();
          unsub = null;
        }
      };
    },
  };
}
