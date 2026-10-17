import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { AccountStore, DataApi, NflverseClient, SleeperClient } from '../data';
import { DataContext, createAccountsBridge } from './dataContext';
import type { DataContextValue } from './dataContext';
import { loadPrefs } from './prefs';
import { ResourceStore } from './resourceStore';

interface Props {
  api: DataApi;
  accounts: AccountStore;
  sleeper?: SleeperClient;
  nflverse?: NflverseClient;
  children: ReactNode;
}

/** Gives the whole app its DataApi and AccountStore. Tests pass fakes; main.tsx passes the real factories. */
export function DataProvider({ api, accounts, sleeper, nflverse, children }: Props) {
  const value = useMemo<DataContextValue>(
    () => ({
      api,
      accounts,
      sleeper: sleeper ?? null,
      nflverse: nflverse ?? null,
      store: new ResourceStore({ autoRefreshOnOpen: () => loadPrefs().autoRefresh }),
      bridge: createAccountsBridge(accounts),
    }),
    [api, accounts, sleeper, nflverse],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
