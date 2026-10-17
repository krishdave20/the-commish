import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AccountStore, DataApi, NflverseClient, SleeperClient } from './data';
import { AppShell } from './app/AppShell';
import { DataProvider } from './app/DataProvider';
import { ModelProvider } from './app/ModelProvider';
import { ScenarioProvider } from './app/ScenarioProvider';
import type { LoadModel } from './app/loadModel';
import Method from './pages/Method';
import Draft from './pages/Draft';
import Home from './pages/Home';
import LeagueRace from './pages/LeagueRace';
import MyTeam from './pages/MyTeam';
import PlayerProfile from './pages/PlayerProfile';
import Players from './pages/Players';
import Settings from './pages/Settings';
import SignIn from './pages/SignIn';
import Takes from './pages/Takes';
import Trades from './pages/Trades';
import Waivers from './pages/Waivers';

/** Every route, without a router, so tests can mount it in a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="/takes" element={<Takes />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:pid" element={<PlayerProfile />} />
        <Route path="/team" element={<MyTeam />} />
        <Route path="/race" element={<LeagueRace />} />
        <Route path="/waivers" element={<Waivers />} />
        <Route path="/trades" element={<Trades />} />
        <Route path="/draft" element={<Draft />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/method" element={<Method />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

interface Props {
  api: DataApi;
  accounts: AccountStore;
  sleeper?: SleeperClient;
  nflverse?: NflverseClient;
  /** tests inject a model loader */
  loadModel?: LoadModel;
}

export function App({ api, accounts, sleeper, nflverse, loadModel }: Props) {
  return (
    <DataProvider api={api} accounts={accounts} sleeper={sleeper} nflverse={nflverse}>
      <ModelProvider loadModel={loadModel}>
        <ScenarioProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ScenarioProvider>
      </ModelProvider>
    </DataProvider>
  );
}
