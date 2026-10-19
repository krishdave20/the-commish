import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DataProvider } from '../../../app/DataProvider';
import { ModelProvider } from '../../../app/ModelProvider';
import { ScenarioProvider } from '../../../app/ScenarioProvider';
import LeagueRace from '../../LeagueRace';
import { createFakeAccountStore, createFakeApi, createFakeSleeper } from '../../../test/fakes';
import type { LoadModel } from '../../../app/loadModel';
import { buildPowerRankings, bumpData } from '../../../engine/power';
import { league } from '../../../engine/power/test-helpers';
import { sampleAccount, sampleLoadModel } from '../../../test/fakes';
import { BumpChart } from './BumpChart';
import { describeSeries } from './describe';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const linked = [sampleAccount()];
const model = () => { const m = league(); m.meta.leagueId = 'L1'; return m; };

/** The playoff picture page in the app's providers (not the whole router, so the test does not depend on other pages). */
function renderRace(route: string, loadModel: LoadModel) {
  const user = userEvent.setup();
  const utils = render(
    <DataProvider api={createFakeApi()} accounts={createFakeAccountStore(linked)} sleeper={createFakeSleeper()}>
      <ModelProvider loadModel={loadModel}>
        <ScenarioProvider>
          <MemoryRouter initialEntries={[route]}><LeagueRace /></MemoryRouter>
        </ScenarioProvider>
      </ModelProvider>
    </DataProvider>,
  );
  return { user, ...utils };
}

async function ready(route = '/race?tab=power') {
  const r = renderRace(route, sampleLoadModel(model));
  await screen.findByRole('heading', { level: 2, name: /power rankings/ });
  return r;
}
const rows = () => [...document.querySelectorAll<HTMLElement>('.pw-row')];
const rankings = buildPowerRankings(model());

