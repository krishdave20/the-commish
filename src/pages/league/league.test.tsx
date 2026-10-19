import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DataProvider } from '../../app/DataProvider';
import { ModelProvider } from '../../app/ModelProvider';
import { ScenarioProvider } from '../../app/ScenarioProvider';
import { league } from '../../engine/power/test-helpers';
import { createFakeAccountStore, createFakeApi, createFakeSleeper, sampleAccount, sampleLoadModel } from '../../test/fakes';
import AroundLeague from '../AroundLeague';
import LeagueRace from '../LeagueRace';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** The power-ranking test league (six teams, four finished weeks) with records and this week's games: 1–6, 2–5, 3–4. */
const model = () => {
  const m = league();
  m.meta.leagueId = 'L1';
  for (const t of m.teams) { t.wins = t.rid <= 3 ? 3 : 1; t.losses = 4 - t.wins; t.pf = 300 + 10 * t.rid; }
  m.games = [[1, 6], [2, 5], [3, 4]].map(([a, b]) => ({ id: `w5-${a}-${b}`, week: 5, teamA: a!, teamB: b! }));
  return m;
};

function renderPage(route = '/league') {
  const user = userEvent.setup();
  render(
    <DataProvider api={createFakeApi()} accounts={createFakeAccountStore([sampleAccount()])} sleeper={createFakeSleeper()}>
      <ModelProvider loadModel={sampleLoadModel(model)}>
        <ScenarioProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes><Route path="/league" element={<AroundLeague />} /><Route path="/race" element={<LeagueRace />} /></Routes>
          </MemoryRouter>
        </ScenarioProvider>
      </ModelProvider>
    </DataProvider>,
  );
  return user;
}

const bodyRows = (name: string) => within(screen.getByRole('table', { name })).getAllByRole('row').slice(1);

describe('around the league', () => {
  it('opens on the standings: every team in order, with its streak', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'around the league' })).toBeInTheDocument();
    const rows = bodyRows('League standings');
    expect(rows).toHaveLength(6);
    // 3 wins each for teams 1–3, then points for: 3, 2, 1
    expect(rows.map((r) => r.querySelector('.pname')?.textContent)).toEqual(['Team 3', 'Team 2', 'Team 1', 'Team 6', 'Team 5', 'Team 4']);
    expect(within(rows[2]!).getByText('L2')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Around the league' })).toHaveTextContent('your power rank');
  });

  it('projects the standings after this week from each game’s win chance', async () => {
    const user = renderPage();
    await screen.findByRole('table', { name: 'League standings' });
    await user.click(screen.getByRole('radio', { name: 'after this week' }));
    expect(screen.getByRole('heading', { level: 2, name: 'after week 5' })).toBeInTheDocument();
    const rows = bodyRows('Projected standings after this week');
    expect(rows).toHaveLength(6);
    // team 1 (the weakest roster) plays team 6 (the strongest): team 6 is favoured and its projected record gains the win
    const six = rows.find((r) => r.querySelector('.pname')?.textContent === 'Team 6')!;
    expect(six).toHaveTextContent('vs Team 1');
    expect(six).toHaveTextContent('2–3');
  });

  it('rates every team and links to the week-by-week power rankings', async () => {
    const user = renderPage('/league?tab=ratings');
    await screen.findByRole('heading', { level: 2, name: 'team ratings' });
    expect(bodyRows('Team ratings and power rankings')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'week by week →' })).toHaveAttribute('href', '/league?tab=power');
    await user.click(screen.getByRole('radio', { name: 'form & schedule' }));
    expect(bodyRows('Form, schedule left and bench points')).toHaveLength(6);
  });

  it('holds the weekly power rankings, and the playoff picture’s old power link (with its week) lands here', async () => {
    renderPage('/race?tab=power&week=4');
    expect(await screen.findByRole('heading', { level: 1, name: 'around the league' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'week 4 power rankings' })).toBeInTheDocument();
    expect(within(screen.getByRole('radiogroup', { name: 'Around the league sections' })).getByRole('radio', { name: 'power rankings' })).toBeChecked();
  });
});
