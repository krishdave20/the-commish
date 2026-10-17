import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach } from 'vitest';
import { AppRoutes } from '../App';
import { createFakeAccountStore, createFakeApi, createFakeNflverse, createFakeSleeper, sampleLoadModel } from '../test/fakes';
import type { FakeAccountStore, FakeApi } from '../test/fakes';
import type { LinkedAccount } from '../data';
import { DataProvider } from './DataProvider';
import type { LoadModel } from './loadModel';
import { ModelProvider } from './ModelProvider';
import { ScenarioProvider } from './ScenarioProvider';

// vitest runs without globals, so Testing Library cannot register its own cleanup
afterEach(cleanup);

interface Options {
  api?: FakeApi;
  accounts?: FakeAccountStore;
  sleeper?: ReturnType<typeof createFakeSleeper>;
  /** pass true for the sample nightly nflverse bundle */
  nflverse?: boolean;
  /** linked accounts to start with (the first is active) */
  linked?: LinkedAccount[];
  route?: string;
  /** how the engine model is built; default is the sample league */
  loadModel?: LoadModel;
}

/** Mount the whole app in a MemoryRouter with fakes. */
export function renderApp(opts: Options = {}) {
  const api = opts.api ?? createFakeApi();
  const accounts = opts.accounts ?? createFakeAccountStore(opts.linked ?? []);
  const sleeper = opts.sleeper ?? createFakeSleeper();
  const user = userEvent.setup();
  const utils = render(
    <DataProvider api={api} accounts={accounts} sleeper={sleeper} nflverse={opts.nflverse ? createFakeNflverse() : undefined}>
      <ModelProvider loadModel={opts.loadModel ?? sampleLoadModel()}>
        <ScenarioProvider>
          <MemoryRouter initialEntries={[opts.route ?? '/']}>
            <AppRoutes />
          </MemoryRouter>
        </ScenarioProvider>
      </ModelProvider>
    </DataProvider>,
  );
  return { api, accounts, sleeper, user, ...utils };
}
