import { lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { AccountStore, DataApi, NflverseClient, SleeperClient } from './data';
import { AppShell } from './app/AppShell';
import { DataProvider } from './app/DataProvider';
import { ModelProvider } from './app/ModelProvider';
import { ScenarioProvider } from './app/ScenarioProvider';
import type { LoadModel } from './app/loadModel';
const Method = lazy(() => import('./pages/Method'));
const Draft = lazy(() => import('./pages/Draft'));
const GameDay = lazy(() => import('./pages/GameDay'));
import Home from './pages/Home';
const LeagueRace = lazy(() => import('./pages/LeagueRace'));
const MyTeam = lazy(() => import('./pages/MyTeam'));
const Nfl = lazy(() => import('./pages/Nfl'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const Players = lazy(() => import('./pages/Players'));
const Settings = lazy(() => import('./pages/Settings'));
import SignIn from './pages/SignIn';
const Takes = lazy(() => import('./pages/Takes'));
const Trades = lazy(() => import('./pages/Trades'));
const Waivers = lazy(() => import('./pages/Waivers'));

/* Every page but the huddle (the first screen) and check in is its own chunk, fetched when its route opens, so a phone on a slow
   connection downloads and parses only what it shows. The shell holds the loading state (AppShell.tsx). */

/** Every route, without a router, so tests can mount it in a MemoryRouter. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="/gameday" element={<GameDay />} />
        <Route path="/nfl" element={<Nfl />} />
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