describe('the power rankings tab', () => {
  it('is a tab of the playoff picture and opens on the current week', async () => {
    await ready();
    const tabs = screen.getByRole('radiogroup', { name: 'Playoff picture sections' });
    expect(within(tabs).getByRole('radio', { name: 'power rankings' })).toBeChecked();
    expect(screen.getByRole('heading', { level: 2, name: 'week 5 power rankings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'rank by week' })).toBeInTheDocument();
  });

  it('lists every team in rank order with its record, index and line', async () => {
    await ready();
    const now = rankings.weeks[rankings.weeks.length - 1]!;
    expect(rows()).toHaveLength(6);
    expect(rows().map((r) => r.getAttribute('data-rid'))).toEqual(now.teams.map((t) => String(t.rid)));
    for (const [i, t] of now.teams.entries()) {
      const row = rows()[i]!;
      expect(within(row).getByText(t.team)).toBeInTheDocument();
      expect(row).toHaveTextContent(t.line);
      expect(row).toHaveTextContent(t.index.toFixed(1));
      expect(row).toHaveTextContent(`${t.record.w}–${t.record.l}`);
    }
  });

  it('marks your team and gives it the highlighted row', async () => {
    await ready();
    const mine = rows().filter((r) => r.hasAttribute('data-me'));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toHaveTextContent('Team 1');
    expect(within(mine[0]!).getByText('you')).toBeInTheDocument();
  });

  it('shows the movement with words for screen readers: up, down, no change', async () => {
    await ready();
    await screen.findByRole('radio', { name: '4' });
    fireEvent.click(screen.getByRole('radio', { name: '4' }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'week 4 power rankings' })).toBeInTheDocument());
    const byTeam = (n: string) => rows().find((r) => within(r).queryByText(n))!;
    expect(within(byTeam('Team 3')).getByText('up 1')).toBeInTheDocument();
    expect(within(byTeam('Team 2')).getByText('down 1')).toBeInTheDocument();
    expect(within(byTeam('Team 1')).getByText('no change')).toBeInTheDocument();
    // the visible marks
    expect(byTeam('Team 3').querySelector('.pw-move')).toHaveAttribute('data-dir', 'up');
    expect(byTeam('Team 3').querySelector('.pw-move [aria-hidden]')).toHaveTextContent('↑1');
    expect(byTeam('Team 2').querySelector('.pw-move')).toHaveAttribute('data-dir', 'down');
    expect(byTeam('Team 2').querySelector('.pw-move [aria-hidden]')).toHaveTextContent('↓1');
    expect(byTeam('Team 1').querySelector('.pw-move [aria-hidden]')).toHaveTextContent('—');
  });

  it('the headline names the riser and the faller of the week', async () => {
    await ready('/race?tab=power&week=4');
    await screen.findByRole('heading', { level: 2, name: 'week 4 power rankings' });
    const head = document.querySelector('.pw-head') as HTMLElement;
    const riser = within(head).getByText('riser').parentElement!;
    const faller = within(head).getByText('faller').parentElement!;
    expect(riser).toHaveTextContent('Team 3');
    expect(riser).toHaveTextContent('3rd to 2nd');
    expect(faller).toHaveTextContent('Team 2');
    expect(head).toHaveTextContent('1st'); // you
  });

  it('the week selector lists the weeks and shows a past week\'s rankings; the URL keeps the choice', async () => {
    const { user } = await ready();
    const group = screen.getByRole('radiogroup', { name: 'Power rankings week' });
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual(['2', '3', '4', '5']);
    expect(within(group).getByRole('radio', { name: '5' })).toBeChecked();
    await user.click(within(group).getByRole('radio', { name: '3' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'week 3 power rankings' })).toBeInTheDocument();
    const w3 = rankings.weeks.find((w) => w.week === 3)!;
    expect(rows().map((r) => r.getAttribute('data-rid'))).toEqual(w3.teams.map((t) => String(t.rid)));
    expect(screen.getByText(/results only, through week 2/)).toBeInTheDocument();
    await user.click(within(group).getByRole('radio', { name: '5' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'week 5 power rankings' })).toBeInTheDocument();
    expect(screen.getByText(/plus rosters/)).toBeInTheDocument();
  });

  it('the first week has no movement and says so', async () => {
    await ready('/race?tab=power&week=2');
    await screen.findByRole('heading', { level: 2, name: 'week 2 power rankings' });
    expect(screen.getAllByText('first rankings').length).toBeGreaterThanOrEqual(2);
  });

  it('draws a bump chart with a line per team, yours highlighted, and reads a team out on hover', async () => {
    await ready();
    const lines = [...document.querySelectorAll<SVGGElement>('.pw-line')];
    expect(lines).toHaveLength(6);
    expect(lines.filter((l) => l.dataset.state === 'focus')).toHaveLength(1);
    expect(document.querySelector('.pw-line[data-state="focus"]')).toHaveAttribute('data-me', 'true');
    expect(screen.getByRole('group', { name: /rank by week for 6 teams/ })).toBeInTheDocument();
    const other = lines.find((l) => l.dataset.rid === '4')!;
    fireEvent.mouseEnter(other);
    expect(other.dataset.state).toBe('focus');
    expect(document.querySelector('.pw-line[data-rid="1"]')).toHaveAttribute('data-state', 'me');
    expect(document.querySelector('.pw-read')).toHaveTextContent(/Team 4: .*weeks 2 to 5/);
    // the list row follows
    expect(document.querySelector('.pw-row[data-rid="4"]')).toHaveAttribute('data-active', 'true');
    fireEvent.mouseLeave(document.querySelector('svg[role="group"]')!);
    expect(document.querySelector('.pw-line[data-rid="1"]')).toHaveAttribute('data-state', 'focus');
  });

  it('a tap (click or Enter) on a line or a team in the list keeps it highlighted', async () => {
    const { user } = await ready();
    const line = document.querySelector<SVGGElement>('.pw-line[data-rid="5"]')!;
    fireEvent.click(line);
    expect(line).toHaveAttribute('aria-pressed', 'true');
    fireEvent.mouseLeave(document.querySelector('svg[role="group"]')!);
    expect(line.dataset.state).toBe('focus');
    // tapping again lets go
    fireEvent.click(line);
    expect(line).toHaveAttribute('aria-pressed', 'false');
    // from the list
    await user.click(within(document.querySelector('.pw-row[data-rid="6"]') as HTMLElement).getByRole('button'));
    expect(document.querySelector('.pw-line[data-rid="6"]')).toHaveAttribute('data-state', 'focus');
    // from the keyboard (the pointer has left the list)
    fireEvent.mouseLeave(document.querySelector('.pw-row[data-rid="6"]')!);
    const l2 = document.querySelector<SVGGElement>('.pw-line[data-rid="2"]')!;
    fireEvent.keyDown(l2, { key: 'Enter' });
    expect(l2).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives each team two player headshot slots in the list', async () => {
    await ready();
    for (const row of rows()) expect(row.querySelectorAll('.avatar-stack .avatar').length).toBeGreaterThanOrEqual(1);
  });

  it('says so when there are no rankings yet', async () => {
    const m = league({ points: [], cur: 1 });
    m.meta.leagueId = 'L1';
    renderRace('/race?tab=power', sampleLoadModel(() => m));
    expect(await screen.findByText(/first power rankings arrive once week 1 is final/)).toBeInTheDocument();
  });
});

describe('BumpChart', () => {
  const data = bumpData(rankings);
  const noop = () => {};
  it('draws one path per team plus its hit area, and a dot per team per week', () => {
    const { container } = renderChart();
    expect(container.querySelectorAll('.pw-line')).toHaveLength(6);
    expect(container.querySelectorAll('.pw-stroke')).toHaveLength(6);
    expect(container.querySelectorAll('.pw-dot')).toHaveLength(6 * 4);
  });
  it('with reduced motion (or no way to tell) the lines are drawn at once, with no transition', () => {
    const { container } = renderChart();
    for (const p of container.querySelectorAll<SVGPathElement>('.pw-stroke')) {
      expect(p.style.strokeDashoffset).toBe('0');
      expect(p.style.transition).toBe('');
    }
  });
  it('names each line for a screen reader with its ranks by week', () => {
    const s = data.series[0]!;
    expect(describeSeries(s)).toBe(`${s.team}: ${s.points.map((p) => `${p.rank}${['th', 'st', 'nd', 'rd'][p.rank] ?? 'th'}`).join(', ')} (weeks 2 to 5)`);
    const { container } = renderChart();
    expect(container.querySelector(`.pw-line[data-rid="${s.rid}"]`)).toHaveAttribute('aria-label', describeSeries(s));
  });
  it('waits for two weeks before drawing', () => {
    const one = bumpData({ weeks: [rankings.weeks[0]!], currentWeek: 2 });
    const { container } = renderChart(one);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText(/two weeks of rankings/)).toBeInTheDocument();
  });
  function renderChart(d = data) {
    return render(<BumpChart data={d} meRid={1} activeRid={null} selectedWeek={5} onHover={noop} onPick={noop} />);
  }
});

